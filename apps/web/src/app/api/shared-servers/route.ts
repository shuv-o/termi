import { getCurrentUser } from '@/lib/auth';
import { getSharedServers } from '@/lib/services/share.service';
import { teamServersFor } from '@/lib/services/team.service';
import { successResponse, unauthorizedResponse, errorResponse } from '@/lib/api';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        const [shared, viaTeams] = await Promise.all([
            getSharedServers(user.id),
            teamServersFor(user.id),
        ]);
        const ids = new Set(shared.map((s) => s.id));
        return successResponse({ servers: [...shared, ...viaTeams.filter((s) => !ids.has(s.id))] });
    } catch (error) {
        console.error('Get shared servers error:', error);
        return errorResponse('Failed to fetch shared servers', 500);
    }
}
