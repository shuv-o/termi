/**
 * POST /api/tunnels — probe a port-forward target and hand back either a
 * one-click HTTP proxy URL or a copyable local-bridge script.
 *
 * Stateless by design: nothing is opened or tracked server-side here. The
 * actual data path is a WebSocket through the gateway (protocol=tunnel),
 * authenticated per-connection by the token this route mints — reachable at
 * the same domain/port as everything else, so it works behind a reverse
 * proxy that only forwards 80/443.
 */

import { z } from 'zod';
import { getCurrentUser, mintConnectionToken, getGatewayUrl } from '@/lib/auth';
import { getServerForConnection } from '@/lib/services';
import { probeTunnelTarget } from '@/lib/services/tunnel.service';
import { tunnelCreateRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';
import { getSiteUrl } from '@/lib/site';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

const createTunnelSchema = z.object({
    serverId: z.string().min(1),
    remoteHost: z.string().min(1).max(255),
    remotePort: z.number().int().min(1).max(65535),
});

/** Self-contained Node.js bridge: forwards a local TCP port to the tunnel's
 *  target over the gateway WebSocket. No dependencies beyond Node's built-in
 *  global WebSocket (Node 22+). */
export function buildBridgeScript(opts: {
    gatewayUrl: string;
    serverId: string;
    token: string;
    remoteHost: string;
    remotePort: number;
    serverName: string;
    localPort: number;
}): string {
    const wsUrl = `${opts.gatewayUrl}/connect?protocol=tunnel&serverId=${encodeURIComponent(opts.serverId)}`;
    // Ports below 1024 need root to bind locally on Unix — default to an
    // OS-assigned ephemeral port instead of blindly mirroring the remote one.
    const defaultLocalPort = opts.localPort >= 1024 ? opts.localPort : 0;
    return `#!/usr/bin/env node
// Termi tunnel bridge — forwards a local port to ${opts.remoteHost}:${opts.remotePort}
// on "${opts.serverName}" via Termi. Requires Node 22+ (built-in WebSocket).
// This token expires in 5 minutes if unused — regenerate from Termi if this fails.
//
// Run: node termi-tunnel.mjs

import net from 'node:net';

const WS_URL = ${JSON.stringify(wsUrl)};
const TOKEN = ${JSON.stringify(opts.token)};
// 0 = let the OS pick a free port (printed once the server starts). Set a
// specific port here if you want one — ports below 1024 need root on Unix.
const LOCAL_PORT = ${defaultLocalPort};

const server = net.createServer((socket) => {
    socket.pause();
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
    });
    ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
            socket.write(Buffer.from(event.data));
            return;
        }
        const msg = JSON.parse(event.data);
        if (msg.type === 'tunnel-ready') {
            socket.resume();
        } else if (msg.type === 'error') {
            console.error('[termi-tunnel] ' + msg.message);
            socket.destroy();
        } else if (msg.type === 'closed' || msg.type === 'disconnected') {
            socket.destroy();
        }
    });
    ws.addEventListener('close', () => socket.destroy());
    ws.addEventListener('error', () => socket.destroy());

    socket.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    });
    socket.on('close', () => {
        try { ws.close(); } catch {}
    });
    socket.on('error', () => {
        try { ws.close(); } catch {}
    });
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
    const boundPort = server.address().port;
    console.log(\`[termi-tunnel] Listening on 127.0.0.1:\${boundPort} -> ${opts.remoteHost}:${opts.remotePort} via ${opts.serverName}\`);
    console.log('[termi-tunnel] Point your tool at 127.0.0.1:' + boundPort);
});
`;
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const rateLimitResult = tunnelCreateRateLimit(user.id);
    if (!rateLimitResult.allowed) {
        return errorResponse(
            'Too many tunnels opened recently. Please wait before trying again.',
            429,
        );
    }

    const validation = await validateBody(request, createTunnelSchema);
    if ('error' in validation) {
        return validation.error;
    }
    const { serverId, remoteHost, remotePort } = validation.data;

    const server = await getServerForConnection(serverId, user.id);
    if (!server) return notFoundResponse('Server not found');
    if (server.protocol !== 'SSH') {
        return errorResponse('Port forwarding requires an SSH server', 400);
    }

    try {
        const probe = await probeTunnelTarget(user.id, serverId, remoteHost, remotePort);
        if ('error' in probe) {
            return errorResponse(probe.error, 400);
        }

        const token = await mintConnectionToken({
            userId: user.id,
            serverId,
            protocol: 'tunnel',
            host: server.host,
            port: server.port,
            username: server.username,
            password: server.password ?? null,
            privateKey: server.privateKey ?? null,
            passphrase: server.passphrase ?? null,
            remoteHost,
            remotePort,
        });

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'TUNNEL_OPENED',
                resource: `server:${serverId}`,
                details: { remoteHost, remotePort, isHttp: probe.isHttp },
            },
        });

        if (probe.isHttp) {
            const hostParam = remoteHost !== '127.0.0.1' ? `?host=${encodeURIComponent(remoteHost)}` : '';
            const proxyUrl = `${getSiteUrl()}/tunnel/${serverId}/${remotePort}${hostParam}`;
            return successResponse({ isHttp: true, proxyUrl }, 201);
        }

        const bridgeScript = buildBridgeScript({
            gatewayUrl: getGatewayUrl(),
            serverId,
            token,
            remoteHost,
            remotePort,
            serverName: server.name,
            localPort: remotePort,
        });

        return successResponse({ isHttp: false, bridgeScript }, 201);
    } catch (error) {
        console.error('Create tunnel error:', error);
        return errorResponse('Failed to open tunnel', 500);
    }
}
