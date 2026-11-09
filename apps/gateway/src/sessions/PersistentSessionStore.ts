import { WebSocket } from 'ws';
import type { SSHHandler } from '../handlers/ssh.js';
import type { AsciicastRecorder } from './AsciicastRecorder.js';
import type { RingBuffer } from './RingBuffer.js';

import { closeGuests, type Guest } from './guests.js';

export interface PersistentSession {
    sessionId: string;
    userId: string;
    serverId: string;
    handler: SSHHandler;
    buffer: RingBuffer;
    /**
     * Last time anything happened in the shell: output from the server, or
     * input from the owner or a guest. Whether a browser is attached doesn't
     * matter — a closed tab keeps a busy shell alive.
     */
    lastActivityAt: number;
    createdAt: number;
    attachedWs: WebSocket | null;
    isClosing: boolean;
    /** Set while a recording is active. Lives on the session (not the WS) so it
     *  survives tab reattachment, same as the ring buffer. */
    recording: AsciicastRecorder | null;
    /** People watching (or helping in) this session — see guests.ts. */
    guests: Map<string, Guest>;
    /** Join requests waiting for the owner's answer, by id. */
    joinRequests: Map<string, (allow: boolean) => void>;
}

/**
 * Per-user cap on concurrent persistent sessions. 0 (the default) means
 * unlimited — users open as many terminals as they like.
 *
 * This is a resource backstop, not an entitlement: every session holds an open
 * SSH connection to the remote host plus a 256 KB RingBuffer. Idle and
 * over-age sessions are still closed (GATEWAY_IDLE_TTL_HOURS,
 * GATEWAY_MAX_SESSION_DAYS) whatever this is set to, so unlimited does not
 * mean sessions accumulate forever. Set GATEWAY_MAX_CONNECTIONS_PER_USER to a positive integer to
 * re-impose a cap.
 */
const DEFAULT_MAX_CONNECTIONS_PER_USER = (() => {
    const n = parseInt(process.env.GATEWAY_MAX_CONNECTIONS_PER_USER || '', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
})();

function envNumber(name: string, fallback: number): number {
    const n = parseFloat(process.env[name] || '');
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * A shell with no output and no input for this long is closed, whether or not
 * a browser is attached. Output counts as activity, so a running build or
 * `tail -f` keeps its session after the tab is closed. Default 8 hours,
 * overridable via GATEWAY_IDLE_TTL_HOURS.
 */
const DEFAULT_IDLE_TTL_MS = (envNumber('GATEWAY_IDLE_TTL_HOURS', 8) || 8) * 3_600_000;

/**
 * Hard limit on a session's age, busy or not, so a shell that streams output
 * forever can't hold an SSH connection forever. Default 7 days,
 * GATEWAY_MAX_SESSION_DAYS overrides it; 0 turns the limit off.
 */
const DEFAULT_MAX_AGE_MS = envNumber('GATEWAY_MAX_SESSION_DAYS', 7) * 86_400_000;

export class PersistentSessionStore {
    private readonly sessions = new Map<string, PersistentSession>();
    private readonly idleCheckInterval: ReturnType<typeof setInterval>;
    private readonly idleTimeoutMs: number;
    /** 0 = unlimited. See DEFAULT_MAX_CONNECTIONS_PER_USER. */
    private readonly maxConnectionsPerUser: number;
    /** 0 = no age limit. See DEFAULT_MAX_AGE_MS. */
    private readonly maxAgeMs: number;

    constructor(
        idleTimeoutMs = DEFAULT_IDLE_TTL_MS,
        maxConnectionsPerUser = DEFAULT_MAX_CONNECTIONS_PER_USER,
        maxAgeMs = DEFAULT_MAX_AGE_MS,
    ) {
        this.idleTimeoutMs = idleTimeoutMs;
        this.maxConnectionsPerUser = maxConnectionsPerUser;
        this.maxAgeMs = maxAgeMs;
        this.idleCheckInterval = setInterval(() => this.evictIdleSessions(), 60_000);
    }

    private add(session: PersistentSession): void {
        this.sessions.set(session.sessionId, session);
    }

    /**
     * Atomically checks the per-user limit and adds the session if under limit.
     * Returns true if added, false if the user is at or over the limit.
     * JavaScript is single-threaded — no async gap between check and insert.
     */
    tryAdd(session: PersistentSession): boolean {
        if (this.isAtLimit(session.userId)) return false;
        this.sessions.set(session.sessionId, session);
        return true;
    }

    get(sessionId: string): PersistentSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Closes the SSH handler and removes the session. With a `reason`, an
     * attached browser is told why (and gets any recording in progress), since
     * the shell's own close message is suppressed once `isClosing` is set.
     */
    delete(sessionId: string, reason?: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            if (reason && session.attachedWs?.readyState === WebSocket.OPEN) {
                const recording = session.recording?.serialize();
                session.recording = null;
                session.attachedWs.send(
                    JSON.stringify({ type: 'closed', message: reason, ...recording }),
                );
            }
            session.isClosing = true;
            closeGuests(session, 'The shared session has ended');
            session.handler.close();
            this.sessions.delete(sessionId);
        }
    }

    get size(): number {
        return this.sessions.size;
    }

    countByUser(userId: string): number {
        let n = 0;
        for (const s of this.sessions.values()) {
            if (s.userId === userId) n++;
        }
        return n;
    }

    /**
     * Attempts to evict the oldest detached session for userId.
     * Returns true if a session was evicted, false if none available.
     */
    evictOldestDetachedForUser(userId: string): boolean {
        let oldest: PersistentSession | null = null;
        for (const s of this.sessions.values()) {
            if (s.userId === userId && s.attachedWs === null) {
                if (!oldest || s.createdAt < oldest.createdAt) oldest = s;
            }
        }
        if (oldest) {
            this.delete(oldest.sessionId);
            return true;
        }
        return false;
    }

    isAtLimit(userId: string): boolean {
        if (this.maxConnectionsPerUser <= 0) return false; // unlimited
        return this.countByUser(userId) >= this.maxConnectionsPerUser;
    }

    /** Shell output or input: keeps the session from being closed as idle. */
    touch(session: PersistentSession): void {
        session.lastActivityAt = Date.now();
    }

    private evictIdleSessions(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            let reason: string | null = null;
            if (now - session.lastActivityAt > this.idleTimeoutMs) {
                reason = `Closed after ${formatDuration(this.idleTimeoutMs)} without activity.`;
            } else if (this.maxAgeMs > 0 && now - session.createdAt > this.maxAgeMs) {
                reason = `Closed: sessions last at most ${formatDuration(this.maxAgeMs)}.`;
            }
            if (reason) {
                console.log(
                    `[PersistentSessionStore] Closing session ${id} (user ${session.userId}): ${reason}`,
                );
                this.delete(id, reason);
            }
        }
    }

    /** Call on gateway shutdown to clean up the interval and all sessions. */
    destroy(): void {
        clearInterval(this.idleCheckInterval);
        for (const id of [...this.sessions.keys()]) {
            this.delete(id);
        }
    }
}

function formatDuration(ms: number): string {
    const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
    if (ms >= 86_400_000 && ms % 86_400_000 === 0) return plural(ms / 86_400_000, 'day');
    if (ms >= 3_600_000 && ms % 3_600_000 === 0) return plural(ms / 3_600_000, 'hour');
    if (ms >= 60_000) return plural(Math.round(ms / 60_000), 'minute');
    return plural(Math.round(ms / 1000), 'second');
}
