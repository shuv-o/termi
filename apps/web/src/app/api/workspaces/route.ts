/**
 * GET  /api/workspaces — the user's saved workspaces (tabs resolved against
 *                        current server access)
 * POST /api/workspaces — save one; saving under an existing name replaces it
 */

import { getCurrentUser } from '@/lib/auth';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import {
    listWorkspaces,
    saveWorkspace,
    workspaceSchema,
    WorkspaceError,
} from '@/lib/services/workspace.service';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    try {
        return successResponse({ workspaces: await listWorkspaces(user.id) });
    } catch (error) {
        console.error('List workspaces error:', error);
        return errorResponse('Failed to load workspaces', 500);
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, workspaceSchema);
    if ('error' in validation) return validation.error;

    try {
        const workspace = await saveWorkspace(user.id, validation.data);
        return successResponse({ workspace: { id: workspace.id, name: workspace.name } }, 201);
    } catch (error) {
        if (error instanceof WorkspaceError) return errorResponse(error.message, 400);
        console.error('Save workspace error:', error);
        return errorResponse('Failed to save workspace', 500);
    }
}
