/**
 * GET    /api/recordings/[id] — fetch one recording, including its content
 * DELETE /api/recordings/[id] — delete one recording
 */

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decrypt, deserializeEncrypted } from '@/lib/crypto/crypto';
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

    let content: string;
    try {
        content = decrypt(deserializeEncrypted(recording.content));
    } catch (err) {
        console.error('[Recordings] Failed to decrypt content:', err);
        return errorResponse('Failed to read recording', 500);
    }

    return successResponse({ recording: { ...recording, content } });
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
        await prisma.recording.delete({ where: { id, userId: user.id } });

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
