/** DELETE /api/session-shares/[id] — turn a join link off (people already in stay until removed). */

import { getCurrentUser } from '@/lib/auth';
import { notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api';
import { revokeSessionShare } from '@/lib/services/session-share.service';

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    return (await revokeSessionShare(user.id, id))
        ? successResponse({ revoked: true })
        : notFoundResponse('Link not found');
}
