/**
 * GET /api/account/activity?before=<ISO date>
 *
 * The signed-in user's own security history from the audit log, newest first,
 * 50 at a time. Only a short allowlist of detail fields is returned.
 */

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { successResponse, unauthorizedResponse } from '@/lib/api';

const PAGE = 50;
const SAFE_DETAIL_KEYS = ['method', 'field', 'format', 'success', 'reason', 'name', 'passkeyName'];

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const before = new URL(request.url).searchParams.get('before');
    const beforeDate = before ? new Date(before) : null;

    const rows = await prisma.auditLog.findMany({
        where: {
            userId: user.id,
            // Connections have their own list on the History page.
            action: { not: 'CONNECTION_OPENED' },
            ...(beforeDate && !isNaN(beforeDate.getTime())
                ? { createdAt: { lt: beforeDate } }
                : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE,
        select: {
            id: true,
            action: true,
            resource: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
            details: true,
        },
    });

    const entries = rows.map(({ details, ...row }) => {
        const safe: Record<string, unknown> = {};
        if (details && typeof details === 'object' && !Array.isArray(details)) {
            for (const key of SAFE_DETAIL_KEYS) {
                const v = (details as Record<string, unknown>)[key];
                if (v !== undefined && (typeof v === 'string' || typeof v === 'boolean'))
                    safe[key] = v;
            }
        }
        return { ...row, details: safe };
    });

    return successResponse({
        entries,
        nextBefore: rows.length === PAGE ? rows[rows.length - 1].createdAt.toISOString() : null,
    });
}
