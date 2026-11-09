/** GET/PATCH/DELETE /api/teams/[id] — view (members), rename (admins), delete (owners) */

import { z } from 'zod';
import { successResponse, validateBody } from '@/lib/api';
import { deleteTeam, getTeam, renameTeam } from '@/lib/services/team.service';
import { teamRoute } from '@/lib/api/team-route';

interface P {
    params: Promise<{ id: string }>;
}

export async function GET(_r: Request, { params }: P) {
    const { id } = await params;
    return teamRoute(async (userId) => successResponse({ team: await getTeam(id, userId) }));
}

const renameSchema = z.object({ name: z.string().trim().min(1).max(60) });

export async function PATCH(request: Request, { params }: P) {
    const { id } = await params;
    return teamRoute(async (userId) => {
        const v = await validateBody(request, renameSchema);
        if ('error' in v) return v.error;
        await renameTeam(id, userId, v.data.name);
        return successResponse({ ok: true });
    });
}

export async function DELETE(_r: Request, { params }: P) {
    const { id } = await params;
    return teamRoute(async (userId) => {
        await deleteTeam(id, userId);
        return successResponse({ deleted: true });
    });
}
