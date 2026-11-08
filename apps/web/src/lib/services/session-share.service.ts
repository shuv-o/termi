/**
 * Shared live terminal sessions (the web side; the gateway's is
 * apps/gateway/src/sessions/guests.ts).
 *
 * The owner of a running session creates a link (watch, or watch and type)
 * that expires after an hour. Anyone signed in who opens it can *ask* to
 * join: the gateway then asks the owner, in their terminal, to let them in.
 * The guest's token carries no credentials — only which session to join.
 */

import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { mintConnectionToken, getGatewayUrl } from '@/lib/auth';

export class SessionShareError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

const SHARE_TTL_MS = 60 * 60 * 1000;
const hash = (code: string) => createHash('sha256').update(code).digest('hex');

export async function shareSession(ownerId: string, sessionId: string, mode: 'view' | 'control') {
    const session = await prisma.persistentSession.findFirst({
        where: { sessionId, userId: ownerId },
        select: { serverId: true, serverName: true },
    });
    if (!session) throw new SessionShareError('Session not found', 404);
    const code = randomBytes(24).toString('base64url');
    const share = await prisma.sessionShare.create({
        data: {
            codeHash: hash(code),
            ownerId,
            sessionId,
            serverId: session.serverId,
            mode,
            expiresAt: new Date(Date.now() + SHARE_TTL_MS),
        },
    });
    await prisma.auditLog.create({
        data: {
            userId: ownerId,
            action: 'SESSION_SHARED',
            resource: `server:${session.serverId}`,
            details: { mode },
        },
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://termi.run';
    return { id: share.id, joinUrl: `${appUrl}/panel/join/${code}`, expiresAt: share.expiresAt };
}

export async function revokeSessionShare(ownerId: string, id: string): Promise<boolean> {
    const { count } = await prisma.sessionShare.updateMany({
        where: { id, ownerId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    return count > 0;
}

async function activeShare(code: string) {
    const share = await prisma.sessionShare.findUnique({ where: { codeHash: hash(code) } });
    if (!share || share.revokedAt || share.expiresAt < new Date()) {
        throw new SessionShareError('This link has expired or was turned off', 404);
    }
    return share;
}

export async function describeShare(code: string) {
    const share = await activeShare(code);
    const [owner, session] = await Promise.all([
        prisma.user.findUnique({ where: { id: share.ownerId }, select: { email: true } }),
        prisma.persistentSession.findUnique({
            where: { sessionId: share.sessionId },
            select: { serverName: true },
        }),
    ]);
    return {
        ownerEmail: owner?.email ?? 'someone',
        serverName: session?.serverName ?? 'a server',
        mode: share.mode as 'view' | 'control',
    };
}

/** A guest token for the shared session (no credentials in it). */
export async function joinShare(code: string, userId: string) {
    const share = await activeShare(code);
    if (share.ownerId === userId) throw new SessionShareError('This is your own session');
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
    });
    const mode = share.mode === 'control' ? 'control' : 'view';
    const token = await mintConnectionToken({
        userId,
        serverId: share.serverId,
        protocol: 'ssh',
        host: '',
        port: 0,
        username: '',
        join: { sessionId: share.sessionId, ownerId: share.ownerId, email: user.email, mode },
    });
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SESSION_JOINED',
            resource: `server:${share.serverId}`,
            details: { mode, owner: share.ownerId },
        },
    });
    return { token, gatewayUrl: getGatewayUrl(), serverId: share.serverId, mode };
}
