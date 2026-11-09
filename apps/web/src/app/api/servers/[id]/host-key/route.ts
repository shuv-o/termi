/**
 * /api/servers/[id]/host-key — the server's pinned SSH host key.
 *
 * GET               the pinned key (owner only)
 * GET ?check=1      also connect (key exchange only, no login) and report the
 *                   key the server presents now, so the owner can compare it
 * POST              trust a new key. The body names the fingerprint the owner
 *                   reviewed; it is stored only if the server presents exactly
 *                   that key right now. Trusting a key decides who receives the
 *                   stored login, so it needs the same step-up proof as
 *                   revealing a credential, and it is audit-logged.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getSession } from '@/lib/auth/session';
import { reauthFields, hasReauthProof, verifyReauth } from '@/lib/auth/reauth';
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
import { getServerById } from '@/lib/services';
import { probeHostKey, trustHostKey } from '@/lib/services/host-key.service';
import { connectionTestRateLimit } from '@/lib/security/rate-limit';
import { notifySecurityEvent } from '@/lib/services/security-alerts.service';

const STEP_UP_GRACE_MS = 5 * 60 * 1000;

interface RouteParams {
    params: Promise<{ id: string }>;
}

const SSH_PROTOCOLS = new Set(['SSH', 'SCP']);

export async function GET(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');
    if (!SSH_PROTOCOLS.has(server.protocol)) {
        return errorResponse('Only SSH servers have a host key', 400);
    }

    const pinned = server.hostKeyFingerprint
        ? {
              fingerprint: server.hostKeyFingerprint,
              keyType: server.hostKeyType,
              trustedAt: server.hostKeyTrustedAt,
          }
        : null;

    if (new URL(request.url).searchParams.get('check') !== '1') {
        return successResponse({ pinned });
    }

    if (!(await connectionTestRateLimit(user.id)).allowed) {
        return errorResponse('Too many checks. Please wait a few minutes.', 429);
    }
    try {
        const presented = await probeHostKey(server);
        return successResponse({
            pinned,
            presented,
            matches: pinned?.fingerprint === presented.fingerprint,
        });
    } catch (err) {
        return errorResponse(`Could not read the host key: ${(err as Error).message}`, 502);
    }
}

const trustSchema = z.object({
    fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/, 'Invalid fingerprint'),
    ...reauthFields,
});

export async function POST(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, trustSchema);
    if ('error' in validation) return validation.error;
    const { fingerprint, ...auth } = validation.data;
    const { id } = await params;

    if (!(await connectionTestRateLimit(user.id)).allowed) {
        return errorResponse('Too many requests. Please wait a few minutes.', 429);
    }

    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');
    if (!SSH_PROTOCOLS.has(server.protocol)) {
        return errorResponse('Only SSH servers have a host key', 400);
    }

    const session = await getSession();
    const recentlySteppedUp =
        typeof session.stepUpAt === 'number' && Date.now() - session.stepUpAt < STEP_UP_GRACE_MS;
    if (!recentlySteppedUp) {
        if (!hasReauthProof(auth)) return errorResponse('Re-authentication required', 401);
        if (!(await verifyReauth(user.id, auth))) {
            return errorResponse('Authentication failed', 401);
        }
        session.stepUpAt = Date.now();
        await session.save();
    }

    let presented;
    try {
        presented = await probeHostKey(server);
    } catch (err) {
        return errorResponse(`Could not read the host key: ${(err as Error).message}`, 502);
    }
    if (presented.fingerprint !== fingerprint) {
        return errorResponse(
            `The server now presents ${presented.fingerprint}, not the key you reviewed. Check it again.`,
            409,
        );
    }

    await trustHostKey(server.id, presented.fingerprint, presented.keyType);
    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'SERVER_HOST_KEY_TRUSTED',
            resource: `server:${server.id}`,
            details: {
                previous: server.hostKeyFingerprint,
                fingerprint: presented.fingerprint,
            },
            ipAddress: getClientIP(request),
            userAgent: getDeviceInfo(request),
        },
    });

    notifySecurityEvent(user.id, 'host_key_trusted', {
        ipAddress: getClientIP(request),
        deviceInfo: getDeviceInfo(request),
    });

    return successResponse({
        pinned: {
            fingerprint: presented.fingerprint,
            keyType: presented.keyType,
            trustedAt: new Date(),
        },
    });
}
