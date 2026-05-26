import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getInvitationByToken, acceptInvitation } from '@/lib/services/share.service';
import { validateBody, successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;
    const invitation = await getInvitationByToken(token);
    if (!invitation) return notFoundResponse('Invitation not found or expired');

    return successResponse({
        invitation: {
            id: invitation.id,
            inviterEmail: invitation.inviter.email,
            serverName: invitation.server.name,
            serverProtocol: invitation.server.protocol,
            inviteeEmail: invitation.inviteeEmail,
            permissions: invitation.permissions,
            expiresAt: invitation.expiresAt,
        },
    });
}

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { token } = await params;
    const result = await acceptInvitation(token, user.id);

    if (!result.success) return errorResponse(result.error!, 400);
    return successResponse({ serverId: result.serverId });
}
