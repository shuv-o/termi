/**
 * POST /api/internal/access-check — gateway only.
 *
 * The gateway sends what each of its open connections relies on (sign-in,
 * user, server, share link) and gets back the ones to close. Authenticated
 * with a gateway service token (`Authorization: Bearer`, purpose
 * "access-check"); see lib/services/access-check.service.ts.
 */

import { z } from 'zod';
import { verifyServiceToken } from '@/lib/auth';
import { errorResponse, successResponse, validateBody } from '@/lib/api';
import { verifyDeviceRequest } from '@/lib/auth/device';
import { checkAccess, MESSAGES } from '@/lib/services/access-check.service';

const id = z.string().min(1).max(200);
const schema = z.object({
    grants: z
        .array(
            z.object({
                key: z.string().min(1).max(1000),
                sid: id.nullable(),
                userId: id,
                kind: z.enum(['server', 'local', 'guest']),
                serverId: id.optional(),
                shareId: id.optional(),
            }),
        )
        .max(20_000),
});

export async function POST(request: Request) {
    const auth = request.headers.get('authorization') ?? '';
    // The shared gateway (service token), or a desktop app's own gateway
    // (device-signed), which may only ask about its own user's connections.
    let deviceUser: string | null = null;
    if (auth.startsWith('Device ')) {
        const device = await verifyDeviceRequest(auth, 'access-check');
        if (!device) return errorResponse('Unauthorized', 401);
        deviceUser = device.userId;
    } else {
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token || !(await verifyServiceToken(token, 'access-check'))) {
            return errorResponse('Unauthorized', 401);
        }
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;
    const { grants } = validation.data;

    if (deviceUser === null) return successResponse({ denied: await checkAccess(grants) });
    const own = grants.filter((g) => g.userId === deviceUser);
    const foreign = grants
        .filter((g) => g.userId !== deviceUser)
        .map((g) => ({ key: g.key, message: MESSAGES.signedOut }));
    return successResponse({ denied: [...foreign, ...(await checkAccess(own))] });
}
