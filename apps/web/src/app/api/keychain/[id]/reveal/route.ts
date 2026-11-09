/**
 * POST /api/keychain/[id]/reveal
 *
 * Returns a keychain entry's secrets. Like revealing a server password, this
 * needs a fresh step-up proof (password, 2FA code or passkey); a successful
 * proof is remembered on the session for 5 minutes so that copying or editing
 * several entries in a row doesn't ask every time. Every reveal is audit-logged.
 *
 * GET /api/keychain/[id] deliberately returns no secrets — the server form
 * passes a keychainId and the server resolves the entry itself.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getSession } from '@/lib/auth/session';
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
import { keychainReadRateLimit } from '@/lib/security/rate-limit';
import { reauthFields, hasReauthProof, verifyReauth } from '@/lib/auth/reauth';
import { getKeychainCredentialById } from '@/lib/services/keychain.service';

const STEP_UP_GRACE_MS = 5 * 60 * 1000;

const schema = z.object({
    ...reauthFields,
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    if (!(await keychainReadRateLimit(user.id)).allowed) {
        return errorResponse('Too many requests. Please wait a few minutes.', 429);
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;
    const auth = validation.data;
    const { id } = await params;

    const session = await getSession();
    const recentlySteppedUp =
        typeof session.stepUpAt === 'number' && Date.now() - session.stepUpAt < STEP_UP_GRACE_MS;

    if (!recentlySteppedUp) {
        if (!hasReauthProof(auth)) {
            // The client shows the step-up prompt on this answer.
            return errorResponse('Re-authentication required', 401);
        }
        if (!(await verifyReauth(user.id, auth))) {
            return errorResponse('Authentication failed', 401);
        }
        session.stepUpAt = Date.now();
        await session.save();
    }

    const entry = await getKeychainCredentialById(id, user.id);
    if (!entry) return notFoundResponse('Keychain entry not found');

    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'KEYCHAIN_REVEALED',
            resource: `keychain:${id}`,
            ipAddress: getClientIP(request),
            userAgent: getDeviceInfo(request),
        },
    });

    return successResponse({
        entry: {
            id: entry.id,
            label: entry.label,
            username: entry.username,
            password: entry.password ?? null,
            privateKey: entry.privateKey ?? null,
            passphrase: entry.passphrase ?? null,
        },
    });
}
