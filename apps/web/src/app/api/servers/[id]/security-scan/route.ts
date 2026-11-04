/**
 * POST /api/servers/[id]/security-scan
 *
 * Runs the read-only security scan (lib/services/hardening) on one of the
 * user's own SSH servers and returns the report. Nothing on the server is
 * changed. Owner-only: getServerById is scoped to the user, so a server that
 * was merely shared with them returns 404.
 */

import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { scanServer, ScanFailedError } from '@/lib/services/hardening/scan.service';
import { errorResponse, notFoundResponse, successResponse, unauthorizedResponse } from '@/lib/api';
import { securityScanRateLimit } from '@/lib/rate-limit';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const rl = securityScanRateLimit(user.id);
    if (!rl.allowed) {
        return errorResponse('Too many scans. Wait a few minutes and try again.', 429);
    }

    const { id } = await params;
    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');
    if (server.protocol !== 'SSH') {
        return errorResponse('Security scans need an SSH server', 400);
    }

    try {
        const report = await scanServer(
            {
                id: server.id,
                host: server.host,
                port: server.port,
                username: server.username,
                password: server.password ?? undefined,
                privateKey: server.privateKey ?? undefined,
                passphrase: server.passphrase ?? undefined,
                jump: server.jump,
            },
            { authMethod: server.privateKey ? 'key' : 'password' },
        );
        return successResponse({ report });
    } catch (error) {
        if (error instanceof ScanFailedError) return errorResponse(error.message, 502);
        console.error('Security scan error:', error);
        return errorResponse('The security scan failed', 500);
    }
}
