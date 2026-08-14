/**
 * POST /api/connection/token
 *
 * Generates an encrypted JWE token (A256GCM) for the gateway.
 * Credentials in the payload are fully encrypted — interception reveals nothing.
 */

import { z } from 'zod';
import { getCurrentUser, mintConnectionToken, getGatewayUrl } from '@/lib/auth';
import { getServerForConnection } from '@/lib/services';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';
import { validateHost } from '@/lib/security/ssrf';
import { connectionTokenRateLimit } from '@/lib/rate-limit';

const tokenSchema = z.discriminatedUnion('protocol', [
    z.object({
        protocol: z.literal('local'),
        serverId: z.string().optional(),
    }),
    z.object({
        protocol: z.enum(['ssh', 'scp', 'rdp', 'vnc', 'telnet']),
        serverId: z.string(),
    }),
    z.object({
        protocol: z.literal('tunnel'),
        serverId: z.string(),
        remoteHost: z.string().min(1).max(255),
        remotePort: z.number().int().min(1).max(65535),
    }),
]);

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    // Rate limit: 30 token requests per 5 minutes per user
    const rl = connectionTokenRateLimit(user.id);
    if (!rl.allowed) {
        return errorResponse('Too many connection requests. Please wait before trying again.', 429);
    }

    const validation = await validateBody(request, tokenSchema);
    if ('error' in validation) return validation.error;

    const tokenData = validation.data;

    try {
        //   Local terminal: no server lookup needed
        if (tokenData.protocol === 'local') {
            if (process.env.ALLOW_LOCAL_TERMINAL !== 'true') {
                return errorResponse('Local terminal is not enabled on this server', 403);
            }

            const token = await mintConnectionToken({
                userId: user.id,
                serverId: 'local',
                protocol: 'local',
                host: '',
                port: 0,
                username: '',
            });

            return successResponse({ token, gatewayUrl: getGatewayUrl() });
        }

        const { serverId, protocol } = tokenData;
        const server = await getServerForConnection(serverId, user.id);
        if (!server) return notFoundResponse('Server not found');

        if (protocol === 'tunnel' && server.protocol !== 'SSH') {
            return errorResponse('Port forwarding requires an SSH server', 400);
        }

        // Re-validate host at token issuance time (defence-in-depth against tampered DB entries)
        const hostValidation = await validateHost(
            server.host,
            process.env.ALLOW_PRIVATE_NETWORKS === 'true',
        );
        if (!hostValidation.valid) {
            return errorResponse('Invalid server host configuration', 400);
        }

        const token = await mintConnectionToken({
            userId: user.id,
            serverId: server.id,
            protocol,
            host: server.host,
            port: server.port,
            username: server.username,
            password: server.password ?? null,
            privateKey: server.privateKey ?? null,
            passphrase: server.passphrase ?? null,
            displayWidth: server.displayWidth ?? 1920,
            displayHeight: server.displayHeight ?? 1080,
            colorDepth: server.colorDepth ?? 24,
            rdpSecurity: server.rdpSecurity ?? 'any',
            ...(protocol === 'tunnel' && {
                remoteHost: tokenData.remoteHost,
                remotePort: tokenData.remotePort,
            }),
        });

        return successResponse({ token, gatewayUrl: getGatewayUrl() });
    } catch (error) {
        if (error instanceof Error && error.message.includes('GATEWAY_JWT_SECRET')) {
            console.error('Connection token error:', error.message);
            return errorResponse('Server configuration error', 500);
        }
        console.error('Token generation error:', error);
        return errorResponse('Failed to generate connection token', 500);
    }
}
