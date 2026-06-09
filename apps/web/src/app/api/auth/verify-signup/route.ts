/**
 * POST /api/auth/verify-signup
 * Verify a new account with the 6-digit OTP sent during registration.
 * On success: marks the user verified, creates a session, returns user info.
 */

import { z } from 'zod';
import { verifyEmailOTP } from '@/lib/auth/email-otp';
import { createSession, getSession } from '@/lib/auth/session';
import { validateBody, successResponse, errorResponse, getClientIP, getDeviceInfo } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
    userId: z.string().min(1),
    code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must be numeric'),
});

export async function POST(request: Request) {
    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const { userId, code } = validation.data;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, isVerified: true, isActive: true },
    });

    if (!user || !user.isActive) {
        return errorResponse('Invalid request', 400);
    }

    if (user.isVerified) {
        return errorResponse('Email already verified', 400);
    }

    const valid = await verifyEmailOTP(userId, code);
    if (!valid) {
        return errorResponse('Invalid or expired verification code', 400);
    }

    await prisma.user.update({
        where: { id: userId },
        data: { isVerified: true },
    });

    await prisma.auditLog.create({
        data: { userId, action: 'USER_EMAIL_VERIFIED' },
    });

    const ipAddress = getClientIP(request);
    const deviceInfo = getDeviceInfo(request);
    const sessionToken = await createSession(userId, user.email, deviceInfo, ipAddress);

    const session = await getSession();
    session.userId = userId;
    session.email = user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    await session.save();

    return successResponse({
        message: 'Email verified successfully',
        user: { id: user.id, email: user.email },
    });
}
