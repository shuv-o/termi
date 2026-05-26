import { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody, successResponse, unauthorizedResponse } from '@/lib/api';
import { getSession } from '@/lib/auth/session';
import prisma from '@/lib/db/prisma';

// GET /api/sessions — list current user's persistent sessions
export async function GET() {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) return unauthorizedResponse();

    const sessions = await prisma.persistentSession.findMany({
        where: { userId: session.userId },
        orderBy: { updatedAt: 'asc' },
        select: { sessionId: true, serverId: true, serverName: true, createdAt: true, updatedAt: true },
    });

    return successResponse({ sessions });
}

// POST /api/sessions — register or update a persistent session
const createSchema = z.object({
    sessionId: z.string().uuid(),
    serverId: z.string().min(1),
    serverName: z.string().min(1),
});

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId) return unauthorizedResponse();

    const validation = await validateBody(request, createSchema);
    if ('error' in validation) return validation.error;

    const { sessionId, serverId, serverName } = validation.data;

    const record = await prisma.persistentSession.upsert({
        where: { sessionId },
        create: { userId: session.userId, sessionId, serverId, serverName },
        update: { serverName, updatedAt: new Date() },
        select: { sessionId: true, serverId: true, serverName: true },
    });

    return successResponse({ session: record });
}
