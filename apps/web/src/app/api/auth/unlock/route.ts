/**
 * POST /api/auth/unlock — unlock this session with a password, 2FA code or
 * passkey. Five wrong answers sign the session out entirely, so a locked
 * screen can't be used to guess the password.
 */

import { z } from 'zod';
import { getLockedSessionUser } from '@/lib/auth';
import { reauthFields, hasReauthProof, verifyReauth } from '@/lib/auth/reauth';
import { getSession, revokeSession, setSessionLocked } from '@/lib/auth/session';
import { countEvent, resetCounter } from '@/lib/security/rate-limit';
import { errorResponse, successResponse, unauthorizedResponse, validateBody } from '@/lib/api';

const MAX_FAILURES = 5;
const schema = z.object({ ...reauthFields });

export async function POST(request: Request) {
    const user = await getLockedSessionUser();
    if (!user) return unauthorizedResponse('Not locked');
    const v = await validateBody(request, schema);
    if ('error' in v) return v.error;
    if (!hasReauthProof(v.data)) return errorResponse('Enter your password or use a passkey', 400);

    const key = `unlock-fail:${user.sessionRowId}`;
    if (!(await verifyReauth(user.id, v.data))) {
        if ((await countEvent(key, 60 * 60 * 1000)) >= MAX_FAILURES) {
            await revokeSession(user.sessionRowId, user.id, 'Too many failed unlock attempts');
            const session = await getSession();
            session.destroy();
            return unauthorizedResponse('Too many attempts — you have been signed out');
        }
        return errorResponse('That did not match', 401);
    }
    await resetCounter(key);
    await setSessionLocked(user.sessionToken, false);
    return successResponse({ unlocked: true });
}
