/** DELETE /api/ai/memory/[id] — forget one thing. */

import { getCurrentUser } from '@/lib/auth';
import { notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api';
import { deleteMemory } from '@/lib/services/ai.service';

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    return (await deleteMemory(user.id, (await params).id))
        ? successResponse({ deleted: true })
        : notFoundResponse('Memory not found');
}
