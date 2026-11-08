/**
 * RDP/VNC through a jump host.
 *
 * guacd — not the gateway — opens the RDP/VNC connection, and it runs in its
 * own container, so it cannot use an SSH channel directly. Instead the gateway
 * opens a short-lived TCP relay: guacd connects to it, and each connection is
 * piped through a `forwardOut` channel on the bastion to the real target.
 *
 * The relay is deliberately narrow:
 *  - it only exists when GUACD_TUNNEL_HOST is set (the address guacd uses to
 *    reach the gateway, e.g. `gateway` on a Docker network);
 *  - it only accepts connections from guacd's own resolved addresses;
 *  - it closes if guacd has not connected within 20 s, and with the session.
 */

import { createServer, type Server, type Socket } from 'net';
import { lookup } from 'dns/promises';
import { Client } from 'ssh2';
import { bastionConfig, type Jump } from './jump.js';

const FIRST_CONNECTION_TIMEOUT_MS = 20_000;

export interface JumpRelay {
    /** Address and port to give guacd as the connection's hostname/port. */
    host: string;
    port: number;
    close(): void;
}

/** True when the gateway is configured to relay RDP/VNC through jump hosts. */
export function jumpRelayEnabled(): boolean {
    return Boolean(process.env.GUACD_TUNNEL_HOST);
}

const normalize = (addr: string) => addr.replace(/^::ffff:/, '');

async function guacdAddresses(): Promise<Set<string>> {
    const host = process.env.GUACD_HOST || 'localhost';
    const addrs = await lookup(host, { all: true }).catch(() => []);
    const set = new Set(addrs.map((a) => normalize(a.address)));
    if (host === 'localhost' || set.has('127.0.0.1') || set.has('::1')) {
        set.add('127.0.0.1');
        set.add('::1');
    }
    return set;
}

export async function openJumpRelay(
    jump: Jump,
    targetHost: string,
    targetPort: number,
): Promise<JumpRelay> {
    const advertiseHost = process.env.GUACD_TUNNEL_HOST;
    if (!advertiseHost) throw new Error('GUACD_TUNNEL_HOST is not set');
    const loopbackOnly = ['127.0.0.1', 'localhost', '::1'].includes(advertiseHost);
    const bindHost = process.env.GUACD_TUNNEL_BIND || (loopbackOnly ? '127.0.0.1' : '0.0.0.0');

    const allowed = await guacdAddresses();
    if (allowed.size === 0) throw new Error('Could not resolve GUACD_HOST for the jump relay');

    // 1. Bastion connection, shared by every relayed socket.
    const bastion = new Client();
    await new Promise<void>((resolve, reject) => {
        if (jump.password) {
            bastion.on('keyboard-interactive', (_n, _i, _l, _p, finish) =>
                finish([jump.password!]),
            );
        }
        bastion.once('ready', () => resolve());
        bastion.once('error', (err) => reject(new Error(`jump host ${jump.host}: ${err.message}`)));
        bastion.connect(bastionConfig(bastion, jump));
    });

    // 2. The relay listener guacd connects to.
    const sockets = new Set<Socket>();
    let closed = false;
    let server: Server | null = null;

    const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(idleTimer);
        server?.close();
        for (const s of sockets) s.destroy();
        bastion.end();
    };

    const idleTimer = setTimeout(close, FIRST_CONNECTION_TIMEOUT_MS);
    bastion.on('close', close);
    bastion.on('error', close);

    server = createServer((socket) => {
        const from = normalize(socket.remoteAddress ?? '');
        if (!allowed.has(from)) {
            console.warn(`[JumpRelay] Rejected connection from ${from}`);
            socket.destroy();
            return;
        }
        clearTimeout(idleTimer);
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => socket.destroy());

        bastion.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
            if (err) {
                console.error(
                    `[JumpRelay] ${jump.host} could not reach ${targetHost}:${targetPort}`,
                );
                socket.destroy();
                return;
            }
            socket.pipe(stream).pipe(socket);
            stream.on('close', () => socket.destroy());
            socket.on('close', () => stream.close());
        });
    });

    await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(0, bindHost, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
        close();
        throw new Error('Jump relay failed to bind');
    }
    return { host: advertiseHost, port: address.port, close };
}
