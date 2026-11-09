/**
 * POST /api/connection/token
 *
 * Generates an encrypted JWE token (A256GCM) for the gateway.
 * Credentials in the payload are fully encrypted — interception reveals nothing.
 */

import { z } from 'zod';
import { getCurrentUser, mintConnectionToken, getGatewayUrl } from '@/lib/auth';
import { jumpClaim } from '@/lib/auth/connectionToken';
import { getServerForConnection } from '@/lib/services';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
    getClientIP,
    getDeviceInfo,
} from '@/lib/api';
import { validateHost } from '@/lib/security/ssrf';
import { connectionTokenRateLimit } from '@/lib/security/rate-limit';
import { ensureHostKeysPinned } from '@/lib/services/host-key.service';
import { forwardClaims, forwardFields } from '@/lib/tunnel/forward';
import { getKeychainCredentialById } from '@/lib/services/keychain.service';
import { recordConnection } from '@/lib/services/connection-history.service';

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
        ...forwardFields,
    }),
]);

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    // Rate limit: 30 token requests per 5 minutes per user
    const rl = await connectionTokenRateLimit(user.id);
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
        const forward = protocol === 'tunnel' ? forwardClaims(tokenData) : null;
        if (forward && 'error' in forward) return errorResponse(forward.error, 400);
        const server = await getServerForConnection(serverId, user.id);
        if (!server) return notFoundResponse('Server not found');

        if (protocol === 'tunnel' && server.protocol !== 'SSH') {
            return errorResponse('Port forwarding requires an SSH server', 400);
        }

        if (server.jump && protocol === 'telnet') {
            return errorResponse('Telnet connections cannot use a jump host', 400);
        }

        // Re-validate at token issuance time (defence-in-depth against tampered
        // DB entries). Behind a jump host this server only ever dials the
        // bastion, so that is the host the SSRF rules apply to.
        const hostValidation = server.jump
            ? await validateHost(server.jump.host, process.env.ALLOW_PRIVATE_NETWORKS === 'true')
            : await validateHost(server.host, process.env.ALLOW_PRIVATE_NETWORKS === 'true');
        if (!hostValidation.valid) {
            return errorResponse('Invalid server host configuration', 400);
        }

        // A security key needs someone to touch it, in a terminal, and it is
        // the owner's own key.
        if (server.securityKey) {
            if (protocol !== 'ssh') {
                return errorResponse(
                    'This server signs in with a security key: open a terminal to connect',
                    400,
                );
            }
            if (server.ownerId !== user.id) {
                return errorResponse(
                    "This server signs in with its owner's security key, so only they can connect",
                    403,
                );
            }
        }

        // The gateway can't write to the database, so it only ever verifies
        // host keys against pins recorded here first.
        const pinned = await pinHostKeys(server, protocol);
        if (pinned) return pinned;

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
            hostKey: server.hostKey.fingerprint,
            certificate: server.certificate,
            securityKey: server.securityKey,
            agent: protocol === 'ssh' ? await agentClaim(server, user.id) : null,
            jump: jumpClaim(server.jump),
            ...forward,
        });

        // Tunnels have their own TUNNEL_OPENED entry.
        if (protocol !== 'tunnel') {
            await recordConnection({
                userId: user.id,
                serverId: server.id,
                serverName: server.name,
                protocol,
                ipAddress: getClientIP(request),
                userAgent: getDeviceInfo(request),
            }).catch((err) => console.error('Connection history error:', err));
        }

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

const SSH_FAMILY = new Set(['ssh', 'scp', 'tunnel']);

/** Pin any SSH hop not pinned yet; returns an error response on failure. */
async function pinHostKeys(
    server: Parameters<typeof ensureHostKeysPinned>[0],
    protocol: string,
): Promise<Response | null> {
    try {
        await ensureHostKeysPinned(server, SSH_FAMILY.has(protocol));
        return null;
    } catch (err) {
        return errorResponse(
            `Could not read the server's SSH host key: ${(err as Error).message}`,
            502,
        );
    }
}

const MAX_AGENT_KEYS = 10;

/**
 * The keys to forward for an interactive session, or null. Only the server's
 * owner gets forwarding: the keys are the owner's own (the server's login key
 * and chosen keychain entries), so a user it is shared with must never be
 * able to use them through the remote host.
 */
async function agentClaim(
    server: {
        name: string;
        ownerId: string;
        agentForwarding: string;
        agentKeychainIds: string[];
        privateKey?: string;
        passphrase?: string;
    },
    userId: string,
) {
    if (server.ownerId !== userId) return null;
    if (server.agentForwarding !== 'on' && server.agentForwarding !== 'confirm') return null;
    const keys: { comment: string; privateKey: string; passphrase: string | null }[] = [];
    if (server.privateKey?.trim()) {
        keys.push({
            comment: `${server.name} login key`,
            privateKey: server.privateKey,
            passphrase: server.passphrase ?? null,
        });
    }
    for (const id of server.agentKeychainIds.slice(0, MAX_AGENT_KEYS)) {
        const entry = await getKeychainCredentialById(id, userId);
        if (entry?.privateKey) {
            keys.push({
                comment: entry.label,
                privateKey: entry.privateKey,
                passphrase: entry.passphrase ?? null,
            });
        }
    }
    if (keys.length === 0) return null;
    return {
        mode: server.agentForwarding as 'on' | 'confirm',
        keys: keys.slice(0, MAX_AGENT_KEYS),
    };
}
