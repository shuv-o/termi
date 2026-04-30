import { z } from 'zod';
import { getCurrentUser, unlockEncryption } from '@/lib/auth';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { getSession } from '@/lib/auth/session';

const schema = z.object({
    passphrase: z.string().min(8, 'Passphrase must be at least 8 characters'),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    try {
        const result = await unlockEncryption(user.id, validation.data.passphrase);
        if (!result.success) return errorResponse(result.error || 'Incorrect passphrase', 400);

        const session = await getSession();
        session.masterKey = result.masterKey;
        await session.save();

        return successResponse({ message: 'Encryption unlocked' });
    } catch (err) {
        console.error('Unlock encryption error:', err);
        return errorResponse('Failed to unlock encryption', 500);
    }
}
