/**
 * GET  /api/teams/join/[token] — what the invitation is for (signed in)
 * POST /api/teams/join/[token] — accept it (the signed-in email must match)
 */

import { notFoundResponse, successResponse } from '@/lib/api';
import { acceptInvitation, describeInvitation } from '@/lib/services/team.service';
import { teamRoute } from '@/lib/services/team-route';

interface P {
    params: Promise<{ token: string }>;
}

export async function GET(_r: Request, { params }: P) {
    const { token } = await params;
    return teamRoute(async () => {
        const invitation = await describeInvitation(token);
        return invitation
            ? successResponse({ invitation })
            : notFoundResponse('Invitation not found');
    });
}

export async function POST(_r: Request, { params }: P) {
    const { token } = await params;
    return teamRoute(async (userId) => successResponse(await acceptInvitation(token, userId)));
}
