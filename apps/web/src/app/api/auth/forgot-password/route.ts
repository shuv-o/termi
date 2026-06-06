/**
 * POST /api/auth/forgot-password
 */

import { z } from 'zod';
import { forgotPassword } from '@/lib/auth';
import { validateBody, successResponse, getClientIP } from '@/lib/api';
import { forgotPasswordRateLimit } from '@/lib/rate-limit';

const schema = z.object({
    email: z.string().email(),
});

export async function POST(request: Request) {
    const ip = getClientIP(request);
    const rl = forgotPasswordRateLimit(ip);
    if (!rl.allowed) {
        return successResponse({ message: 'If that email exists, a reset link has been sent.' });
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    forgotPassword(validation.data.email).catch((err) =>
        console.error('forgotPassword error:', err),
    );

    return successResponse({ message: 'If that email exists, a reset link has been sent.' });
}
