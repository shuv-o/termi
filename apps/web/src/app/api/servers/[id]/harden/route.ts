/**
 * POST /api/servers/[id]/harden — secure a server (Phase 2 hardening).
 * GET  /api/servers/[id]/harden — the most recent run, for the UI.
 *
 * POST streams progress as Server-Sent Events. The run is NOT tied to the
 * request: if the browser disconnects, it carries on and records its outcome,
 * and the on-server rollback covers Termi itself going away mid-run.
 * Owner-only, like every route built on getServerById.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { prisma } from '@/lib/db';
import {
    errorResponse,
    notFoundResponse,
    successResponse,
    unauthorizedResponse,
    validateBody,
} from '@/lib/api';
import { serverHardenRateLimit } from '@/lib/security/rate-limit';
import { hardenServer, type HardenEvent } from '@/lib/services/hardening/harden.service';
import {
    commitCredentials,
    finishRun,
    HardeningBusyError,
    savePending,
    startRun,
} from '@/lib/services/hardening/harden-store';
import { sshPool, SSHConnectionPool } from '@/lib/services/ssh-pool';

const optionsSchema = z.object({
    createUser: z.boolean(),
    newUsername: z.string().max(32).optional(),
    disablePasswordLogin: z.boolean(),
    rotatePassword: z.boolean(),
    fail2ban: z.boolean(),
    autoUpdates: z.boolean(),
    extraPublicKey: z.string().max(4096).optional(),
    firewall: z.boolean().default(false),
    allowPorts: z.array(z.number().int().min(1).max(65535)).max(50).default([]),
    newPort: z.number().int().min(1024).max(65535).nullable().optional(),
    rootLogin: z.enum(['no', 'key', 'password']).optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const rl = await serverHardenRateLimit(user.id);
    if (!rl.allowed) return errorResponse('Too many attempts. Try again in an hour.', 429);

    const validation = await validateBody(request, optionsSchema);
    if ('error' in validation) return validation.error;
    const options = validation.data;

    const { id } = await params;
    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');
    if (server.protocol !== 'SSH') return errorResponse('Only SSH servers can be secured', 400);

    let run: { id: string };
    try {
        run = await startRun(server.id, user.id, options);
    } catch (err) {
        if (err instanceof HardeningBusyError) return errorResponse(err.message, 409);
        throw err;
    }

    const encoder = new TextEncoder();
    const events: HardenEvent[] = [];

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: HardenEvent) => {
                events.push(event);
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch {
                    // Browser went away — the run continues regardless.
                }
            };

            let result: Extract<HardenEvent, { type: 'done' }> | null = null;
            await hardenServer(
                {
                    host: server.host,
                    port: server.port,
                    username: server.username,
                    password: server.password ?? undefined,
                    privateKey: server.privateKey ?? undefined,
                    passphrase: server.passphrase ?? undefined,
                    jump: server.jump,
                    hostKey: server.hostKey,
                    certificate: server.certificate,
                },
                options,
                {
                    onEvent: (e) => {
                        if (e.type === 'done') result = e;
                        send(e);
                    },
                    savePending: (creds) => savePending(run.id, user.id, creds),
                    commit: async (creds) => {
                        await commitCredentials(
                            run.id,
                            server.id,
                            user.id,
                            server.password ?? undefined,
                            creds,
                            server.host,
                        );
                        // Drop the pooled connection made with the old login.
                        sshPool.destroy(
                            SSHConnectionPool.makeKey({
                                id: server.id,
                                host: server.host,
                                port: server.port,
                                username: server.username,
                                jump: server.jump,
                                hostKey: server.hostKey,
                                certificate: server.certificate,
                            }),
                        );
                    },
                },
            );

            const final: Extract<HardenEvent, { type: 'done' }> = result ?? {
                type: 'done',
                ok: false,
                outcome: 'failed',
                message: 'The run ended without a result',
            };
            try {
                await finishRun(run.id, user.id, server.id, events, final);
            } catch (err) {
                console.error('[Harden] Failed to record run:', err);
            }
            try {
                controller.close();
            } catch {
                /* already closed */
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-store',
            Connection: 'keep-alive',
        },
    });
}

export async function GET(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const server = await prisma.server.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
    });
    if (!server) return notFoundResponse('Server not found');

    const run = await prisma.serverHardeningRun.findFirst({
        where: { serverId: id },
        orderBy: { createdAt: 'desc' },
        // Never the pending secret.
        select: { id: true, status: true, message: true, createdAt: true, finishedAt: true },
    });
    return successResponse({ run });
}
