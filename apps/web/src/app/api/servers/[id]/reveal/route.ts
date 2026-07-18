/**
 * POST /api/servers/[id]/reveal
 *
 * Re-authenticates the user (password, TOTP/email OTP, or passkey) then
 * returns a single decrypted credential field. Logs every access to audit trail.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
    getClientIP,
    getDeviceInfo,
} from '@/lib/api';
import { credentialRevealRateLimit } from '@/lib/rate-limit';
import { decryptCredentials } from '@/lib/crypto/credentials';
import { reauthFields, hasReauthProof, verifyReauth } from '@/lib/auth/reauth';

const revealSchema = z.object({
    field: z.enum(['password', 'privateKey', 'passphrase']),
    // One of the re-auth proofs must be present.
    ...reauthFields,
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const ipAddress = getClientIP(request);
    const deviceInfo = getDeviceInfo(request);
    const { id: serverId } = await params;

    // Rate limit: max 3 reveals per 5 min per user
    const rl = credentialRevealRateLimit(user.id);
    if (!rl.allowed) {
        return errorResponse('Too many reveal requests. Please wait before trying again.', 429);
    }

    const validation = await validateBody(request, revealSchema);
    if ('error' in validation) return validation.error;

    const { field, ...auth } = validation.data;

    if (!hasReauthProof(auth)) {
        return errorResponse(
            'Re-authentication required: provide your password, 2FA code, or passkey',
            400,
        );
    }

    const authenticated = await verifyReauth(user.id, auth);

    if (!authenticated) {
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'SERVER_CREDENTIAL_REVEALED',
                resource: `server:${serverId}`,
                ipAddress,
                userAgent: deviceInfo,
                details: { success: false, field, reason: 'Auth failed' },
            },
        });
        return errorResponse('Authentication failed', 401);
    }

    // Fetch server with raw encrypted fields
    const server = await prisma.server.findUnique({
        where: { id: serverId, userId: user.id },
    });

    if (!server) return notFoundResponse('Server not found');

    // Decrypt credentials
    let plainValue: string | null = null;
    try {
        const decrypted = decryptCredentials({
            host: server.host,
            username: server.username,
            password: server.password ?? undefined,
            privateKey: server.privateKey ?? undefined,
            passphrase: server.passphrase ?? undefined,
        });
        plainValue = (decrypted[field as keyof typeof decrypted] as string | undefined) ?? null;
    } catch {
        return errorResponse('Failed to decrypt credential', 500);
    }

    if (!plainValue) {
        return errorResponse(`No ${field} stored for this server`, 404);
    }

    // Audit log every successful reveal
    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'SERVER_CREDENTIAL_REVEALED',
            resource: `server:${serverId}`,
            ipAddress,
            userAgent: deviceInfo,
            details: { success: true, field },
        },
    });

    return successResponse({ field, value: plainValue });
}
