/** GET /api/ai/models — models the user's current provider offers, for the picker. */

import { getCurrentUser } from '@/lib/auth';
import { errorResponse, successResponse, unauthorizedResponse } from '@/lib/api';
import { AiError } from '@/lib/ai/config';
import { aiModelsRateLimit } from '@/lib/security/rate-limit';
import { modelsFor } from '@/lib/services/ai.service';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    if (!(await aiModelsRateLimit(user.id)).allowed) {
        return errorResponse('Too many requests. Please wait a moment.', 429);
    }
    try {
        return successResponse({ models: await modelsFor(user.id) });
    } catch (err) {
        if (err instanceof AiError) return errorResponse(err.message, err.status);
        throw err;
    }
}
