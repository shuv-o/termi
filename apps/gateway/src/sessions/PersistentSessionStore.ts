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
    isClosing: boolean;
}

const MAX_CONNECTIONS_PER_USER = 10;

export class PersistentSessionStore {
    private readonly sessions = new Map<string, PersistentSession>();
    private readonly idleCheckInterval: ReturnType<typeof setInterval>;
    private readonly idleTimeoutMs: number;

    constructor(idleTimeoutMs = 6 * 3600 * 1000) {
        this.idleTimeoutMs = idleTimeoutMs;
        this.idleCheckInterval = setInterval(() => this.evictIdleSessions(), 60_000);
    }

    add(session: PersistentSession): void {
        this.sessions.set(session.sessionId, session);
    }

    /**
     * Atomically checks the per-user limit and adds the session if under limit.
     * Returns true if added, false if the user is at or over the limit.
     * JavaScript is single-threaded — no async gap between check and insert.
     */
    tryAdd(session: PersistentSession): boolean {
        if (this.countByUser(session.userId) >= MAX_CONNECTIONS_PER_USER) return false;
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
        return this.countByUser(userId) >= MAX_CONNECTIONS_PER_USER;
    }

    private evictIdleSessions(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (session.attachedWs === null && now - session.lastActivityAt > this.idleTimeoutMs) {
                console.log(`[PersistentSessionStore] Evicting idle session ${id} (user ${session.userId})`);
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
