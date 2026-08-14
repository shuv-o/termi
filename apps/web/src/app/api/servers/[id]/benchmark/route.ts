/**
 * POST /api/servers/[id]/benchmark
 *
 * Streams benchmark progress as Server-Sent Events (text/event-stream).
 * Each event is a JSON-serialised BenchmarkProgress object.
 * Only supported for SSH servers (requires shell access).
 */

import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { runBenchmark } from '@/lib/services/benchmark.service';
import { prisma } from '@/lib/db';
import {
    successResponse,
    unauthorizedResponse,
    notFoundResponse,
    errorResponse,
} from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');

    if (server.protocol !== 'SSH') {
        return errorResponse('Benchmark requires an SSH server', 400);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: object) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch {
                    // Client disconnected — ignore
                }
            };

            const results = await runBenchmark(
                {
                    host: server.host,
                    port: server.port,
                    username: server.username,
                    password: server.password ?? undefined,
                    privateKey: server.privateKey ?? undefined,
                    passphrase: server.passphrase ?? undefined,
                },
                send,
            );

            if (results.scores && !results.error) {
                try {
                    await prisma.benchmarkRun.create({
                        data: {
                            serverId: id,
                            cpuScore: results.scores.cpu,
                            ramScore: results.scores.ram,
                            diskScore: results.scores.disk,
                            networkScore: results.scores.network,
                            overallScore: results.scores.overall,
                            cpuSingleMBps: results.cpu?.singleCoreMBps ?? null,
                            cpuMultiMBps: results.cpu?.multiCoreMBps ?? null,
                            ramWriteMBps: results.ram?.writeMBps ?? null,
                            ramReadMBps: results.ram?.readMBps ?? null,
                            diskWriteMBps: results.disk?.writeMBps ?? null,
                            diskReadMBps: results.disk?.readMBps ?? null,
                            pingMs: results.network?.pingMs ?? null,
                        },
                    });
                } catch (err) {
                    console.error('[Benchmark] Failed to persist run:', err);
                }
            }

            try {
                controller.close();
            } catch {
                /* ignore */
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}

/**
 * GET /api/servers/[id]/benchmark
 *
 * Returns past benchmark runs for this server (for trend charting).
 */
export async function GET(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');

    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

        const runs = await prisma.benchmarkRun.findMany({
            where: { serverId: id },
            orderBy: { runAt: 'desc' },
            take: limit,
        });

        // Return in chronological order for charting
        return successResponse({ runs: runs.reverse() });
    } catch (err) {
        console.error('[Benchmark] Error fetching history:', err);
        return errorResponse('Failed to fetch benchmark history', 500);
    }
}
