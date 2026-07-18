import type { WebSocket } from 'ws';
import type { SSHHandler } from '../handlers/ssh.js';
import type { RingBuffer } from './RingBuffer.js';

export interface PersistentSession {
    sessionId: string;
    userId: string;
    serverId: string;
    handler: SSHHandler;
    buffer: RingBuffer;
    lastActivityAt: number;
    createdAt: number;
    attachedWs: WebSocket | null;
    /**
     * Timestamp (ms) at which the session became detached (no attached WS),
     * or null while a browser is attached. The detached-grace eviction clock
     * runs from this moment — independent of SSH output activity, so a noisy
     * detached session (e.g. `tail -f`) is still reclaimed on schedule.
     */
    detachedAt: number | null;
    isClosing: boolean;
}

/**
 * Per-user cap on concurrent persistent sessions. 0 (the default) means
 * unlimited — users open as many terminals as they like.
 *
 * This is a resource backstop, not an entitlement: every session holds an open
 * SSH connection to the remote host plus a 256 KB RingBuffer. Detached sessions
 * are still reclaimed after the grace period (GATEWAY_DETACHED_TTL_MIN)
 * whatever this is set to, so unlimited does not mean sessions accumulate
 * forever. Set GATEWAY_MAX_CONNECTIONS_PER_USER to a positive integer to
 * re-impose a cap.
 */
const DEFAULT_MAX_CONNECTIONS_PER_USER = (() => {
    const n = parseInt(process.env.GATEWAY_MAX_CONNECTIONS_PER_USER || '', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
})();

/**
 * How long a detached SSH session is kept alive (with its remote shell open)
 * waiting for the browser to reattach. Lower = less pressure on remote servers
 * from orphaned sessions; higher = longer reconnect window. Default 30 min,
 * overridable via GATEWAY_DETACHED_TTL_MIN.
 */
const DEFAULT_DETACHED_TTL_MS = (() => {
    const min = parseInt(process.env.GATEWAY_DETACHED_TTL_MIN || '', 10);
    return Number.isFinite(min) && min > 0 ? min * 60_000 : 30 * 60_000;
})();

export class PersistentSessionStore {
    private readonly sessions = new Map<string, PersistentSession>();
    private readonly idleCheckInterval: ReturnType<typeof setInterval>;
    private readonly idleTimeoutMs: number;
    /** 0 = unlimited. See DEFAULT_MAX_CONNECTIONS_PER_USER. */
    private readonly maxConnectionsPerUser: number;

    constructor(
        idleTimeoutMs = DEFAULT_DETACHED_TTL_MS,
        maxConnectionsPerUser = DEFAULT_MAX_CONNECTIONS_PER_USER,
    ) {
        this.idleTimeoutMs = idleTimeoutMs;
        this.maxConnectionsPerUser = maxConnectionsPerUser;
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

    /** Closes the SSH handler and removes the session. */
    delete(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.isClosing = true;
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

    private evictIdleSessions(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            // Evict on detached-grace expiry. The clock is the moment of
            // detachment (detachedAt), NOT last output — so a detached session
            // streaming output is still reclaimed once the grace window passes.
            if (session.detachedAt !== null && now - session.detachedAt > this.idleTimeoutMs) {
                console.log(
                    `[PersistentSessionStore] Evicting detached session ${id} (user ${session.userId}) after grace period`,
                );
                this.delete(id);
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
