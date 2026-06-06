import { getCurrentUser } from '@/lib/auth';
import { getServerShares } from '@/lib/services/share.service';
import { successResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id: serverId } = await params;
    const result = await getServerShares(serverId, user.id);
    if (!result) return notFoundResponse('Server not found');

    return successResponse(result);
}
