/**
 * GET    /api/devices — whether this sign-in's desktop app may connect directly
 * POST   /api/devices — allow it (needs a fresh password, code or passkey)
 * DELETE /api/devices — stop allowing it
 *
 * A registered device receives server logins sealed to its key, for the
 * user's own servers only; see lib/auth/device.ts.
 */

import { z } from 'zod';
import { getCurrentSessionId, getCurrentUser } from '@/lib/auth';
import { getSession } from '@/lib/auth/session';
import { hasReauthProof, reauthFields, verifyReauth } from '@/lib/auth/reauth';
import {
    errorResponse,
    getClientIP,
    getDeviceInfo,
    successResponse,
    unauthorizedResponse,
    validateBody,
} from '@/lib/api';
import { deviceRegisterRateLimit } from '@/lib/security/rate-limit';
import {
    currentDevice,
    DeviceError,
    registerDevice,
    removeDevice,
} from '@/lib/services/device.service';

const STEP_UP_GRACE_MS = 5 * 60 * 1000;

const schema = z.object({
    name: z.string().trim().min(1).max(100),
    encKey: z.record(z.string(), z.unknown()),
    sigKey: z.record(z.string(), z.unknown()),
    ...reauthFields,
});

async function who() {
    const user = await getCurrentUser();
    const sid = await getCurrentSessionId();
    return user && sid ? { user, sid } : null;
}

export async function GET() {
    const me = await who();
    if (!me) return unauthorizedResponse();
    const device = await currentDevice(me.user.id, me.sid);
    return successResponse({
        device: device && { keyId: device.keyId, name: device.name, createdAt: device.createdAt },
    });
}

export async function POST(request: Request) {
    const me = await who();
    if (!me) return unauthorizedResponse();
    if (!(await deviceRegisterRateLimit(me.user.id)).allowed) {
        return errorResponse('Too many attempts. Please wait a while.', 429);
    }
    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;
    const { name, encKey, sigKey, ...auth } = validation.data;

    // Like revealing a password: this device will receive server logins.
    const session = await getSession();
    const recent =
        typeof session.stepUpAt === 'number' && Date.now() - session.stepUpAt < STEP_UP_GRACE_MS;
    if (!recent) {
        if (!hasReauthProof(auth)) return errorResponse('Re-authentication required', 401);
        if (!(await verifyReauth(me.user.id, auth)))
            return errorResponse('Authentication failed', 401);
        session.stepUpAt = Date.now();
        await session.save();
    }

    try {
        const device = await registerDevice(
            me.user.id,
            me.sid,
            { name, encKey, sigKey },
            { ipAddress: getClientIP(request), deviceInfo: getDeviceInfo(request) },
        );
        return successResponse({
            device: { keyId: device.keyId, name: device.name, createdAt: device.createdAt },
        });
    } catch (err) {
        if (err instanceof DeviceError) return errorResponse(err.message, err.status);
        throw err;
    }
}

export async function DELETE() {
    const me = await who();
    if (!me) return unauthorizedResponse();
    return successResponse({ removed: await removeDevice(me.user.id, me.sid) });
}
