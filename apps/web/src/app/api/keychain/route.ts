/**
 * GET /api/keychain  — list all keychain entries (username visible, no passwords)
 * POST /api/keychain — create a new keychain entry
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getKeychainCredentials, createKeychainCredential } from '@/lib/services';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

const createSchema = z.object({
    label: z.string().min(1, 'Label is required').max(100),
    username: z.string().min(1, 'Username is required'),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
});

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        const entries = await getKeychainCredentials(user.id);
        return successResponse({ entries });
    } catch (error) {
        console.error('Get keychain error:', error);
        return errorResponse('Failed to fetch keychain', 500);
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, createSchema);
    if ('error' in validation) return validation.error;

    const { label, username, password, privateKey, passphrase } = validation.data;

    if (!password && !privateKey) {
        return errorResponse('Either password or private key is required', 400);
    }

    try {
        const entry = await createKeychainCredential(user.id, {
            label,
            username,
            password,
            privateKey,
            passphrase,
        });
        return successResponse({ entry }, 201);
    } catch (error) {
        console.error('Create keychain error:', error);
        return errorResponse('Failed to create keychain entry', 500);
    }
}
