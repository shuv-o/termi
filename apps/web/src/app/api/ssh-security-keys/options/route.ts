/** POST /api/ssh-security-keys/options — start enrolling a FIDO2 key for SSH. */

import { getCurrentUser } from '@/lib/auth';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { creationOptions } from '@/lib/ssh/security-key';

export async function POST() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const existing = await prisma.sshSecurityKey.findMany({
        where: { userId: user.id },
        select: { credentialId: true },
    });
    const { challenge, options } = creationOptions(
        user,
        existing.map((k) => k.credentialId),
    );
    const session = await getSession();
    session.sshKeyChallenge = challenge;
    await session.save();
    return successResponse({ options });
}
