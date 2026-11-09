/**
 * GET    /api/ai/memory — what the assistant remembers about the user
 * DELETE /api/ai/memory — forget everything
 */

import { getCurrentUser } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { clearMemories, listMemories } from '@/lib/services/ai.service';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    return successResponse({ memories: await listMemories(user.id) });
}

export async function DELETE() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    return successResponse({ deleted: await clearMemories(user.id) });
}
