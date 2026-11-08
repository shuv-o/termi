/**
 * PUT /api/account/appearance — save the user's look and layout.
 *
 * The body is sanitized rather than strictly validated: an unknown value
 * (say, from a newer browser tab) falls back to its default instead of
 * losing the user's other choices. `onboarded: true` also ends the
 * first-run setup.
 */

import { z } from 'zod';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/app/generated/prisma/client';
import { successResponse, unauthorizedResponse, validateBody } from '@/lib/api';
import { APPEARANCE_COOKIE, encodePaintCookie, sanitizeAppearance } from '@/lib/appearance/prefs';

const schema = z.object({
    appearance: z.record(z.string(), z.unknown()),
    onboarded: z.literal(true).optional(),
});

export async function PUT(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const v = await validateBody(request, schema);
    if ('error' in v) return v.error;

    const appearance = sanitizeAppearance(v.data.appearance);
    await prisma.user.update({
        where: { id: user.id },
        data: {
            appearance: appearance as unknown as Prisma.InputJsonObject,
            ...(v.data.onboarded && !user.onboardedAt ? { onboardedAt: new Date() } : {}),
        },
    });
    // The first paint on this device follows the saved choice right away.
    (await cookies()).set(APPEARANCE_COOKIE, encodePaintCookie(appearance), {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 400,
    });
    return successResponse({ appearance, onboarded: !!(v.data.onboarded || user.onboardedAt) });
}
