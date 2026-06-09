/**
 * POST /api/auth/register
 * Register a new user account
 */

import { z } from 'zod';
import { registerUser } from '@/lib/auth';
import { sendEmailOTP } from '@/lib/auth/email-otp';
import { validateBody, successResponse, errorResponse, getClientIP } from '@/lib/api';
import { registerRateLimit } from '@/lib/rate-limit';

const registerSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    email: z.string().email('Invalid email address'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain uppercase, lowercase, and a number',
        ),
});

export async function POST(request: Request) {
    const ipAddress = getClientIP(request);

    const rl = registerRateLimit(ipAddress);
    if (!rl.allowed) {
        return errorResponse('Too many registration attempts. Please try again later.', 429);
    }

    const validation = await validateBody(request, registerSchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { name, email, password } = validation.data;

    try {
        const result = await registerUser({ name, email, password });

        if (!result.success) {
            return errorResponse(result.error || 'Registration failed');
        }

        // Send 6-digit OTP for email verification (non-blocking on error)
        if (result.userId) {
            sendEmailOTP(result.userId, email, ipAddress).catch((err) =>
                console.error('Failed to send signup OTP:', err),
            );
        }

        return successResponse(
            {
                message: 'Account created. Check your email for a 6-digit verification code.',
                userId: result.userId,
                email: result.email,
            },
            201,
        );
    } catch (error) {
        console.error('Registration error:', error);
        return errorResponse('An error occurred during registration', 500);
    }
}
