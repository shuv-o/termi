/**
 * SSH Connection Handler
 *
 * Manages an SSH connection. Output is written to an SSHOutputSink rather than
 * a WebSocket directly, so the sink can be swapped when a browser reconnects.
 * WebSocket message routing (data/resize/ping) lives in index.ts.
 */

import { Client, ClientChannel } from 'ssh2';
import { TokenPayload } from '../auth/token.js';
import { connectSSH } from './jump.js';
import { ForwardedAgent } from './agent.js';

/** How long a key-use prompt waits for the user before denying. */
const AGENT_PROMPT_TIMEOUT_MS = 60_000;
import { HOST_KEY_MISMATCH } from '../auth/host-key.js';

export interface SSHOutputSink {
    /** Called with a raw chunk of SSH output bytes. */
    onData(data: Buffer): void;
    /** Called with structured control messages (shell-ready, disconnected, error, closed). */
    onMessage(type: string, extra?: Record<string, unknown>): void;
}

export class SSHHandler {
    private ssh: Client;
    private stream: ClientChannel | null = null;
    private connected = false;
    private closing = false;
    private sink: SSHOutputSink;
    /** Key-use prompts waiting for an answer, by id. */
    private agentPrompts = new Map<string, (allow: boolean) => void>();
    private agentAllowedForSession = false;

    constructor(token: TokenPayload, sink: SSHOutputSink) {
        this.sink = sink;
        this.ssh = new Client();
        this.setupSSH(token);
    }

    /** Forward terminal input from browser to the SSH stream. */
    write(data: Buffer): void {
        if (this.stream) {
            this.stream.write(data);
        }
    }

    /** Forward terminal resize from browser to the SSH stream. */
    resize(rows: number, cols: number): void {
        if (this.stream) {
            this.stream.setWindow(rows, cols, 0, 0);
        }
    }

    /**
     * Ask the browser whether the server may use a forwarded key. Denied when
     * nobody answers in time (including while no browser is attached).
     */
    private askToUseKey(req: { comment: string; fingerprint: string }): Promise<boolean> {
        if (this.agentAllowedForSession) return Promise.resolve(true);
        const id = Math.random().toString(36).slice(2, 12);
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.agentPrompts.delete(id);
                this.sink.onMessage('agent-request-expired', { id });
                resolve(false);
            }, AGENT_PROMPT_TIMEOUT_MS);
            this.agentPrompts.set(id, (allow) => {
                clearTimeout(timer);
                this.agentPrompts.delete(id);
                resolve(allow);
            });
            this.sink.onMessage('agent-request', { id, ...req });
        });
    }

    /** The user's answer to a key-use prompt. */
    answerAgentRequest(id: unknown, allow: unknown, forSession: unknown): void {
        if (typeof id !== 'string') return;
        const resolve = this.agentPrompts.get(id);
        if (!resolve) return;
        if (allow === true && forSession === true) this.agentAllowedForSession = true;
        resolve(allow === true);
    }

    public close(): void {
        if (this.closing) return;
        this.closing = true;
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
        if (this.ssh) {
            this.ssh.end();
        }
        this.connected = false;
        for (const resolve of this.agentPrompts.values()) resolve(false);
        this.agentPrompts.clear();
    }

    public isConnected(): boolean {
        return this.connected;
    }

    private setupSSH(token: TokenPayload): void {
        const config: Parameters<Client['connect']>[0] = {
            host: token.host,
            port: token.port,
            username: token.username,
            readyTimeout: 10000,
            keepaliveInterval: 15000,
            keepaliveCountMax: 6,
            // Widen algorithm support for legacy devices (e.g. Cisco IOS/IOS-XE) whose
            // SSH implementations predate modern defaults and only advertise older kex,
            // host-key, cipher, and MAC algorithms that ssh2 v1.x drops from its defaults.
            algorithms: {
                kex: [
                    'ecdh-sha2-nistp256',
                    'ecdh-sha2-nistp384',
                    'ecdh-sha2-nistp521',
                    'diffie-hellman-group-exchange-sha256',
                    'diffie-hellman-group14-sha256',
                    'diffie-hellman-group14-sha1',
                    'diffie-hellman-group1-sha1',
                ],
                // serverHostKey is set by applyHostKeyCheck (one list on web and gateway,
                // so both negotiate the same key type and see the same fingerprint).
                cipher: [
                    'aes128-gcm@openssh.com',
                    'aes256-gcm@openssh.com',
                    'aes256-ctr',
                    'aes192-ctr',
                    'aes128-ctr',
                    'aes256-cbc',
                    'aes192-cbc',
                    'aes128-cbc',
                    '3des-cbc',
                ],
                hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
            },
        };

        if (token.privateKey) {
            config.privateKey = token.privateKey;
            if (token.passphrase) config.passphrase = token.passphrase;
        } else if (token.password) {
            config.password = token.password;
        }

        const agent =
            token.agent && token.agent.keys.length
                ? new ForwardedAgent(
                      token.agent.keys,
                      token.agent.mode === 'confirm' ? (req) => this.askToUseKey(req) : undefined,
                  )
                : null;
        if (agent?.size) {
            config.agent = agent;
            config.agentForward = true;
            // ssh2 would otherwise also try logging in with the agent's keys.
            config.authHandler = config.privateKey ? ['publickey'] : ['password'];
        }

        this.ssh.on('ready', () => {
            this.connected = true;
            // With config.agentForward set, ssh2 requests forwarding for the shell.
            this.ssh.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
                if (err) {
                    this.sink.onMessage('error', {
                        message: 'Failed to open shell: ' + err.message,
                    });
                    this.close();
                    return;
                }
                this.stream = stream;
                this.sink.onMessage('shell-ready');

                stream.on('data', (data: Buffer) => {
                    this.sink.onData(data);
                });

                stream.stderr.on('data', (data: Buffer) => {
                    this.sink.onData(data);
                });

                stream.on('close', () => {
                    this.sink.onMessage('closed');
                    this.close();
                });
            });
        });

        this.ssh.on('error', (err) => {
            this.sink.onMessage('error', {
                message: 'SSH error: ' + err.message,
                ...((err as { code?: unknown }).code === HOST_KEY_MISMATCH && {
                    code: HOST_KEY_MISMATCH,
                }),
            });
            this.close();
        });

        this.ssh.on('close', () => {
            this.sink.onMessage('disconnected');
        });

        try {
            connectSSH(this.ssh, config, token.jump, token.hostKey, token.certificate);
        } catch (error) {
            this.sink.onMessage('error', {
                message: 'Connection failed: ' + (error as Error).message,
            });
            this.close();
        }
    }
}
