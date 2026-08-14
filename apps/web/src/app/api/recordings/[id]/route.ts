/**
 * GET    /api/recordings/[id] — fetch one recording, including its content
 * DELETE /api/recordings/[id] — delete one recording
 */

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const recording = await prisma.recording.findFirst({
        where: { id, userId: user.id },
    });
    if (!recording) return notFoundResponse('Recording not found');

    return successResponse({ recording });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const recording = await prisma.recording.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
    });
    if (!recording) return notFoundResponse('Recording not found');

    try {
        await prisma.recording.delete({ where: { id } });

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'RECORDING_DELETED',
                resource: `recording:${id}`,
            },
        });

        return successResponse({ deleted: true });
    } catch (err) {
        console.error('[Recordings] Failed to delete recording:', err);
        return errorResponse('Failed to delete recording', 500);
    }
}
