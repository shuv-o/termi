/**
 * POST /api/auth/resend-signup-otp
 * Resend the 6-digit verification OTP for a pending (unverified) registration.
 * Does not require an active session — userId is passed in the body.
 */

import { z } from 'zod';
import { sendEmailOTP } from '@/lib/auth/email-otp';
import { validateBody, successResponse, errorResponse, getClientIP } from '@/lib/api';
import { registerRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db';

const schema = z.object({
    userId: z.string().min(1),
});

export async function POST(request: Request) {
    const ipAddress = getClientIP(request);

    const rl = registerRateLimit(ipAddress);
    if (!rl.allowed) {
        return errorResponse('Too many requests. Please try again later.', 429);
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const { userId } = validation.data;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, isVerified: true, isActive: true },
    });

    if (!user || !user.isActive || user.isVerified) {
        // Return success anyway to avoid user enumeration
        return successResponse({ message: 'If eligible, a new code has been sent.' });
    }

    try {
        await sendEmailOTP(userId, user.email, ipAddress);
        return successResponse({ message: 'Verification code resent.' });
    } catch (err) {
        console.error('Resend signup OTP error:', err);
        return errorResponse('Failed to resend code. Please try again.', 500);
    }
}
