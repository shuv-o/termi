/**
 * GET /api/auth/me
 * Get current authenticated user
 */

import { getCurrentUser, getLockedSessionUser } from '@/lib/auth';
import { sanitizeAppearance } from '@/lib/appearance/prefs';
import { successResponse, unauthorizedResponse } from '@/lib/api';

export async function GET() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            // A locked session gets the lock screen, not the login page.
            const locked = await getLockedSessionUser();
            if (locked) {
                return Response.json(
                    {
                        success: false,
                        error: 'locked',
                        data: {
                            email: locked.email,
                            hasPassword: !!locked.passwordHash,
                            passkeyEnabled: locked.passkeyEnabled,
                        },
                    },
                    { status: 423 },
                );
            }
            return unauthorizedResponse('Not authenticated');
        }

        return successResponse({
            user: {
                id: user.id,
                email: user.email,
                name: user.name ?? null,
                totpEnabled: user.totpEnabled,
                emailOtpEnabled: user.emailOtpEnabled,
                twoFactorMethod: user.twoFactorMethod,
                passkeyEnabled: user.passkeyEnabled,
                passwordLoginDisabled: user.passwordLoginDisabled,
                isVerified: user.isVerified,
                createdAt: user.createdAt,
                isGoogleUser: !user.passwordHash,
                lockAfterMinutes: user.lockAfterMinutes ?? null,
                // null until the user saves a choice: the browser keeps its own until then.
                appearance: user.appearance ? sanitizeAppearance(user.appearance) : null,
                onboarded: !!user.onboardedAt,
            },
        });
    } catch (error) {
        console.error('Get user error:', error);
        return unauthorizedResponse('Not authenticated');
    }
}
