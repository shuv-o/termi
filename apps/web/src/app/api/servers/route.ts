/**
 * GET /api/servers - List all servers
 * POST /api/servers - Create a new server
 */

import { z } from 'zod';
import { agentFields, certificateField } from '@/lib/security/certificate-field';
import { withKeychainCredentials } from '@/lib/services/keychain.service';
import { getCurrentUser } from '@/lib/auth';
import { getServers, createServer, searchServers, JumpHostError } from '@/lib/services';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { Protocol } from '@/app/generated/prisma/client';
import { validateHost, validateJumpTargetHost } from '@/lib/security/ssrf';

const createServerSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    description: z.string().max(500).optional(),
    groupId: z.string().optional(),
    host: z.string().min(1, 'Host is required'),
    port: z.number().int().min(1).max(65535),
    protocol: z.nativeEnum(Protocol),
    username: z.string().min(1, 'Username is required'),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    displayWidth: z.number().int().min(640).max(7680).optional(),
    displayHeight: z.number().int().min(480).max(4320).optional(),
    colorDepth: z.union([z.literal(8), z.literal(16), z.literal(24), z.literal(32)]).optional(),
    rdpSecurity: z.enum(['any', 'rdp', 'nla', 'tls']).optional(),
    jumpServerId: z.string().nullable().optional(),
    certificate: certificateField,
    securityKeyId: z.string().max(64).nullable().optional(),
    ...agentFields,
    /** Use this keychain entry's credentials; resolved here, never sent to the browser. */
    keychainId: z.string().optional(),
});

export async function GET(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const protocol = searchParams.get('protocol') as Protocol | null;
        const groupId = searchParams.get('groupId') || undefined;
        const favorites = searchParams.get('favorites') === 'true';

        let servers;

        if (query || protocol || groupId || favorites) {
            servers = await searchServers(
                user.id,
                query,
                protocol || undefined,
                groupId,
                favorites,
            );
        } else {
            servers = await getServers(user.id);
        }

        return successResponse({ servers });
    } catch (error) {
        console.error('Get servers error:', error);
        return errorResponse('Failed to fetch servers', 500);
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const validation = await validateBody(request, createServerSchema);

    if ('error' in validation) {
        return validation.error;
    }

    try {
        // SSRF protection: validate host doesn't point to internal network.
        // Behind a jump host, the bastion dials it instead — see validateJumpTargetHost.
        const ssrfCheck = validation.data.jumpServerId
            ? validateJumpTargetHost(validation.data.host)
            : await validateHost(
                  validation.data.host,
                  process.env.ALLOW_PRIVATE_NETWORKS === 'true',
              );
        if (!ssrfCheck.valid) {
            return errorResponse(ssrfCheck.error || 'Invalid host', 400);
        }

        const input = await withKeychainCredentials(validation.data, user.id);
        if (!input) return errorResponse('Keychain entry not found', 404);

        const server = await createServer({
            userId: user.id,
            ...input,
        });

        return successResponse({ server }, 201);
    } catch (error) {
        if (error instanceof JumpHostError) return errorResponse(error.message, 400);
        console.error('Create server error:', error);
        return errorResponse('Failed to create server', 500);
    }
}
