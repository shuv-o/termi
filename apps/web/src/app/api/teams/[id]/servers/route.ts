/** POST /api/teams/[id]/servers — add a server you own to the team's vault */

import { z } from 'zod';
import { successResponse, validateBody } from '@/lib/api';
import { addServerToTeam } from '@/lib/services/team.service';
import { teamRoute } from '@/lib/api/team-route';

const schema = z.object({ serverId: z.string().min(1).max(64) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return teamRoute(async (userId) => {
        const v = await validateBody(request, schema);
        if ('error' in v) return v.error;
        await addServerToTeam(id, userId, v.data.serverId);
        return successResponse({ added: true }, 201);
    });
}
