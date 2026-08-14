/**
 * GET  /api/tunnel-sessions — list this user's active (not-yet-closed) tunnels,
 *      optionally scoped to one server via ?serverId=
 * POST /api/tunnel-sessions — record that a tunnel was just opened
 *
 * Bookkeeping only — see tunnel-session.service.ts for why this isn't a live
 * connection probe.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { createTunnelSession, listActiveTunnelSessions } from '@/lib/services';
import { tunnelCreateRateLimit } from '@/lib/rate-limit';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

const createSchema = z.object({
    serverId: z.string().min(1).nullable(),
    serverName: z.string().min(1).max(200),
    remoteHost: z.string().min(1).max(255),
    remotePort: z.number().int().min(1).max(65535),
    kind: z.enum(['HTTP_PROXY', 'BRIDGE_SCRIPT', 'ELECTRON_LOCAL']),
    localPort: z.number().int().min(0).max(65535).nullable().optional(),
    electronId: z.string().min(1).nullable().optional(),
});

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const serverId = new URL(request.url).searchParams.get('serverId') ?? undefined;
    const tunnels = await listActiveTunnelSessions(user.id, serverId);
    return successResponse({ tunnels });
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const rateLimitResult = tunnelCreateRateLimit(user.id);
    if (!rateLimitResult.allowed) {
        return errorResponse(
            'Too many tunnels opened recently. Please wait before trying again.',
            429,
        );
    }

    const validation = await validateBody(request, createSchema);
    if ('error' in validation) return validation.error;

    try {
        const tunnel = await createTunnelSession(user.id, validation.data);
        return successResponse({ tunnel }, 201);
    } catch (err) {
        console.error('[TunnelSessions] Failed to create record:', err);
        return errorResponse('Failed to record tunnel', 500);
    }
}
