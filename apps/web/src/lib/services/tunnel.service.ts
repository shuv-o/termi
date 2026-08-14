/**
 * SSH Port-Forward Tunnel Service
 *
 * Opens a TCP listener on THIS server (the machine running apps/web) and
 * forwards every accepted connection through a pooled SSH connection via
 * `forwardOut` — the same semantics as `ssh -L`, except the listening end
 * necessarily lives here rather than in the browser (a web page can't bind
 * an arbitrary local TCP port). Anything that can reach this host can use
 * the forwarded port once it's open, so tunnels are capped per-user, get a
 * random ephemeral port (never a fixed/guessable one), and auto-expire.
 *
 * Tunnels are in-memory only, like the SSH pool they ride on — if this
 * process restarts, every open tunnel simply stops (same as a real `ssh -L`
 * process dying). The `globalThis` singleton keeps dev-mode hot reloads from
 * leaking duplicate listeners.
 */

import net from 'net';
import { randomUUID } from 'node:crypto';
import { sshPool, type SSHPoolConfig } from './ssh-pool';
import { getServerForConnection } from './server.service';

const MAX_TUNNELS_PER_USER = 5;
/** Safety net against a forgotten open port — not a normal-use limit. */
const MAX_LIFETIME_MS = 2 * 60 * 60 * 1000;

export interface TunnelInfo {
    id: string;
    serverId: string;
    serverName: string;
    remoteHost: string;
    remotePort: number;
    localPort: number;
    createdAt: number;
    bytesIn: number;
    bytesOut: number;
    connectionCount: number;
}

interface TunnelEntry extends TunnelInfo {
    userId: string;
    tcpServer: net.Server;
    poolKey: string;
    expireTimer: ReturnType<typeof setTimeout>;
}

declare global {
    var __tunnels: Map<string, TunnelEntry> | undefined;
}

const tunnels = (globalThis.__tunnels ??= new Map<string, TunnelEntry>());

function toInfo({
    id,
    serverId,
    serverName,
    remoteHost,
    remotePort,
    localPort,
    createdAt,
    bytesIn,
    bytesOut,
    connectionCount,
}: TunnelEntry): TunnelInfo {
    return {
        id,
        serverId,
        serverName,
        remoteHost,
        remotePort,
        localPort,
        createdAt,
        bytesIn,
        bytesOut,
        connectionCount,
    };
}

/** This user's currently open tunnels. */
export function listTunnels(userId: string): TunnelInfo[] {
    return [...tunnels.values()].filter((t) => t.userId === userId).map(toInfo);
}

/**
 * Opens a tunnel: `serverId`'s SSH connection forwards `remoteHost:remotePort`
 * (reachable from that server's own network) to a fresh port on this host.
 */
export async function createTunnel(
    userId: string,
    serverId: string,
    remoteHost: string,
    remotePort: number,
): Promise<{ tunnel: TunnelInfo } | { error: string }> {
    const activeCount = [...tunnels.values()].filter((t) => t.userId === userId).length;
    if (activeCount >= MAX_TUNNELS_PER_USER) {
        return { error: `You can have at most ${MAX_TUNNELS_PER_USER} tunnels open at once.` };
    }

    const server = await getServerForConnection(serverId, userId);
    if (!server) {
        return { error: 'Server not found' };
    }
    if (server.protocol !== 'SSH') {
        return { error: 'Port forwarding only works over SSH' };
    }

    const config: SSHPoolConfig = {
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.password,
        privateKey: server.privateKey,
        passphrase: server.passphrase,
    };

    let client;
    let poolKey: string;
    try {
        const acquired = await sshPool.acquire(config);
        client = acquired.client;
        poolKey = acquired.key;
    } catch (err) {
        return {
            error: `SSH connect error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    return new Promise((resolve) => {
        let entry: TunnelEntry | null = null;

        const tcpServer = net.createServer((socket) => {
            if (entry) entry.connectionCount++;

            client.forwardOut(
                socket.remoteAddress ?? '127.0.0.1',
                socket.remotePort ?? 0,
                remoteHost,
                remotePort,
                (err, stream) => {
                    if (err || !stream) {
                        console.error('[tunnel] forwardOut failed:', err);
                        socket.destroy();
                        return;
                    }
                    socket.on('data', (chunk: Buffer) => {
                        if (entry) entry.bytesIn += chunk.length;
                    });
                    stream.on('data', (chunk: Buffer) => {
                        if (entry) entry.bytesOut += chunk.length;
                    });
                    socket.pipe(stream);
                    stream.pipe(socket);

                    const cleanup = () => {
                        socket.destroy();
                        stream.destroy();
                    };
                    socket.on('close', cleanup);
                    socket.on('error', cleanup);
                    stream.on('close', cleanup);
                    stream.on('error', cleanup);
                },
            );
        });

        tcpServer.once('error', (err) => {
            sshPool.release(poolKey);
            resolve({ error: `Failed to open tunnel listener: ${err.message}` });
        });

        tcpServer.listen(0, '0.0.0.0', () => {
            const addr = tcpServer.address();
            const localPort = addr && typeof addr === 'object' ? addr.port : 0;
            const id = randomUUID();

            entry = {
                id,
                userId,
                serverId,
                serverName: server.name,
                remoteHost,
                remotePort,
                localPort,
                createdAt: Date.now(),
                bytesIn: 0,
                bytesOut: 0,
                connectionCount: 0,
                tcpServer,
                poolKey,
                expireTimer: setTimeout(() => closeTunnel(id, userId), MAX_LIFETIME_MS),
            };
            tunnels.set(id, entry);
            resolve({ tunnel: toInfo(entry) });
        });
    });
}

/** Closes a tunnel this user owns. Returns false if it doesn't exist or isn't theirs. */
export function closeTunnel(id: string, userId: string): boolean {
    const entry = tunnels.get(id);
    if (!entry || entry.userId !== userId) return false;

    clearTimeout(entry.expireTimer);
    tunnels.delete(id);
    try {
        entry.tcpServer.close();
    } catch {
        /* already closed */
    }
    sshPool.release(entry.poolKey);
    return true;
}
