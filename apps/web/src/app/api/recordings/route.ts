/**
 * GET  /api/recordings — list this user's session recordings (no content)
 * POST /api/recordings — save a completed asciicast recording
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { recordingCreateRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';
import { encryptField } from '@/lib/crypto/crypto';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

// A little over the gateway's 5 MB cap, to leave room for JSON overhead.
const createRecordingSchema = z.object({
    serverId: z.string().min(1),
    content: z
        .string()
        .min(1)
        .max(6 * 1024 * 1024),
    durationSec: z.number().int().min(0),
    sizeBytes: z.number().int().min(0),
});

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const recordings = await prisma.recording.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            serverId: true,
            serverName: true,
            durationSec: true,
            sizeBytes: true,
            createdAt: true,
        },
    });

    return successResponse({ recordings });
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const rateLimitResult = recordingCreateRateLimit(user.id);
    if (!rateLimitResult.allowed) {
        return errorResponse(
            'Too many recordings saved recently. Please wait before trying again.',
            429,
        );
    }

    const validation = await validateBody(request, createRecordingSchema);
    if ('error' in validation) {
        return validation.error;
    }

    const { serverId, content, durationSec, sizeBytes } = validation.data;

    const server = await getServerById(serverId, user.id);
    if (!server) return notFoundResponse('Server not found');

    try {
        const recording = await prisma.recording.create({
            data: {
                userId: user.id,
                serverId,
                serverName: server.name,
                // Terminal output can contain anything shown on screen during the
                // session — file contents, env vars, secrets — so it's encrypted
                // at rest the same as credential fields.
                content: encryptField(content),
                durationSec,
                sizeBytes,
            },
            select: {
                id: true,
                serverId: true,
                serverName: true,
                durationSec: true,
                sizeBytes: true,
                createdAt: true,
            },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'RECORDING_SAVED',
                resource: `server:${serverId}`,
                details: { recordingId: recording.id, durationSec, sizeBytes },
            },
        });

        return successResponse({ recording }, 201);
    } catch (err) {
        console.error('[Recordings] Failed to save recording:', err);
        return errorResponse('Failed to save recording', 500);
    }
}
