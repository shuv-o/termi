/** POST /api/teams/[id]/members — invite someone by email (admins) */

import { z } from 'zod';
import { errorResponse, successResponse, validateBody } from '@/lib/api';
import { teamInviteRateLimit } from '@/lib/rate-limit';
import { inviteToTeam } from '@/lib/services/team.service';
import { teamRoute } from '@/lib/services/team-route';

const schema = z.object({
    email: z.string().trim().email().max(254),
    role: z.enum(['MEMBER', 'ADMIN']).default('MEMBER'),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return teamRoute(async (userId) => {
        if (!(await teamInviteRateLimit(userId)).allowed) {
            return errorResponse('Too many invitations. Please wait a while.', 429);
        }
        const v = await validateBody(request, schema);
        if ('error' in v) return v.error;
        // The link is returned too, for sharing it directly (e.g. without SMTP);
        // it only works for an account with the invited email address.
        const { inviteUrl } = await inviteToTeam(id, userId, v.data.email, v.data.role);
        return successResponse({ invited: true, inviteUrl }, 201);
    });
}
