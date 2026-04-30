/**
 * POST /api/auth/send-verification
 * Re-sends the verification email. Rate-limited to 3 per hour per user.
 */

import { getCurrentUser } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/auth/email-verification';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { sendVerificationRateLimit } from '@/lib/rate-limit';

export async function POST() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    if (user.isVerified) {
        return successResponse({ message: 'Email already verified' });
    }

    const rl = sendVerificationRateLimit(user.id);
    if (!rl.allowed) {
        return errorResponse('Too many requests. Please try again later.', 429);
    }

    try {
        await sendVerificationEmail(user.id, user.email);
        return successResponse({ message: 'Verification email sent' });
    } catch (err) {
        console.error('Send verification error:', err);
        return errorResponse('Failed to send verification email', 500);
    }
}
