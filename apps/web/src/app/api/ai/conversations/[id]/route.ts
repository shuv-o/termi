/**
 * GET    /api/ai/conversations/[id] — one conversation with its messages
 * DELETE /api/ai/conversations/[id] — delete it
 */

import { getCurrentUser } from '@/lib/auth';
import { notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api';
import { deleteConversation, getConversation } from '@/lib/services/ai.service';

interface P {
    params: Promise<{ id: string }>;
}

export async function GET(_r: Request, { params }: P) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const conversation = await getConversation(user.id, (await params).id);
    return conversation
        ? successResponse({ conversation })
        : notFoundResponse('Conversation not found');
}

export async function DELETE(_r: Request, { params }: P) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    return (await deleteConversation(user.id, (await params).id))
        ? successResponse({ deleted: true })
        : notFoundResponse('Conversation not found');
}
