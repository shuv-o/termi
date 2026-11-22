/**
 * Active connections: everything a user has open on any gateway right now.
 *
 * The gateway is the only place that knows what is open — a terminal whose
 * tab was closed keeps running there, a desktop app's tunnels live on the
 * user's computer — so every GATEWAY_REPORT_SEC each gateway sends its whole
 * list (POST /api/internal/connections, `recordReport`). We keep the latest
 * list per gateway and drop a gateway that stops reporting (`expiresAt`), so
 * nothing here goes stale the way client-registered rows do.
 *
 * Closing is a request: `requestClose` marks rows, and the gateway closes them
 * when its next report gets them back in the answer. The page shows them as
 * "closing" until then.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@/app/generated/prisma/client';

export const CLOSED_MESSAGE = 'You closed this connection from Active connections.';

/** A gateway that misses this many reports in a row drops out. */
const MISSED_REPORTS = 3;
const MIN_TTL_SEC = 30;
/** Expired gateways are deleted (with their rows) after this long. */
const PURGE_AFTER_MS = 10 * 60_000;
/** lastActivityAt is only rewritten when it moved by at least this much. */
const ACTIVITY_GRANULARITY_MS = 30_000;

export type ConnectionKind = 'session' | 'guest' | 'socket';

/** One connection as the gateway reports it (apps/gateway/src/sessions/connection-report.ts). */
export interface ReportedConnection {
    id: string;
    userId: string;
    sid: string | null;
    kind: ConnectionKind;
    protocol: string;
    serverId?: string;
    sessionId?: string;
    attached: boolean;
    guests: number;
    startedAt: number;
    lastActivityAt: number;
    detail?: Record<string, unknown>;
}

export interface StoredConnection {
    id: string;
    connId: string;
    sid: string | null;
    attached: boolean;
    guests: number;
    lastActivityAt: Date;
    closeRequestedAt: Date | null;
}

export interface ReportPlan {
    create: ReportedConnection[];
    update: {
        id: string;
        data: Partial<Pick<StoredConnection, 'sid' | 'attached' | 'guests' | 'lastActivityAt'>>;
    }[];
    /** Row ids the gateway no longer has. */
    remove: string[];
    /** Gateway ids of the connections to close now. */
    close: { id: string; message: string }[];
}

/** What to write for a new report, given what is stored for that gateway. Pure. */
export function planReport(stored: StoredConnection[], reported: ReportedConnection[]): ReportPlan {
    const byConn = new Map(stored.map((s) => [s.connId, s]));
    const seen = new Set<string>();
    const plan: ReportPlan = { create: [], update: [], remove: [], close: [] };

    for (const r of reported) {
        if (seen.has(r.id)) continue; // a duplicate id in one report counts once
        seen.add(r.id);
        const s = byConn.get(r.id);
        if (!s) {
            plan.create.push(r);
            continue;
        }
        if (s.closeRequestedAt) plan.close.push({ id: r.id, message: CLOSED_MESSAGE });
        const data: ReportPlan['update'][number]['data'] = {};
        if (s.attached !== r.attached) data.attached = r.attached;
        if (s.guests !== r.guests) data.guests = r.guests;
        if (s.sid !== r.sid) data.sid = r.sid;
        if (Math.abs(r.lastActivityAt - s.lastActivityAt.getTime()) >= ACTIVITY_GRANULARITY_MS) {
            data.lastActivityAt = new Date(r.lastActivityAt);
        }
        if (Object.keys(data).length) plan.update.push({ id: s.id, data });
    }
    for (const s of stored) if (!seen.has(s.connId)) plan.remove.push(s.id);
    return plan;
}

/** Stores a gateway's report; returns what it should close. */
export async function recordReport(input: {
    gatewayId: string;
    deviceId: string | null;
    intervalSec: number;
    connections: ReportedConnection[];
}): Promise<{ id: string; message: string }[]> {
    const now = new Date();
    const ttlSec = Math.max(MIN_TTL_SEC, input.intervalSec * MISSED_REPORTS);
    const expiresAt = new Date(now.getTime() + ttlSec * 1000);

    await prisma.gatewayInstance.upsert({
        where: { id: input.gatewayId },
        create: { id: input.gatewayId, deviceId: input.deviceId, lastReportAt: now, expiresAt },
        update: { lastReportAt: now, expiresAt },
    });

    const stored = await prisma.liveConnection.findMany({
        where: { gatewayId: input.gatewayId },
        select: {
            id: true,
            connId: true,
            sid: true,
            attached: true,
            guests: true,
            lastActivityAt: true,
            closeRequestedAt: true,
        },
    });
    const plan = planReport(stored, input.connections);

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    if (plan.remove.length) {
        writes.push(prisma.liveConnection.deleteMany({ where: { id: { in: plan.remove } } }));
    }
    if (plan.create.length) {
        writes.push(
            prisma.liveConnection.createMany({
                data: plan.create.map((c) => ({
                    gatewayId: input.gatewayId,
                    connId: c.id,
                    userId: c.userId,
                    sid: c.sid,
                    kind: c.kind,
                    protocol: c.protocol,
                    serverId: c.serverId ?? null,
                    sessionId: c.sessionId ?? null,
                    attached: c.attached,
                    guests: c.guests,
                    ...(c.detail ? { detail: c.detail as Prisma.InputJsonValue } : {}),
                    startedAt: new Date(c.startedAt),
                    lastActivityAt: new Date(c.lastActivityAt),
                })),
                skipDuplicates: true,
            }),
        );
    }
    for (const u of plan.update) {
        writes.push(prisma.liveConnection.update({ where: { id: u.id }, data: u.data }));
    }
    if (writes.length) await prisma.$transaction(writes);

    // Gateways that stopped reporting a while ago, with their rows.
    await prisma.gatewayInstance
        .deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - PURGE_AFTER_MS) } } })
        .catch(() => {});

    return plan.close;
}

