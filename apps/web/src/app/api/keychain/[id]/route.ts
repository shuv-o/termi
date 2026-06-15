/**
 * GET    /api/keychain/[id] — get full credentials for a single entry
 * PUT    /api/keychain/[id] — update a keychain entry
 * DELETE /api/keychain/[id] — delete a keychain entry
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import {
    getKeychainCredentialById,
    updateKeychainCredential,
    deleteKeychainCredential,
} from '@/lib/services';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

const updateSchema = z.object({
    label: z.string().min(1).max(100).optional(),
    username: z.string().min(1).optional(),
    password: z.string().optional().nullable(),
    privateKey: z.string().optional().nullable(),
    passphrase: z.string().optional().nullable(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    try {
        const entry = await getKeychainCredentialById(id, user.id);
        if (!entry) return errorResponse('Not found', 404);
        return successResponse({ entry });
    } catch (error) {
        console.error('Get keychain entry error:', error);
        return errorResponse('Failed to fetch keychain entry', 500);
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const validation = await validateBody(request, updateSchema);
    if ('error' in validation) return validation.error;

    try {
        const input = validation.data;
        const entry = await updateKeychainCredential(id, user.id, {
            label: input.label,
            username: input.username,
            password: input.password ?? undefined,
            privateKey: input.privateKey ?? undefined,
            passphrase: input.passphrase ?? undefined,
        });
        if (!entry) return errorResponse('Not found', 404);
        return successResponse({ entry });
    } catch (error) {
        console.error('Update keychain entry error:', error);
        return errorResponse('Failed to update keychain entry', 500);
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    try {
        const deleted = await deleteKeychainCredential(id, user.id);
        if (!deleted) return errorResponse('Not found', 404);
        return successResponse({ deleted: true });
    } catch (error) {
        console.error('Delete keychain entry error:', error);
        return errorResponse('Failed to delete keychain entry', 500);
    }
}
