import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { sendShareInvitation } from '@/lib/services/share.service';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

const schema = z.object({
    email: z.string().email('Invalid email address'),
    permissions: z.enum(['manage', 'connect']).default('connect'),
});

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const { id: serverId } = await params;
    const { email, permissions } = validation.data;

    const result = await sendShareInvitation(serverId, user.id, email, permissions);

    if (!result.success) return errorResponse(result.error!, 400);
    return successResponse({ message: `Invitation sent to ${email}` });
}
