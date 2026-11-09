/**
 * Closing connections whose access is gone.
 *
 * A connection token is checked once, when its WebSocket opens. Without this
 * module a terminal, desktop, file browser or tunnel would keep running after
 * the person was signed out (device sign-out, password change or reset), lost
 * the server (share removed, left the team, server deleted) or, as a guest,
 * had the share link turned off.
 *
 * Every ACCESS_CHECK interval the gateway sends the web app what each live
 * connection relies on — the sign-in that minted its token, the user, the
 * server, the share link — and closes the ones the web app says are no longer
 * allowed. The web app is the only place that knows; the gateway has no
 * database.
 *
 * If the web app can't be reached the check fails open (connections stay):
 * an outage of the web app shouldn't drop every terminal. The next check that
 * gets an answer catches up.
 */

import { mintServiceToken } from '../auth/token.js';

export type GrantKind = 'server' | 'local' | 'guest';

/** What one live connection relies on. */
export interface Grant {
    /** Web sign-in (Session id) that minted the token; null for older tokens. */
    sid: string | null;
    userId: string;
    kind: GrantKind;
    serverId?: string;
    /** 'guest' only: the share link the guest came in through. */
    shareId?: string;
}

export interface LiveConnection {
    grant: Grant;
    /** Close this connection, telling its browser `message`. */
    close(message: string): void;
}

export interface Denial {
    key: string;
    message: string;
}

/** Asks the web app; null when it couldn't answer (fail open). */
export type AccessAsker = (grants: (Grant & { key: string })[]) => Promise<Denial[] | null>;

export function grantKey(g: Grant): string {
    return JSON.stringify([g.kind, g.sid, g.userId, g.serverId ?? null, g.shareId ?? null]);
}

/**
 * One round: ask about every distinct grant once, close what was denied.
 * Returns how many connections were closed.
 */
export async function runAccessCheck(
    connections: LiveConnection[],
    ask: AccessAsker,
): Promise<number> {
    if (connections.length === 0) return 0;
    const grants = new Map<string, Grant & { key: string }>();
    for (const c of connections) {
        const key = grantKey(c.grant);
        if (!grants.has(key)) grants.set(key, { ...c.grant, key });
    }
    const denials = await ask([...grants.values()]);
    if (!denials?.length) return 0;
    const denied = new Map(denials.map((d) => [d.key, d.message]));
    let closed = 0;
    for (const c of connections) {
        const message = denied.get(grantKey(c.grant));
        if (message === undefined) continue;
        try {
            c.close(message);
            closed++;
        } catch (err) {
            console.error('[access-check] Closing a connection failed:', err);
        }
    }
    return closed;
}

/** The web app's internal endpoint, reached with a service token. */
/** Shown when the desktop app may no longer connect for this sign-in. */
export const REFUSED_MESSAGE =
    'This computer is no longer allowed to connect. Sign in again, or connect through Termi.';

export function webAccessAsker(
    webUrl: string,
    fetchFn: typeof fetch = fetch,
    /** The Authorization header: a gateway service token, or a device token in the desktop app. */
    authorize: () => Promise<string> = async () =>
        `Bearer ${await mintServiceToken('access-check')}`,
    /**
     * Desktop app: a refused device (its sign-in revoked, expired, or the
     * device removed) closes every connection instead of failing open.
     */
    denyAllWhenRefused = false,
): AccessAsker {
    const url = new URL('/api/internal/access-check', webUrl).toString();
    let failing = false;
    return async (grants) => {
        try {
            const res = await fetchFn(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: await authorize(),
                },
                body: JSON.stringify({ grants }),
                signal: AbortSignal.timeout(10_000),
            });
            if (denyAllWhenRefused && (res.status === 401 || res.status === 403)) {
                failing = false;
                return grants.map((g) => ({ key: g.key, message: REFUSED_MESSAGE }));
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as { data?: { denied?: Denial[] } };
            if (!Array.isArray(body.data?.denied)) throw new Error('Unexpected response');
            if (failing) console.log('[access-check] The web app answers again');
            failing = false;
            return body.data.denied.filter(
                (d) => typeof d?.key === 'string' && typeof d?.message === 'string',
            );
        } catch (err) {
            if (!failing) {
                console.warn(
                    `[access-check] Could not reach ${url} (${(err as Error).message}); ` +
                        'connections stay open until it answers. Set WEB_INTERNAL_URL if the ' +
                        'gateway reaches the web app at another address.',
                );
            }
            failing = true;
            return null;
        }
    };
}

/** Runs the check on an interval; returns a stop function. 0 ms turns it off. */
export function startAccessChecks(
    list: () => LiveConnection[],
    ask: AccessAsker,
    intervalMs: number,
): () => void {
    if (intervalMs <= 0) {
        console.warn(
            '[access-check] Off (GATEWAY_ACCESS_CHECK_SEC=0): revoked access will not close open connections',
        );
        return () => {};
    }
    let running = false;
    const timer = setInterval(async () => {
        if (running) return; // a slow round never overlaps the next
        running = true;
        try {
            const closed = await runAccessCheck(list(), ask);
            if (closed)
                console.log(`[access-check] Closed ${closed} connection(s) whose access ended`);
        } finally {
            running = false;
        }
    }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
}
