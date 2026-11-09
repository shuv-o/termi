/**
 * Tunnel target probing. Tunnel traffic itself goes over a WebSocket through
 * the gateway (apps/gateway/src/handlers/tunnel-mux.ts), so it works behind a
 * reverse proxy that only forwards 80/443.
 *
 * Given a candidate target, this makes a quick real HTTP request through the
 * SSH forwardOut channel to decide whether to offer the one-click "open in
 * browser" proxy, or the local bridge instead (databases, raw SSH, etc.).
 */

import { sshPool, type SSHPoolConfig } from './ssh-pool';
import { getServerForConnection } from './server.service';

const PROBE_TIMEOUT_MS = 2500;

export async function probeTunnelTarget(
    userId: string,
    serverId: string,
    remoteHost: string,
    remotePort: number,
): Promise<{ isHttp: boolean } | { error: string }> {
    const server = await getServerForConnection(serverId, userId);
    if (!server) return { error: 'Server not found' };
    if (server.protocol !== 'SSH') return { error: 'Port forwarding requires an SSH server' };

    const config: SSHPoolConfig = {
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.password,
        privateKey: server.privateKey,
        passphrase: server.passphrase,
        jump: server.jump,
        hostKey: server.hostKey,
        certificate: server.certificate,
    };

    let client;
    let poolKey: string;
    try {
        const acquired = await sshPool.acquire(config);
        client = acquired.client;
        poolKey = acquired.key;
    } catch (err) {
        return { error: `SSH connect error: ${err instanceof Error ? err.message : String(err)}` };
    }

    return new Promise((resolve) => {
        let settled = false;
        const finish = (isHttp: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            sshPool.release(poolKey);
            resolve({ isHttp });
        };

        const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);

        client.forwardOut('127.0.0.1', 0, remoteHost, remotePort, (err, stream) => {
            if (err || !stream) {
                finish(false);
                return;
            }
            let buf = '';
            stream.on('data', (chunk: Buffer) => {
                buf += chunk.toString('latin1');
                if (buf.length > 0) finish(/^HTTP\/\d\.\d/.test(buf));
            });
            stream.on('error', () => finish(false));
            stream.on('close', () => finish(false));
            stream.write('HEAD / HTTP/1.0\r\nHost: termi-probe\r\nConnection: close\r\n\r\n');
        });
    });
}
