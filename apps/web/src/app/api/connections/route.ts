/**
 * GET /api/connections — the signed-in user's open connections on every
 * gateway (terminals running in the background included). See
 * lib/services/live-connection.service.ts.
 */

import { getCurrentUser, getCurrentSessionId } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { listLiveConnections } from '@/lib/services/live-connection.service';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const sid = await getCurrentSessionId();
    return successResponse(await listLiveConnections(user.id, sid));
}
