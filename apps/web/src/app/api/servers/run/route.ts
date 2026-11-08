/**
 * POST /api/servers/run — run one command on several of the user's SSH
 * servers at once (the same engine as a group broadcast, for any selection).
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { broadcastCommandRateLimit } from '@/lib/rate-limit';
import { getRunnableServers, MAX_RUN_SERVERS, runBroadcast } from '@/lib/services';

const schema = z.object({
    serverIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_RUN_SERVERS),
    command: z.string().min(1).max(4000),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    if (!(await broadcastCommandRateLimit(user.id)).allowed) {
        return errorResponse('Too many runs. Please wait before running another.', 429);
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;
    const { serverIds, command } = validation.data;

    try {
        const servers = await getRunnableServers([...new Set(serverIds)], user.id);
        if (servers.length === 0) {
            return errorResponse('None of the chosen servers can run commands.', 400);
        }
        const results = await runBroadcast(servers, command);
        const successCount = results.filter((r) => r.success).length;
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'SERVERS_COMMAND_RUN',
                resource: 'servers',
                details: { command, serverCount: servers.length, successCount },
            },
        });
        return successResponse({ results, serverCount: servers.length, successCount });
    } catch (error) {
        console.error('Run command error:', error);
        return errorResponse('Failed to run the command', 500);
    }
}
