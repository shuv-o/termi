/**
 * DELETE /api/tunnel-sessions/[id] — mark a tunnel session closed (bookkeeping only)
 */

import { getCurrentUser } from '@/lib/auth';
import { closeTunnelSession } from '@/lib/services';
import { successResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const closed = await closeTunnelSession(id, user.id);
    if (!closed) return notFoundResponse('Tunnel not found');

    return successResponse({ closed: true });
}
