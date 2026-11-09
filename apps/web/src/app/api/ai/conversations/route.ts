/**
 * GET    /api/ai/conversations — the user's conversations, newest first
 * DELETE /api/ai/conversations — delete all of them
 */

import { getCurrentUser } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { deleteAllConversations, listConversations } from '@/lib/services/ai.service';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    return successResponse({ conversations: await listConversations(user.id) });
}

export async function DELETE() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    return successResponse({ deleted: await deleteAllConversations(user.id) });
}
