/** PATCH /api/account/lock — lock the app after N idle minutes (null = never). */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse, validateBody } from '@/lib/api';

const schema = z.object({
    lockAfterMinutes: z.union([z.literal(null), z.number().int().min(1).max(24 * 60)]),
});

export async function PATCH(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const v = await validateBody(request, schema);
    if ('error' in v) return v.error;
    await prisma.user.update({
        where: { id: user.id },
        data: { lockAfterMinutes: v.data.lockAfterMinutes },
    });
    return successResponse({ lockAfterMinutes: v.data.lockAfterMinutes });
}
