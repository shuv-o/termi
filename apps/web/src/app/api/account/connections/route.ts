/**
 * GET /api/account/connections?before=<ISO date>
 *
 * The signed-in user's own connection history (terminals, file browsers and
 * desktops they opened), newest first, 50 at a time.
 */

import { getCurrentUser } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { listConnections } from '@/lib/services/connection-history.service';

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const before = new URL(request.url).searchParams.get('before');
    const beforeDate = before ? new Date(before) : null;
    const valid = beforeDate && !isNaN(beforeDate.getTime()) ? beforeDate : null;

    return successResponse(await listConnections(user.id, valid));
}
