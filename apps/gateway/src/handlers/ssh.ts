/**
 * SSH Connection Handler
 *
 * Manages an SSH connection. Output is written to an SSHOutputSink rather than
 * a WebSocket directly, so the sink can be swapped when a browser reconnects.
 * WebSocket message routing (data/resize/ping) lives in index.ts.
 */

import { Client, ClientChannel } from 'ssh2';
import { TokenPayload } from '../auth/token.js';

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
                serverHostKey: [
                    'ecdsa-sha2-nistp256',
                    'ecdsa-sha2-nistp384',
                    'ecdsa-sha2-nistp521',
                    'rsa-sha2-512',
                    'rsa-sha2-256',
                    'ssh-rsa',
                    'ssh-dss',
                ],
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
                mac: [
                    'hmac-sha2-256',
                    'hmac-sha2-512',
                    'hmac-sha1',
                ],
            },
        };

        if (token.privateKey) {
            config.privateKey = token.privateKey;
            if (token.passphrase) config.passphrase = token.passphrase;
        } else if (token.password) {
            config.password = token.password;
        }

        this.ssh.on('ready', () => {
            this.connected = true;
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
            this.sink.onMessage('error', { message: 'SSH error: ' + err.message });
            this.close();
        });

        this.ssh.on('close', () => {
            this.sink.onMessage('disconnected');
        });

        try {
            this.ssh.connect(config);
        } catch (error) {
            this.sink.onMessage('error', {
                message: 'Connection failed: ' + (error as Error).message,
            });
            this.close();
        }
    }
}
