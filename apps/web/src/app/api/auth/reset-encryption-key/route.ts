import { getCurrentUser, resetEncryptionKey } from '@/lib/auth';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

export async function POST() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        await resetEncryptionKey(user.id);
        return successResponse({ message: 'Encryption key reset. All server credentials have been deleted.' });
    } catch (err) {
        console.error('Reset encryption key error:', err);
        return errorResponse('Failed to reset encryption key', 500);
    }
}
