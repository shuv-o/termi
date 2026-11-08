/** GET /api/teams — your teams · POST /api/teams — create one (you become its owner) */

import { z } from 'zod';
import { successResponse, validateBody } from '@/lib/api';
import { createTeam, listTeams } from '@/lib/services/team.service';
import { teamRoute } from '@/lib/services/team-route';

const createSchema = z.object({ name: z.string().trim().min(1, 'Name the team').max(60) });

export const GET = () =>
    teamRoute(async (userId) => successResponse({ teams: await listTeams(userId) }));

export async function POST(request: Request) {
    return teamRoute(async (userId) => {
        const v = await validateBody(request, createSchema);
        if ('error' in v) return v.error;
        const team = await createTeam(userId, v.data.name);
        return successResponse({ team: { id: team.id, name: team.name } }, 201);
    });
}
