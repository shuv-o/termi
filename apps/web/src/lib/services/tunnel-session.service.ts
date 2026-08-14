/**
 * Tunnel Session Bookkeeping
 *
 * A self-reported record of tunnels the user has opened — not a live
 * connection probe. The gateway's TunnelSlotLimiter is the actual security
 * boundary on concurrent tunnels; this table exists purely so the user can
 * see and manage what they opened, the same role PersistentSession plays for
 * interactive SSH sessions (and the same limitation: if the client never
 * gets a chance to mark a row closed, it goes stale until removed manually).
 */

import { prisma } from '@/lib/db';
import type { TunnelKind } from '@/app/generated/prisma/client';

export interface CreateTunnelSessionInput {
    serverId: string | null;
    serverName: string;
    remoteHost: string;
    remotePort: number;
    kind: TunnelKind;
    localPort?: number | null;
    electronId?: string | null;
}

export async function createTunnelSession(userId: string, input: CreateTunnelSessionInput) {
    return prisma.tunnelSession.create({
        data: {
            userId,
            serverId: input.serverId,
            serverName: input.serverName,
            remoteHost: input.remoteHost,
            remotePort: input.remotePort,
            kind: input.kind,
            localPort: input.localPort,
            electronId: input.electronId,
        },
    });
}

/** Active (not-yet-closed) tunnels for a user, optionally scoped to one server. */
export async function listActiveTunnelSessions(userId: string, serverId?: string) {
    return prisma.tunnelSession.findMany({
        where: { userId, closedAt: null, ...(serverId ? { serverId } : {}) },
        orderBy: { createdAt: 'desc' },
    });
}

/** Marks a tunnel session closed. Returns false if it doesn't exist or isn't owned by this user. */
export async function closeTunnelSession(id: string, userId: string): Promise<boolean> {
    const existing = await prisma.tunnelSession.findFirst({ where: { id, userId } });
    if (!existing) return false;

    await prisma.tunnelSession.update({
        where: { id },
        data: { closedAt: new Date() },
    });
    return true;
}
