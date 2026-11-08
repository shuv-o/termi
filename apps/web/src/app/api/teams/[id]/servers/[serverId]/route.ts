/** DELETE /api/teams/[id]/servers/[serverId] — take a server out of the vault (its owner or an admin) */

import { successResponse } from '@/lib/api';
import { removeServerFromTeam } from '@/lib/services/team.service';
import { teamRoute } from '@/lib/services/team-route';

export async function DELETE(
    _r: Request,
    { params }: { params: Promise<{ id: string; serverId: string }> },
) {
    const { id, serverId } = await params;
    return teamRoute(async (userId) => {
        await removeServerFromTeam(id, userId, serverId);
        return successResponse({ removed: true });
    });
}
