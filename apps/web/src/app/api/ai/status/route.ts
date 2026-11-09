/** GET /api/ai/status — whether the assistant is available to this user, and from where. */

import { getCurrentUser } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { aiStatus } from '@/lib/services/ai.service';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    return successResponse(await aiStatus(user.id));
}