export interface LiveConnectionView {
    id: string;
    kind: ConnectionKind;
    protocol: string;
    serverId: string | null;
    serverName: string | null;
    /** 'session' on the shared gateway only: the shell to reattach to. */
    sessionId: string | null;
    attached: boolean;
    guests: number;
    startedAt: Date;
    lastActivityAt: Date;
    detail: Record<string, unknown> | null;
    /** Where it runs: the Termi server, or the user's own computer (desktop app). */
    via: 'gateway' | 'device';
    deviceName: string | null;
    /** The sign-in that opened it. */
    origin: { current: boolean; userAgent: string | null; ipAddress: string | null };
    closing: boolean;
}

function uniq(xs: (string | null | undefined)[]): string[] {
    return [...new Set(xs.filter((x): x is string => !!x))];
}

/** The user's open connections, newest first. */
export async function listLiveConnections(
    userId: string,
    currentSid: string | null,
    /** Only connections to this server (the server details page). */
    serverId?: string,
): Promise<{ connections: LiveConnectionView[]; tracking: boolean }> {
    const now = new Date();
    const [rows, reporting] = await Promise.all([
        prisma.liveConnection.findMany({
            where: {
                userId,
                gateway: { expiresAt: { gt: now } },
                ...(serverId ? { serverId, kind: { not: 'guest' } } : {}),
            },
            include: { gateway: { select: { deviceId: true } } },
            orderBy: { startedAt: 'desc' },
            take: 500,
        }),
        prisma.gatewayInstance.count({ where: { deviceId: null, expiresAt: { gt: now } } }),
    ]);

    // A guest sees the session, not the owner's server details.
    const serverIds = uniq(rows.filter((r) => r.kind !== 'guest').map((r) => r.serverId));
    const sids = uniq(rows.map((r) => r.sid));
    const deviceIds = uniq(rows.map((r) => r.gateway.deviceId));

    const [servers, signIns, devices] = await Promise.all([
        serverIds.length
            ? prisma.server.findMany({
                  where: { id: { in: serverIds } },
                  select: { id: true, name: true },
              })
            : [],
        sids.length
            ? prisma.session.findMany({
                  where: { id: { in: sids }, userId },
                  select: { id: true, deviceInfo: true, ipAddress: true },
              })
            : [],
        deviceIds.length
            ? prisma.device.findMany({
                  where: { id: { in: deviceIds }, userId },
                  select: { id: true, name: true },
              })
            : [],
    ]);
    const serverName = new Map(servers.map((s) => [s.id, s.name]));
    const signIn = new Map(signIns.map((s) => [s.id, s]));
    const deviceName = new Map(devices.map((d) => [d.id, d.name]));

    return {
        tracking: reporting > 0,
        connections: rows.map((r) => {
            const via = r.gateway.deviceId ? 'device' : 'gateway';
            const origin = r.sid ? signIn.get(r.sid) : undefined;
            return {
                id: r.id,
                kind: r.kind as ConnectionKind,
                protocol: r.protocol,
                serverId: r.kind === 'guest' ? null : r.serverId,
                serverName:
                    r.serverId && r.kind !== 'guest' ? (serverName.get(r.serverId) ?? null) : null,
                sessionId: r.kind === 'session' && via === 'gateway' ? r.sessionId : null,
                attached: r.attached,
                guests: r.guests,
                startedAt: r.startedAt,
                lastActivityAt: r.lastActivityAt,
                detail: (r.detail as Record<string, unknown> | null) ?? null,
                via,
                deviceName: r.gateway.deviceId
                    ? (deviceName.get(r.gateway.deviceId) ?? null)
                    : null,
                origin: {
                    current: !!currentSid && r.sid === currentSid,
                    userAgent: origin?.deviceInfo ?? null,
                    ipAddress: origin?.ipAddress ?? null,
                },
                closing: !!r.closeRequestedAt,
            };
        }),
    };
}

/**
 * Asks for the user's own connections to be closed. Returns the rows marked,
 * so the caller can audit what was closed.
 */
export async function requestClose(
    userId: string,
    ids: string[],
): Promise<{ id: string; protocol: string; serverId: string | null }[]> {
    if (!ids.length) return [];
    const rows = await prisma.liveConnection.findMany({
        where: { id: { in: ids }, userId, closeRequestedAt: null },
        select: { id: true, protocol: true, serverId: true },
    });
    if (!rows.length) return [];
    await prisma.liveConnection.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, userId },
        data: { closeRequestedAt: new Date() },
    });
    return rows;
}
