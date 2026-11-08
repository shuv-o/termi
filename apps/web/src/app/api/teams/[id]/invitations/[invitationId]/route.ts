/** DELETE /api/teams/[id]/invitations/[invitationId] — withdraw a pending invitation (admins) */

import { successResponse } from '@/lib/api';
import { revokeInvitation } from '@/lib/services/team.service';
import { teamRoute } from '@/lib/services/team-route';

export async function DELETE(
    _r: Request,
    { params }: { params: Promise<{ id: string; invitationId: string }> },
) {
    const { id, invitationId } = await params;
    return teamRoute(async (userId) => {
        await revokeInvitation(id, userId, invitationId);
        return successResponse({ revoked: true });
    });
}
