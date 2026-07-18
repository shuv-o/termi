/**
 * GET  /api/snippets — list the user's terminal command snippets
 * POST /api/snippets — create one
 */

import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { getSnippets, createSnippet } from '@/lib/services';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

/** Long enough for a real one-liner, short enough not to be a payload channel. */
const MAX_COMMAND_LENGTH = 2000;

/** Cap per user — the toolbar stops being useful long before this. */
const MAX_SNIPPETS = 50;

const createSchema = z.object({
    label: z.string().min(1, 'Label is required').max(40),
    command: z.string().min(1, 'Command is required').max(MAX_COMMAND_LENGTH),
    icon: z.string().max(64).optional(),
    runImmediately: z.boolean().optional(),
});

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        const snippets = await getSnippets(user.id);
        return successResponse({ snippets });
    } catch (error) {
        console.error('Get snippets error:', error);
        return errorResponse('Failed to fetch snippets', 500);
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, createSchema);
    if ('error' in validation) return validation.error;

    try {
        const existing = await getSnippets(user.id);
        if (existing.length >= MAX_SNIPPETS) {
            return errorResponse(`You can save at most ${MAX_SNIPPETS} snippets.`, 400);
        }

        const snippet = await createSnippet(user.id, validation.data);
        return successResponse({ snippet }, 201);
    } catch (error) {
        console.error('Create snippet error:', error);
        return errorResponse('Failed to create snippet', 500);
    }
}
