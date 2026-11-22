/**
 * POST /api/connections/close — close some of your own open connections.
 *
 * The gateway closes them on its next report (within GATEWAY_REPORT_SEC);
 * until then they are listed as closing.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getClientIP, successResponse, unauthorizedResponse, validateBody } from '@/lib/api';
import { prisma } from '@/lib/db';
import { requestClose } from '@/lib/services/live-connection.service';

const schema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(500) });

export async function POST(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const closed = await requestClose(user.id, validation.data.ids);
    if (closed.length) {
        await prisma.auditLog
            .create({
                data: {
                    userId: user.id,
                    action: 'CONNECTION_CLOSED_BY_USER',
                    details: {
                        count: closed.length,
                        connections: closed
                            .slice(0, 50)
                            .map((c) => ({ protocol: c.protocol, serverId: c.serverId })),
                    },
                    ipAddress: getClientIP(request),
                    userAgent: request.headers.get('user-agent') ?? 'unknown',
                },
            })
            .catch(() => {});
    }
    return successResponse({ closing: closed.map((c) => c.id) });
}
