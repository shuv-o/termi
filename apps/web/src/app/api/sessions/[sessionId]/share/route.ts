/** POST /api/sessions/[sessionId]/share — a join link for your live session. */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { errorResponse, successResponse, unauthorizedResponse, validateBody } from '@/lib/api';
import { SessionShareError, shareSession } from '@/lib/services/session-share.service';

const schema = z.object({ mode: z.enum(['view', 'control']).default('view') });

export async function POST(
    request: Request,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const v = await validateBody(request, schema);
    if ('error' in v) return v.error;
    const { sessionId } = await params;
    try {
        return successResponse({ share: await shareSession(user.id, sessionId, v.data.mode) }, 201);
    } catch (err) {
        if (err instanceof SessionShareError) return errorResponse(err.message, err.status);
        throw err;
    }
}
