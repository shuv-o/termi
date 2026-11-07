/**
 * POST /api/auth/password-login — turn "passkey only" on or off.
 *
 * With password sign-in turned off, a stolen or phished password is useless:
 * only the account's passkeys (or Google, if linked) can sign in. Turning it
 * off requires at least one passkey; removing the last passkey or resetting
 * the password by email turns password sign-in back on automatically.
 *
 * Changing it needs a fresh step-up proof, like other security settings.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    getClientIP,
    getDeviceInfo,
} from '@/lib/api';
import { reauthFields, hasReauthProof, verifyReauth } from '@/lib/auth/reauth';
import { credentialRevealRateLimit } from '@/lib/rate-limit';

const schema = z.object({
    disabled: z.boolean(),
    ...reauthFields,
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    if (!credentialRevealRateLimit(user.id).allowed) {
        return errorResponse('Too many attempts. Please wait a few minutes.', 429);
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;
    const { disabled, ...auth } = validation.data;

    if (!hasReauthProof(auth)) {
        return errorResponse('Re-authentication required', 401);
    }
    if (!(await verifyReauth(user.id, auth))) {
        return errorResponse('Authentication failed', 401);
    }

    if (disabled) {
        const passkeys = await prisma.passkey.count({ where: { userId: user.id } });
        if (passkeys === 0) {
            return errorResponse('Add a passkey before turning off password sign-in.', 400);
        }
    }

    await prisma.$transaction([
        prisma.user.update({
            where: { id: user.id },
            data: { passwordLoginDisabled: disabled },
        }),
        prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_PASSWORD_LOGIN_TOGGLED',
                ipAddress: getClientIP(request),
                userAgent: getDeviceInfo(request),
                details: { passwordLoginDisabled: disabled },
            },
        }),
    ]);

    return successResponse({ passwordLoginDisabled: disabled });
}
