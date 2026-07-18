/**
 * PATCH  /api/snippets/[id] — update a terminal command snippet
 * DELETE /api/snippets/[id] — remove one
 */

import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { updateSnippet, deleteSnippet } from '@/lib/services';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

const updateSchema = z
    .object({
        label: z.string().min(1).max(40).optional(),
        command: z.string().min(1).max(2000).optional(),
        icon: z.string().max(64).optional(),
        runImmediately: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(1000).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, updateSchema);
    if ('error' in validation) return validation.error;

    const { id } = await params;

    try {
        const snippet = await updateSnippet(id, user.id, validation.data);
        if (!snippet) return notFoundResponse('Snippet not found');

        return successResponse({ snippet });
    } catch (error) {
        console.error('Update snippet error:', error);
        return errorResponse('Failed to update snippet', 500);
    }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    try {
        const deleted = await deleteSnippet(id, user.id);
        if (!deleted) return notFoundResponse('Snippet not found');

        return successResponse({ deleted: true });
    } catch (error) {
        console.error('Delete snippet error:', error);
        return errorResponse('Failed to delete snippet', 500);
    }
}
