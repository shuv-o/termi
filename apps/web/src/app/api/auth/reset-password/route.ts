/**
 * POST /api/auth/reset-password
 */

import { z } from 'zod';
import { resetPassword } from '@/lib/auth';
import { validateBody, successResponse, errorResponse } from '@/lib/api';

const schema = z.object({
    token: z.string().min(1),
    newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain uppercase, lowercase, and a number',
        ),
});

export async function POST(request: Request) {
    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const { token, newPassword } = validation.data;

    try {
        const result = await resetPassword(token, newPassword);
        if (!result.success) {
            return errorResponse(result.error || 'Failed to reset password', 400);
        }
        return successResponse({ message: 'Password reset successfully. Please log in.' });
    } catch (error) {
        console.error('Reset password error:', error);
        return errorResponse('Failed to reset password', 500);
    }
}
