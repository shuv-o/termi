/** DELETE /api/ssh-security-keys/[id] — remove a key (servers using it need another login). */

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api';

export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { count } = await prisma.sshSecurityKey.deleteMany({ where: { id, userId: user.id } });
    if (!count) return notFoundResponse('Security key not found');
    await prisma.auditLog.create({
        data: { userId: user.id, action: 'SSH_SECURITY_KEY_REMOVED', resource: `ssh-key:${id}` },
    });
    return successResponse({ removed: true });
}
