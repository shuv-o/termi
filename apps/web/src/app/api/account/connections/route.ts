/**
 * GET /api/account/connections?before=<ISO date>[&serverId=<id>&limit=<n>]
 *
 * The signed-in user's own connection history (terminals, file browsers and
 * desktops they opened), newest first, 50 at a time; `serverId` keeps one
 * server's entries (the server details page).
 */

import { getCurrentUser } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { listConnections } from '@/lib/services/connection-history.service';

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const params = new URL(request.url).searchParams;
    const before = params.get('before');
    const serverId = params.get('serverId')?.slice(0, 100) || undefined;
    const limit = parseInt(params.get('limit') || '', 10) || undefined;
    const beforeDate = before ? new Date(before) : null;
    const valid = beforeDate && !isNaN(beforeDate.getTime()) ? beforeDate : null;

    return successResponse(await listConnections(user.id, valid, { serverId, limit }));
}
