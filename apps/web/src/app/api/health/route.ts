/**
 * GET /api/health — liveness/readiness probe for container orchestration
 * (Docker healthcheck, k8s probes, load balancers). Unauthenticated by design.
 */

import { prisma } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';

const DB_CHECK_TIMEOUT_MS = 2000;

export async function GET() {
    try {
        await Promise.race([
            prisma.$queryRaw`SELECT 1`,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Database health check timed out')), DB_CHECK_TIMEOUT_MS),
            ),
        ]);
    } catch (err) {
        console.error('[Health] Database check failed:', err);
        return errorResponse('Database unreachable', 503);
    }

    return successResponse({ status: 'ok', uptime: process.uptime() });
}
