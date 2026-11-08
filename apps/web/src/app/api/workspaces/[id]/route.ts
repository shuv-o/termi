/** DELETE /api/workspaces/[id] — remove a saved workspace. */

import { getCurrentUser } from '@/lib/auth';
import { successResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';
import { deleteWorkspace } from '@/lib/services/workspace.service';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    if (!(await deleteWorkspace(user.id, id))) return notFoundResponse('Workspace not found');
    return successResponse({ deleted: true });
}
