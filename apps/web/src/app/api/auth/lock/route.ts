/** POST /api/auth/lock — lock this session (the app went idle, or "Lock now"). */

import { getSession, setSessionLocked, validateSession } from '@/lib/auth/session';
import { successResponse, unauthorizedResponse } from '@/lib/api';

export async function POST() {
    const session = await getSession();
    if (!session.isLoggedIn || !session.sessionToken) return unauthorizedResponse();
    if (!(await validateSession(session.sessionToken))) return unauthorizedResponse();
    await setSessionLocked(session.sessionToken, true);
    return successResponse({ locked: true });
}
