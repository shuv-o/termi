/**
 * GET /api/ai/settings — the user's own AI provider (the key is never returned).
 * PUT /api/ai/settings — change it. `apiKey`: a new key, null to remove, omit to keep.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { errorResponse, successResponse, unauthorizedResponse, validateBody } from '@/lib/api';
import { AI_PROVIDERS, AiError, DEFAULT_MODEL, MODEL_SUGGESTIONS } from '@/lib/ai/config';
import { getAiSettings, saveAiSettings } from '@/lib/services/ai.service';

const schema = z.object({
    provider: z.enum(AI_PROVIDERS as [string, ...string[]]).optional(),
    model: z.string().trim().max(200).nullable().optional(),
    baseUrl: z.string().trim().max(500).nullable().optional(),
    apiKey: z.string().trim().max(500).nullable().optional(),
    useOwn: z.boolean().optional(),
    memoryEnabled: z.boolean().optional(),
});

const extras = { defaults: DEFAULT_MODEL, suggestions: MODEL_SUGGESTIONS };

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    return successResponse({ settings: await getAiSettings(user.id), ...extras });
}

export async function PUT(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;
    try {
        const settings = await saveAiSettings(
            user.id,
            validation.data as Parameters<typeof saveAiSettings>[1],
        );
        return successResponse({ settings, ...extras });
    } catch (err) {
        if (err instanceof AiError) return errorResponse(err.message, err.status);
        throw err;
    }
}
