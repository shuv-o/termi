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
import { checkAccess } from '@/lib/services/access-check.service';

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
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !(await verifyServiceToken(token, 'access-check'))) {
        return errorResponse('Unauthorized', 401);
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    return successResponse({ denied: await checkAccess(validation.data.grants) });
}
