/**
 * GET  /api/session-shares/join/[code] — whose session the link is for
 * POST /api/session-shares/join/[code] — a guest token (the owner still has to let you in)
 */

import { getCurrentSessionId, getCurrentUser } from '@/lib/auth';
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api';
import { connectionTokenRateLimit } from '@/lib/security/rate-limit';
import { describeShare, joinShare, SessionShareError } from '@/lib/services/session-share.service';

interface P {
    params: Promise<{ code: string }>;
}

async function handle(fn: () => Promise<Response>) {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof SessionShareError) return errorResponse(err.message, err.status);
        throw err;
    }
}

export async function GET(_r: Request, { params }: P) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const { code } = await params;
    return handle(async () => successResponse({ share: await describeShare(code) }));
}

export async function POST(_r: Request, { params }: P) {
    const user = await getCurrentUser();
    const sid = await getCurrentSessionId();
    if (!user || !sid) return unauthorizedResponse();
    if (!(await connectionTokenRateLimit(user.id)).allowed) {
        return errorResponse('Too many requests. Please wait a moment.', 429);
    }
    const { code } = await params;
    return handle(async () => successResponse(await joinShare(code, user.id, sid)));
}
