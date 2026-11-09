/**
 * Connection history: one audit entry each time someone opens a terminal,
 * file browser or desktop on a server, read back by the History page.
 *
 * A terminal asks for a fresh connection token whenever it reconnects, so a
 * new entry is written only when the same person hasn't opened the same kind
 * of connection to the same server in the last few minutes.
 */

import { prisma } from '@/lib/db';

const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const PAGE = 50;

export type HistoryProtocol = 'ssh' | 'scp' | 'rdp' | 'vnc' | 'telnet';

export async function recordConnection(input: {
    userId: string;
    serverId: string;
    serverName: string;
    protocol: HistoryProtocol;
    ipAddress: string;
    userAgent: string;
}): Promise<void> {
    const resource = `server:${input.serverId}`;
    const recent = await prisma.auditLog.findFirst({
        where: {
            userId: input.userId,
            action: 'CONNECTION_OPENED',
            resource,
            createdAt: { gt: new Date(Date.now() - REPEAT_WINDOW_MS) },
            details: { path: ['protocol'], equals: input.protocol },
        },
        select: { id: true },
    });
    if (recent) return;
    await prisma.auditLog.create({
        data: {
            userId: input.userId,
            action: 'CONNECTION_OPENED',
            resource,
            details: { protocol: input.protocol, name: input.serverName },
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
        },
    });
}

export interface ConnectionEntry {
    id: string;
    serverId: string | null;
    serverName: string;
    protocol: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
}

/** The user's own connections, newest first, a page at a time. */
export async function listConnections(
    userId: string,
    before: Date | null,
): Promise<{ entries: ConnectionEntry[]; nextBefore: string | null }> {
    const rows = await prisma.auditLog.findMany({
        where: {
            userId,
            action: 'CONNECTION_OPENED',
            ...(before ? { createdAt: { lt: before } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE,
        select: {
            id: true,
            resource: true,
            details: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
        },
    });
    const entries = rows.map((r) => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        return {
            id: r.id,
            serverId: r.resource?.startsWith('server:') ? r.resource.slice(7) : null,
            serverName: typeof d.name === 'string' ? d.name : 'Server',
            protocol: typeof d.protocol === 'string' ? d.protocol : 'ssh',
            ipAddress: r.ipAddress,
            userAgent: r.userAgent,
            createdAt: r.createdAt,
        };
    });
    return {
        entries,
        nextBefore: rows.length === PAGE ? rows[rows.length - 1].createdAt.toISOString() : null,
    };
}
