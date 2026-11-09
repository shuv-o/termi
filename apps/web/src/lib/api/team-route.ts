/** Shared plumbing for the /api/teams routes. */

import { getCurrentUser } from '@/lib/auth';
import { errorResponse, unauthorizedResponse } from '@/lib/api';
import { TeamError } from '@/lib/services/team.service';

/** Run `fn` for the signed-in user; TeamErrors become their status code. */
export async function teamRoute(fn: (userId: string) => Promise<Response>): Promise<Response> {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    try {
        return await fn(user.id);
    } catch (err) {
        if (err instanceof TeamError) return errorResponse(err.message, err.status);
        console.error('[teams]', err);
        return errorResponse('Something went wrong', 500);
    }
}
