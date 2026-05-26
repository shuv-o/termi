import { getCurrentUser } from '@/lib/auth';
import { revokeShare, revokeInvitation } from '@/lib/services/share.service';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string; shareId: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { shareId } = await params;

    // shareId can be either a share ID or an invitation ID (prefixed with "inv:")
    if (shareId.startsWith('inv:')) {
        const invitationId = shareId.slice(4);
        const result = await revokeInvitation(invitationId, user.id);
        if (!result.success) return errorResponse(result.error!, 400);
        return successResponse({ message: 'Invitation revoked' });
    }

    const result = await revokeShare(shareId, user.id);
    if (!result.success) return errorResponse(result.error!, 400);
    return successResponse({ message: 'Share revoked' });
}
