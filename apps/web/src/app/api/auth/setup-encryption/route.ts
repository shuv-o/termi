import { z } from 'zod';
import { getCurrentUser, setupEncryption } from '@/lib/auth';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { getSession } from '@/lib/auth/session';

const schema = z.object({
    passphrase: z.string().min(8, 'Passphrase must be at least 8 characters').max(256),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    try {
        const result = await setupEncryption(user.id, validation.data.passphrase);
        if (!result.success) return errorResponse(result.error || 'Setup failed', 400);

        const session = await getSession();
        session.masterKey = result.masterKey;
        await session.save();

        return successResponse({ message: 'Encryption configured successfully' });
    } catch (err) {
        console.error('Setup encryption error:', err);
        return errorResponse('Failed to set up encryption', 500);
    }
}
