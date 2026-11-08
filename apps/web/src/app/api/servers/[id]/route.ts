/**
 * GET /api/servers/[id] - Get server details
 * PATCH /api/servers/[id] - Update server
 * DELETE /api/servers/[id] - Delete server
 */

import { z } from 'zod';
import { agentFields, certificateField } from '@/lib/security/certificate-field';
import { withKeychainCredentials } from '@/lib/services/keychain.service';
import { getCurrentUser } from '@/lib/auth';
import { getServerById, updateServer, deleteServer, JumpHostError } from '@/lib/services';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';
import { Protocol } from '@/app/generated/prisma/client';
import { validateHost, validateJumpTargetHost } from '@/lib/security/ssrf';
import { prisma } from '@/lib/db';

const updateServerSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    groupId: z.string().nullable().optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    protocol: z.nativeEnum(Protocol).optional(),
    username: z.string().min(1).optional(),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    isFavorite: z.boolean().optional(),
    displayWidth: z.number().int().min(640).max(7680).optional(),
    displayHeight: z.number().int().min(480).max(4320).optional(),
    colorDepth: z.union([z.literal(8), z.literal(16), z.literal(24), z.literal(32)]).optional(),
    rdpSecurity: z.enum(['any', 'rdp', 'nla', 'tls']).optional(),
    jumpServerId: z.string().nullable().optional(),
    certificate: certificateField,
    ...agentFields,
    /** Use this keychain entry's credentials; resolved here, never sent to the browser. */
    keychainId: z.string().optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        const server = await getServerById(id, user.id);

        if (!server) {
            return notFoundResponse('Server not found');
        }

        // Never send credentials back to the client — only expose whether they are set.
        // Callers that need credentials use getServerForConnection() server-side.
        // `jump` holds the bastion's *decrypted* credentials — strip it too and
        // expose only which server it is.
        const { password, privateKey, passphrase, jump, ...safeFields } = server;
        const jumpServer = jump
            ? await prisma.server.findUnique({
                  where: { id: jump.serverId },
                  select: { id: true, name: true },
              })
            : null;
        return successResponse({
            server: {
                ...safeFields,
                hasPassword: !!password,
                hasPrivateKey: !!privateKey,
                hasPassphrase: !!passphrase,
                jumpServer,
            },
        });
    } catch (error) {
        console.error('Get server error:', error);
        return errorResponse('Failed to fetch server', 500);
    }
}

export async function PATCH(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;
    const validation = await validateBody(request, updateServerSchema);

    if ('error' in validation) {
        return validation.error;
    }

    // Re-validate the host against SSRF rules whenever the *resulting* config
    // has this server dialing it directly: the host changed, or a jump host is
    // being removed (a private address that was fine behind a bastion is not
    // fine for this server to dial itself).
    const { host: newHost, jumpServerId: newJump } = validation.data;
    if (newHost !== undefined || newJump !== undefined) {
        const existing = await getServerById(id, user.id);
        if (!existing) return notFoundResponse('Server not found');
        const finalHost = newHost ?? existing.host;
        const finalJump = newJump !== undefined ? newJump : existing.jumpServerId;
        const ssrfCheck = finalJump
            ? validateJumpTargetHost(finalHost)
            : await validateHost(finalHost, process.env.ALLOW_PRIVATE_NETWORKS === 'true');
        if (!ssrfCheck.valid) {
            return errorResponse(
                !newHost && newJump === null
                    ? `Without a jump host, ${ssrfCheck.error?.toLowerCase() ?? 'this host is not allowed'}`
                    : ssrfCheck.error || 'Invalid host',
                400,
            );
        }
    }

    try {
        const input = await withKeychainCredentials(validation.data, user.id);
        if (!input) return errorResponse('Keychain entry not found', 404);

        const server = await updateServer(id, user.id, input);

        if (!server) {
            return notFoundResponse('Server not found');
        }

        return successResponse({ server });
    } catch (error) {
        if (error instanceof JumpHostError) return errorResponse(error.message, 400);
        console.error('Update server error:', error);
        return errorResponse('Failed to update server', 500);
    }
}

export async function DELETE(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        const deleted = await deleteServer(id, user.id);

        if (!deleted) {
            return notFoundResponse('Server not found');
        }

        return successResponse({ message: 'Server deleted' });
    } catch (error) {
        if (error instanceof JumpHostError) return errorResponse(error.message, 409);
        console.error('Delete server error:', error);
        return errorResponse('Failed to delete server', 500);
    }
}
