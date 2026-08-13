/**
 * POST /api/groups/[id]/broadcast - Run one command across every SSH server in a group
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getBroadcastableServers, runBroadcast } from '@/lib/services';
import { broadcastCommandRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

const broadcastSchema = z.object({
    command: z.string().min(1).max(4000),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const rateLimitResult = broadcastCommandRateLimit(user.id);
    if (!rateLimitResult.allowed) {
        return errorResponse('Too many broadcasts. Please wait before running another.', 429);
    }

    const { id } = await params;
    const validation = await validateBody(request, broadcastSchema);

    if ('error' in validation) {
        return validation.error;
    }

    try {
        const servers = await getBroadcastableServers(id, user.id);

        if (servers === null) {
            return errorResponse('Group not found', 404);
        }

        if (servers.length === 0) {
            return errorResponse('This group has no SSH servers to run a command on.', 400);
        }

        const results = await runBroadcast(servers, validation.data.command);
        const successCount = results.filter((r) => r.success).length;

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'GROUP_BROADCAST_RUN',
                resource: `group:${id}`,
                details: {
                    command: validation.data.command,
                    serverCount: servers.length,
                    successCount,
                },
            },
        });

        return successResponse({ results, serverCount: servers.length, successCount });
    } catch (error) {
        console.error('Broadcast command error:', error);
        return errorResponse('Failed to run the broadcast command', 500);
    }
}
