import { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/db/prisma';

// DELETE /api/sessions/[sessionId] — remove a persistent session
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) return unauthorizedResponse();

    const { sessionId } = await params;

    await prisma.persistentSession.deleteMany({
        where: { sessionId, userId: session.userId },
    });

    return successResponse({ deleted: true });
}

// PATCH /api/sessions/[sessionId] — update sessionId (used when gateway issues session-not-found)
const patchSchema = z.object({
    newSessionId: z.string().uuid(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) return unauthorizedResponse();

    const validation = await validateBody(request, patchSchema);
    if ('error' in validation) return validation.error;

    const { sessionId } = await params;
    const { newSessionId } = validation.data;

    const existing = await prisma.persistentSession.findFirst({
        where: { sessionId, userId: session.userId },
    });
    if (!existing) return errorResponse('Session not found', 404);

    await prisma.persistentSession.update({
        where: { id: existing.id },
        data: { sessionId: newSessionId, updatedAt: new Date() },
    });

    return successResponse({ updated: true });
}
