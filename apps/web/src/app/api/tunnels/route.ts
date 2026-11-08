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
import { jumpClaim } from '@/lib/auth/connectionToken';
import { ensureHostKeysPinned } from '@/lib/services/host-key.service';
import { getServerForConnection } from '@/lib/services';
import { probeTunnelTarget } from '@/lib/services/tunnel.service';
import { tunnelCreateRateLimit } from '@/lib/rate-limit';
import { buildBridgeScript } from '@/lib/tunnel/bridge';
import { forwardClaims, forwardFields } from '@/lib/tunnel/forward';
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
    ...forwardFields,
    /**
     * local / dynamic: the port to listen on, on the user's computer.
     * remote: the port of the service on the user's computer to expose.
     */
    localPort: z.number().int().min(1).max(65535).optional(),
    /** remote: the host of that service, from the user's computer. */
    localHost: z
        .string()
        .max(255)
        .regex(/^[A-Za-z0-9._:-]+$/)
        .default('127.0.0.1'),
});

export { buildBridgeScript };

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const rateLimitResult = await tunnelCreateRateLimit(user.id);
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
    const { serverId, localPort, localHost, ...forwardReq } = validation.data;
    const claims = forwardClaims(forwardReq);
    if ('error' in claims) return errorResponse(claims.error, 400);
    if (forwardReq.mode === 'remote' && !localPort) {
        return errorResponse('Choose the port on your computer the server should reach', 400);
    }
    const { remoteHost, remotePort } = claims;

    const server = await getServerForConnection(serverId, user.id);
    if (!server) return notFoundResponse('Server not found');
    if (server.protocol !== 'SSH') {
        return errorResponse('Port forwarding requires an SSH server', 400);
    }

    try {
        try {
            await ensureHostKeysPinned(server, true);
        } catch (err) {
            return errorResponse(
                `Could not read the server's SSH host key: ${(err as Error).message}`,
                502,
            );
        }

        // Only a fixed target can be probed (and offered as a browser link).
        let isHttp = false;
        if (forwardReq.mode === 'local') {
            const probe = await probeTunnelTarget(user.id, serverId, remoteHost!, remotePort!);
            if ('error' in probe) return errorResponse(probe.error, 400);
            isHttp = probe.isHttp;
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
            hostKey: server.hostKey.fingerprint,
            certificate: server.certificate,
            jump: jumpClaim(server.jump),
            ...claims,
        });

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'TUNNEL_OPENED',
                resource: `server:${serverId}`,
                details: {
                    mode: forwardReq.mode,
                    ...(forwardReq.mode === 'local' && { remoteHost, remotePort, isHttp }),
                    ...(forwardReq.mode === 'remote' && {
                        bindAddress: forwardReq.bindAddress,
                        bindPort: forwardReq.bindPort,
                    }),
                },
            },
        });

        if (isHttp) {
            const hostParam =
                remoteHost !== '127.0.0.1' ? `?host=${encodeURIComponent(remoteHost!)}` : '';
            const proxyUrl = `${getSiteUrl()}/tunnel/${serverId}/${remotePort}${hostParam}`;
            return successResponse({ isHttp: true, proxyUrl }, 201);
        }

        const bridgeScript = buildBridgeScript({
            gatewayUrl: getGatewayUrl(),
            serverId,
            serverName: server.name,
            token,
            mode: forwardReq.mode,
            remoteHost,
            remotePort,
            localPort: forwardReq.mode === 'remote' ? undefined : (localPort ?? remotePort),
            bindAddress: forwardReq.bindAddress,
            bindPort: forwardReq.bindPort,
            localTarget:
                forwardReq.mode === 'remote' ? { host: localHost, port: localPort! } : undefined,
        });

        return successResponse({ isHttp: false, bridgeScript }, 201);
    } catch (error) {
        console.error('Create tunnel error:', error);
        return errorResponse('Failed to open tunnel', 500);
    }
}
