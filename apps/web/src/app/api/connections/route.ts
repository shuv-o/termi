/**
 * GET /api/connections — the signed-in user's open connections on every
 * gateway (terminals running in the background included); `?serverId=` keeps
 * those to one server. See lib/services/live-connection.service.ts.
 */

import { getCurrentUser, getCurrentSessionId } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { listLiveConnections } from '@/lib/services/live-connection.service';

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const sid = await getCurrentSessionId();
    const serverId = new URL(request.url).searchParams.get('serverId')?.slice(0, 100) || undefined;
    return successResponse(await listLiveConnections(user.id, sid, serverId));
}
