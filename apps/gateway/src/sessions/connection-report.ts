/**
 * Reporting live connections to the web app, so people can see and close them.
 *
 * A terminal whose tab was closed keeps its shell running (PersistentSessionStore),
 * a desktop app may hold tunnels open, a second browser may still have a file
 * browser open — and none of that was visible anywhere. Every REPORT interval
 * the gateway sends the web app what it has open (POST /api/internal/connections)
 * and the answer names the connections their owner asked to close from the
 * Active connections page. The web app keeps only the latest report per gateway,
 * and forgets a gateway that stops reporting.
 *
 * Like the access check, an unreachable web app changes nothing here: nothing
 * is closed, and the next answer catches up.
 */

import { mintServiceToken } from '../auth/token.js';
import type { LiveConnection } from './access-check.js';

export type ConnectionKind = 'session' | 'guest' | 'socket';

/** What the web app is told about one connection. Never credentials or hosts. */
export interface ConnectionInfo {
    /** Stable for the connection's lifetime, unique on this gateway. */
    id: string;
    userId: string;
    sid: string | null;
    /** A persistent SSH shell, a guest seat in someone's shell, or any other socket. */
    kind: ConnectionKind;
    protocol: 'ssh' | 'scp' | 'rdp' | 'vnc' | 'telnet' | 'local' | 'tunnel';
    serverId?: string;
    /** 'session' only: the shell's id, which its owner can reattach to. */
    sessionId?: string;
    /** Whether a browser is attached; a detached shell runs in the background. */
    attached: boolean;
    /** 'session' only: people watching or helping. */
    guests: number;
    startedAt: number;
    lastActivityAt: number;
    /** Tunnels: what is forwarded. Guests: view or control. */
    detail?: {
        forward?: 'local' | 'dynamic' | 'remote';
        remotePort?: number;
        bindPort?: number;
        guestMode?: 'view' | 'control';
    };
}

export interface ListedConnection extends LiveConnection {
    info: ConnectionInfo;
}

export interface CloseRequest {
    id: string;
    message: string;
}

/** Sends a report; returns what to close, or null when the web app didn't answer. */
export type ConnectionReporter = (
    connections: ConnectionInfo[],
    intervalSec: number,
) => Promise<CloseRequest[] | null>;

/** One round: report everything, close what was asked for. Returns how many closed. */
export async function runConnectionReport(
    connections: ListedConnection[],
    report: ConnectionReporter,
    intervalSec: number,
): Promise<number> {
    const requests = await report(
        connections.map((c) => c.info),
        intervalSec,
    );
    if (!requests?.length) return 0;
    const wanted = new Map(requests.map((r) => [r.id, r.message]));
    let closed = 0;
    for (const c of connections) {
        const message = wanted.get(c.info.id);
        if (message === undefined) continue;
        try {
            c.close(message);
            closed++;
        } catch (err) {
            console.error('[connections] Closing a connection failed:', err);
        }
    }
    return closed;
}

export function webConnectionReporter(
    webUrl: string,
    gatewayId: string,
    fetchFn: typeof fetch = fetch,
    /** A gateway service token, or a device token in the desktop app. */
    authorize: () => Promise<string> = async () =>
        `Bearer ${await mintServiceToken('connections')}`,
): ConnectionReporter {
    const url = new URL('/api/internal/connections', webUrl).toString();
    let failing = false;
    return async (connections, intervalSec) => {
        try {
            const res = await fetchFn(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: await authorize(),
                },
                body: JSON.stringify({ gatewayId, intervalSec, connections }),
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as { data?: { close?: CloseRequest[] } };
            if (!Array.isArray(body.data?.close)) throw new Error('Unexpected response');
            if (failing) console.log('[connections] The web app answers again');
            failing = false;
            return body.data.close.filter(
                (r) => typeof r?.id === 'string' && typeof r?.message === 'string',
            );
        } catch (err) {
            if (!failing) {
                console.warn(
                    `[connections] Could not report to ${url} (${(err as Error).message}); ` +
                        'open connections are not listed in the app until it answers.',
                );
            }
            failing = true;
            return null;
        }
    };
}

/** Reports on an interval (and once right away); returns a stop function. 0 turns it off. */
export function startConnectionReports(
    list: () => ListedConnection[],
    report: ConnectionReporter,
    intervalMs: number,
): () => void {
    if (intervalMs <= 0) {
        console.warn(
            '[connections] Off (GATEWAY_REPORT_SEC=0): open connections are not listed in the app',
        );
        return () => {};
    }
    const intervalSec = Math.max(1, Math.round(intervalMs / 1000));
    let running = false;
    const tick = async () => {
        if (running) return; // a slow round never overlaps the next
        running = true;
        try {
            const closed = await runConnectionReport(list(), report, intervalSec);
            if (closed) console.log(`[connections] Closed ${closed} connection(s) on request`);
        } finally {
            running = false;
        }
    };
    const first = setTimeout(tick, 1_000);
    first.unref?.();
    const timer = setInterval(tick, intervalMs);
    timer.unref?.();
    return () => {
        clearTimeout(first);
        clearInterval(timer);
    };
}
