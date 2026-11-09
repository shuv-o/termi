/**
 * POST /api/devices/host-key — a desktop app's gateway reports the host key a
 * server presented the first time it connected there directly.
 *
 * Signed by the device (Authorization: Device <jwt>). Recorded only for a
 * server (or its bastion) that the device's user owns and that has no key yet;
 * a recorded key is never replaced here.
 */

import { z } from 'zod';
import { verifyDeviceRequest } from '@/lib/auth/device';
import { prisma } from '@/lib/db';
import { errorResponse, successResponse, validateBody } from '@/lib/api';
import { deviceHostKeyRateLimit } from '@/lib/security/rate-limit';
import { pinFirstHostKey } from '@/lib/services/host-key.service';

const schema = z.object({
    serverId: z.string().min(1).max(64),
    jump: z.boolean(),
    fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
    keyType: z.string().regex(/^[a-z0-9@.-]{3,64}$/),
});

export async function POST(request: Request) {
    const device = await verifyDeviceRequest(request.headers.get('authorization'), 'host-key');
    if (!device) return errorResponse('Unauthorized', 401);
    if (!(await deviceHostKeyRateLimit(device.id)).allowed) {
        return errorResponse('Too many requests', 429);
    }
    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;
    const { serverId, jump, fingerprint, keyType } = validation.data;

    const server = await prisma.server.findFirst({
        where: { id: serverId, userId: device.userId },
        select: { id: true, jumpServerId: true },
    });
    if (!server) return errorResponse('Server not found', 404);
    const targetId = jump ? server.jumpServerId : server.id;
    if (!targetId) return errorResponse('Server not found', 404);
    const target = await prisma.server.findFirst({
        where: { id: targetId, userId: device.userId },
        select: { id: true },
    });
    if (!target) return errorResponse('Server not found', 404);

    // Only fills an empty pin; never changes one.
    const pinned = await pinFirstHostKey(target.id, fingerprint, keyType);
    return successResponse({ pinned: pinned === fingerprint });
}
