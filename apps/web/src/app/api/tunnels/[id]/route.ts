/**
 * DELETE /api/tunnels/[id] - Close a port-forward tunnel
 */

import { getCurrentUser } from '@/lib/auth';
import { closeTunnel } from '@/lib/services';
import { prisma } from '@/lib/db';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        const closed = closeTunnel(id, user.id);

        if (!closed) {
            return errorResponse('Tunnel not found', 404);
        }

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'TUNNEL_CLOSED',
                resource: `tunnel:${id}`,
            },
        });

        return successResponse({ closed: true });
    } catch (error) {
        console.error('Close tunnel error:', error);
        return errorResponse('Failed to close tunnel', 500);
    }
}
