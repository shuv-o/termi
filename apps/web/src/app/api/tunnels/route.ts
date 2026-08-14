/**
 * GET /api/tunnels - List this user's open port-forward tunnels
 * POST /api/tunnels - Open a new tunnel through an SSH server
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { createTunnel, listTunnels } from '@/lib/services';
import { tunnelCreateRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

const createTunnelSchema = z.object({
    serverId: z.string().min(1),
    remoteHost: z.string().min(1).max(255),
    remotePort: z.number().int().min(1).max(65535),
});

export async function GET() {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    return successResponse({ tunnels: listTunnels(user.id) });
}

export async function POST(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const rateLimitResult = tunnelCreateRateLimit(user.id);
    if (!rateLimitResult.allowed) {
        return errorResponse(
            'Too many tunnels opened recently. Please wait before trying again.',
            429,
        );
    }

    const validation = await validateBody(request, createTunnelSchema);
    if ('error' in validation) {
        return validation.error;
    }

    try {
        const result = await createTunnel(
            user.id,
            validation.data.serverId,
            validation.data.remoteHost,
            validation.data.remotePort,
        );

        if ('error' in result) {
            return errorResponse(result.error, 400);
        }

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'TUNNEL_OPENED',
                resource: `server:${validation.data.serverId}`,
                details: {
                    remoteHost: validation.data.remoteHost,
                    remotePort: validation.data.remotePort,
                    localPort: result.tunnel.localPort,
                },
            },
        });

        return successResponse({ tunnel: result.tunnel }, 201);
    } catch (error) {
        console.error('Create tunnel error:', error);
        return errorResponse('Failed to open tunnel', 500);
    }
}
