/**
 * PATCH  /api/teams/[id]/members/[userId] — change a member's role (owners)
 * DELETE /api/teams/[id]/members/[userId] — remove a member, or leave (your own id)
 */

import { z } from 'zod';
import { successResponse, validateBody } from '@/lib/api';
import { changeRole, removeMember } from '@/lib/services/team.service';
import { teamRoute } from '@/lib/services/team-route';

interface P {
    params: Promise<{ id: string; userId: string }>;
}

const schema = z.object({ role: z.enum(['OWNER', 'ADMIN', 'MEMBER']) });

export async function PATCH(request: Request, { params }: P) {
    const { id, userId: memberId } = await params;
    return teamRoute(async (userId) => {
        const v = await validateBody(request, schema);
        if ('error' in v) return v.error;
        await changeRole(id, userId, memberId, v.data.role);
        return successResponse({ ok: true });
    });
}

export async function DELETE(_r: Request, { params }: P) {
    const { id, userId: memberId } = await params;
    return teamRoute(async (userId) => {
        await removeMember(id, userId, memberId);
        return successResponse({ removed: true });
    });
}
