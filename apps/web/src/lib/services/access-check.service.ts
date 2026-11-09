/**
 * Which live gateway connections may stay open.
 *
 * The gateway checks a connection token once, when the connection opens. It
 * then asks here every GATEWAY_ACCESS_CHECK_SEC (POST /api/internal/access-check)
 * about everything still open, and closes what this says no to:
 *
 * - the sign-in behind the token was revoked (device sign-out, password
 *   change or reset) or expired, or the account was deactivated;
 * - the user can no longer connect to the server (share removed, left the
 *   team, server deleted) — the same owner → share → team rule as
 *   getServerForConnection;
 * - a guest's share link was turned off;
 * - the local terminal was turned off.
 *
 * `decide` is pure; `loadFacts` reads everything in a few batched queries.
 */

import { prisma } from '@/lib/db';

export type GrantKind = 'server' | 'local' | 'guest';

export interface AccessGrant {
    /** Opaque id the gateway matches the answer back with. */
    key: string;
    /** Web sign-in (Session id) behind the token; null for pre-sid tokens. */
    sid: string | null;
    userId: string;
    kind: GrantKind;
    serverId?: string;
    shareId?: string;
}

export interface Denial {
    key: string;
    message: string;
}

export interface AccessFacts {
    /** Sign-ins by id: whose they are and whether they still count. */
    sessions: Map<string, { userId: string; valid: boolean }>;
    activeUsers: Set<string>;
    /** `${userId}|${serverId}` pairs allowed to connect. */
    serverAccess: Set<string>;
    shares: Map<string, { serverId: string; active: boolean }>;
    localAllowed: boolean;
}

export const MESSAGES = {
    signedOut: 'You were signed out, so this connection was closed.',
    noAccess: 'Your access to this server was removed, so this connection was closed.',
    shareOff: 'The owner turned off the share link.',
    localOff: 'The local terminal was turned off on this server.',
} as const;

const pair = (userId: string, serverId: string) => `${userId}|${serverId}`;

export function decide(grants: AccessGrant[], facts: AccessFacts): Denial[] {
    const denied: Denial[] = [];
    const deny = (g: AccessGrant, message: string) => denied.push({ key: g.key, message });
    for (const g of grants) {
        if (g.sid !== null) {
            const s = facts.sessions.get(g.sid);
            if (!s || !s.valid || s.userId !== g.userId) {
                deny(g, MESSAGES.signedOut);
                continue;
            }
        }
        if (!facts.activeUsers.has(g.userId)) {
            deny(g, MESSAGES.signedOut);
            continue;
        }
        if (g.kind === 'local') {
            if (!facts.localAllowed) deny(g, MESSAGES.localOff);
            continue;
        }
        if (g.kind === 'guest') {
            // Older tokens don't name their link; the sign-in check still applies.
            if (!g.shareId) continue;
            const share = facts.shares.get(g.shareId);
            if (!share || !share.active || share.serverId !== g.serverId) {
                deny(g, MESSAGES.shareOff);
            }
            continue;
        }
        if (!g.serverId || !facts.serverAccess.has(pair(g.userId, g.serverId))) {
            deny(g, MESSAGES.noAccess);
        }
    }
    return denied;
}

export async function loadFacts(grants: AccessGrant[], now = new Date()): Promise<AccessFacts> {
    const sids = [...new Set(grants.flatMap((g) => (g.sid ? [g.sid] : [])))];
    const userIds = [...new Set(grants.map((g) => g.userId))];
    const shareIds = [...new Set(grants.flatMap((g) => (g.shareId ? [g.shareId] : [])))];

    // Server ids each user needs, for the 'server' grants.
    const wanted = new Map<string, Set<string>>();
    for (const g of grants) {
        if (g.kind !== 'server' || !g.serverId) continue;
        if (!wanted.has(g.userId)) wanted.set(g.userId, new Set());
        wanted.get(g.userId)!.add(g.serverId);
    }

    const [sessions, users, shares, serverAccess] = await Promise.all([
        sids.length
            ? prisma.session.findMany({
                  where: { id: { in: sids } },
                  select: { id: true, userId: true, isRevoked: true, expiresAt: true },
              })
            : [],
        prisma.user.findMany({
            where: { id: { in: userIds }, isActive: true },
            select: { id: true },
        }),
        shareIds.length
            ? prisma.sessionShare.findMany({
                  where: { id: { in: shareIds } },
                  select: { id: true, serverId: true, revokedAt: true },
              })
            : [],
        loadServerAccess(wanted),
    ]);

    return {
        sessions: new Map(
            sessions.map((s) => [
                s.id,
                { userId: s.userId, valid: !s.isRevoked && s.expiresAt > now },
            ]),
        ),
        activeUsers: new Set(users.map((u) => u.id)),
        serverAccess,
        shares: new Map(
            shares.map((s) => [s.id, { serverId: s.serverId, active: s.revokedAt === null }]),
        ),
        localAllowed: process.env.ALLOW_LOCAL_TERMINAL === 'true',
    };
}

/** Owner, direct share (with the server still the sharer's), or team vault. */
async function loadServerAccess(wanted: Map<string, Set<string>>): Promise<Set<string>> {
    const allowed = new Set<string>();
    await Promise.all(
        [...wanted].map(async ([userId, ids]) => {
            const serverIds = [...ids];
            const [owned, shared, team] = await Promise.all([
                prisma.server.findMany({
                    where: { id: { in: serverIds }, userId },
                    select: { id: true },
                }),
                prisma.serverShare.findMany({
                    where: { serverId: { in: serverIds }, sharedWithId: userId },
                    select: { serverId: true, ownerId: true, server: { select: { userId: true } } },
                }),
                prisma.teamServer.findMany({
                    where: {
                        serverId: { in: serverIds },
                        team: { members: { some: { userId } } },
                    },
                    select: { serverId: true },
                }),
            ]);
            for (const s of owned) allowed.add(pair(userId, s.id));
            for (const s of shared) {
                if (s.server.userId === s.ownerId) allowed.add(pair(userId, s.serverId));
            }
            for (const s of team) allowed.add(pair(userId, s.serverId));
        }),
    );
    return allowed;
}

export async function checkAccess(grants: AccessGrant[]): Promise<Denial[]> {
    if (grants.length === 0) return [];
    return decide(grants, await loadFacts(grants));
}
