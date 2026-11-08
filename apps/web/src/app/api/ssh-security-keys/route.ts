/**
 * GET  /api/ssh-security-keys — your SSH security keys (with authorized_keys lines)
 * POST /api/ssh-security-keys — finish enrolling one
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { errorResponse, successResponse, unauthorizedResponse, validateBody } from '@/lib/api';
import { authorizedKeysLine, SSHD_CONFIG_LINE, verifyEnrollment } from '@/lib/ssh/security-key';

const MAX_KEYS = 10;

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const keys = await prisma.sshSecurityKey.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
    });
    return successResponse({
        sshdConfigLine: SSHD_CONFIG_LINE,
        keys: keys.map((k) => ({
            id: k.id,
            label: k.label,
            createdAt: k.createdAt,
            lastUsedAt: k.lastUsedAt,
            authorizedKey: authorizedKeysLine(k.publicKey, k.label),
        })),
    });
}

const schema = z.object({
    label: z.string().trim().min(1).max(40),
    // A WebAuthn RegistrationResponseJSON; verified below.
    response: z.object({ id: z.string(), rawId: z.string(), type: z.string() }).passthrough(),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const v = await validateBody(request, schema);
    if ('error' in v) return v.error;
    const session = await getSession();
    const challenge = session.sshKeyChallenge;
    session.sshKeyChallenge = undefined;
    await session.save();
    if (!challenge) return errorResponse('Start again: the request expired', 400);
    if ((await prisma.sshSecurityKey.count({ where: { userId: user.id } })) >= MAX_KEYS) {
        return errorResponse(`You can add up to ${MAX_KEYS} security keys`, 400);
    }
    let enrolled;
    try {
        enrolled = await verifyEnrollment(v.data.response as never, challenge);
    } catch (err) {
        return errorResponse(
            (err as Error).message || 'The security key could not be verified',
            400,
        );
    }
    const key = await prisma.sshSecurityKey.create({
        data: { userId: user.id, label: v.data.label, ...enrolled },
    });
    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'SSH_SECURITY_KEY_ADDED',
            resource: `ssh-key:${key.id}`,
            details: { name: key.label },
        },
    });
    return successResponse(
        {
            key: {
                id: key.id,
                label: key.label,
                authorizedKey: authorizedKeysLine(key.publicKey, key.label),
            },
        },
        201,
    );
}
