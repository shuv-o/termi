import { getCurrentUser } from '@/lib/auth';
import { getSharedServers } from '@/lib/services/share.service';
import { successResponse, unauthorizedResponse, errorResponse } from '@/lib/api';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        const servers = await getSharedServers(user.id);
        return successResponse({ servers });
    } catch (error) {
        console.error('Get shared servers error:', error);
        return errorResponse('Failed to fetch shared servers', 500);
    }
}
