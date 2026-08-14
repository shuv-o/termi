/**
 * Tunnel Connection Handler
 *
 * Opens an SSH connection to the target server and forwards a single
 * `forwardOut` channel to `token.remoteHost:token.remotePort` — the gateway's
 * side of a port-forward tunnel. Implements the same SSHOutputSink interface
 * as SSHHandler/TelnetHandler so index.ts treats it uniformly for binary I/O.
 *
 * One WS connection == one forwarded channel == one SSH connection. Unlike
 * interactive SSH sessions, tunnels are not persistent/reattachable: closing
 * the WS (or the local bridge/browser tab using it) ends the tunnel, same as
 * closing a real `ssh -L` process would.
 */

import { Client } from 'ssh2';
import type { TokenPayload } from '../auth/token.js';
import type { SSHOutputSink } from './ssh.js';

export class TunnelHandler {
    private ssh: Client;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private stream: any = null;
    private closing = false;
    private sink: SSHOutputSink;

    constructor(token: TokenPayload, sink: SSHOutputSink) {
        this.sink = sink;
        this.ssh = new Client();
        this.setupSSH(token);
    }

    write(data: Buffer): void {
        if (this.stream) {
            this.stream.write(data);
        }
    }

    close(): void {
        if (this.closing) return;
        this.closing = true;
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
        try {
            this.ssh.end();
        } catch {
            /* ignore */
        }
    }

    private setupSSH(token: TokenPayload): void {
        const config: Parameters<Client['connect']>[0] = {
            host: token.host,
            port: token.port,
            username: token.username,
            readyTimeout: 10000,
            keepaliveInterval: 15000,
            keepaliveCountMax: 6,
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
                hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
            },
        };

        if (token.privateKey) {
            config.privateKey = token.privateKey;
            if (token.passphrase) config.passphrase = token.passphrase;
        } else if (token.password) {
            config.password = token.password;
        }

        this.ssh.on('ready', () => {
            const remoteHost = token.remoteHost;
            const remotePort = token.remotePort;
            if (!remoteHost || !remotePort) {
                this.sink.onMessage('error', { message: 'Tunnel target missing' });
                this.close();
                return;
            }

            this.ssh.forwardOut('127.0.0.1', 0, remoteHost, remotePort, (err, stream) => {
                if (err || !stream) {
                    this.sink.onMessage('error', {
                        message: `Failed to reach ${remoteHost}:${remotePort} — ${err?.message ?? 'unknown error'}`,
                    });
                    this.close();
                    return;
                }
                this.stream = stream;
                this.sink.onMessage('tunnel-ready');

                stream.on('data', (data: Buffer) => {
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
