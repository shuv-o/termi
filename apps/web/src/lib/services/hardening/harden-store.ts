/**
 * Database side of a hardening run: the run record, the encrypted pending
 * credentials, and the final switch-over of the server's credentials.
 */

import { prisma } from '@/lib/db';
import { encryptCredentials, sealField } from '@/lib/crypto';
import type { Prisma } from '@/app/generated/prisma/client';
import type { HardenEvent, HardenOptions, NewCredentials } from './harden.service';

/** A run still marked running after this long was abandoned (Termi restarted). */
const STALE_RUN_MS = 15 * 60 * 1000;

export class HardeningBusyError extends Error {}

export async function startRun(serverId: string, userId: string, options: HardenOptions) {
    const active = await prisma.serverHardeningRun.findFirst({
        where: {
            serverId,
            status: 'running',
            createdAt: { gt: new Date(Date.now() - STALE_RUN_MS) },
        },
        select: { id: true },
    });
    if (active) throw new HardeningBusyError('This server is already being secured');

    // Never store the user's extra public key text verbatim in the options
    // log — only whether one was given.
    const { extraPublicKey, ...rest } = options;
    return prisma.serverHardeningRun.create({
        data: {
            serverId,
            userId,
            status: 'running',
            options: { ...rest, extraPublicKey: Boolean(extraPublicKey) },
        },
        select: { id: true },
    });
}

export async function savePending(runId: string, userId: string, creds: NewCredentials) {
    await prisma.serverHardeningRun.update({
        where: { id: runId },
        data: {
            pendingSecret: sealField(
                JSON.stringify(creds),
                'ServerHardeningRun',
                'pendingSecret',
                userId,
            ),
        },
    });
}

/**
 * Switch the server to the new credentials. Written directly rather than via
 * updateServer(): that merges an empty passphrase away, which would leave the
 * old key's passphrase attached to the new, unencrypted key.
 */
export async function commitCredentials(
    runId: string,
    serverId: string,
    userId: string,
    existingPassword: string | undefined,
    creds: NewCredentials,
    host: string,
) {
    const password = creds.password ?? existingPassword;
    const encrypted = encryptCredentials(
        {
            host,
            username: creds.username,
            password,
            privateKey: creds.privateKey,
        },
        userId,
    );
    await prisma.$transaction([
        prisma.server.update({
            where: { id: serverId, userId },
            data: {
                username: encrypted.username,
                privateKey: encrypted.privateKey,
                passphrase: null,
                port: creds.port,
                ...(encrypted.password ? { password: encrypted.password } : {}),
            },
        }),
        prisma.serverHardeningRun.update({
            where: { id: runId },
            data: { pendingSecret: null },
        }),
    ]);
}

export async function finishRun(
    runId: string,
    userId: string,
    serverId: string,
    steps: HardenEvent[],
    result: Extract<HardenEvent, { type: 'done' }>,
) {
    await prisma.serverHardeningRun.update({
        where: { id: runId },
        data: {
            status: result.outcome,
            message: result.message,
            steps: steps as unknown as Prisma.InputJsonValue,
            finishedAt: new Date(),
            // Keep the pending secret only while the server might still be on
            // the new credentials (rollback pending); otherwise it is useless.
            ...(result.outcome === 'failed' ? { pendingSecret: null } : {}),
        },
    });
    await prisma.auditLog.create({
        data: {
            userId,
            action: result.ok ? 'SERVER_HARDENED' : 'SERVER_HARDENING_FAILED',
            resource: `server:${serverId}`,
            details: { runId, outcome: result.outcome },
        },
    });
}
