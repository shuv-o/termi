/**
 * PATCH /api/auth/profile
 * Update the current user's display name.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { validateBody, successResponse, unauthorizedResponse } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
});

export async function PATCH(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const { name } = validation.data;

    await prisma.user.update({
        where: { id: user.id },
        data: { name },
    });

    return successResponse({ name });
}
