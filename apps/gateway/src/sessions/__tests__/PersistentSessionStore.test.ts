import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PersistentSessionStore, type PersistentSession } from '../PersistentSessionStore.js';

function makeSession(overrides: Partial<PersistentSession> = {}): PersistentSession {
    return {
        sessionId: 'sess-1',
        userId: 'user-1',
        serverId: 'server-1',
        handler: { close: vi.fn(), isConnected: vi.fn().mockReturnValue(true) } as any,
        buffer: {
            append: vi.fn(),
            snapshot: vi.fn().mockReturnValue(new Uint8Array(0)),
            byteLength: 0,
        } as any,
        lastActivityAt: Date.now(),
        createdAt: Date.now(),
        attachedWs: null,
        detachedAt: null,
        isClosing: false,
        recording: null,
        ...overrides,
    };
}

describe('PersistentSessionStore', () => {
    let store: PersistentSessionStore;

    beforeEach(() => {
        vi.useFakeTimers();
        store = new PersistentSessionStore(1000); // 1 second idle timeout for tests
    });

    afterEach(() => {
        store.destroy();
        vi.useRealTimers();
    });

    it('stores and retrieves sessions', () => {
        const session = makeSession();
        store.tryAdd(session);
        expect(store.get('sess-1')).toBe(session);
    });

    it('returns undefined for unknown sessionId', () => {
        expect(store.get('unknown')).toBeUndefined();
    });

    it('delete calls handler.close and removes session', () => {
        const session = makeSession();
        store.tryAdd(session);
        store.delete('sess-1');
        expect(session.handler.close).toHaveBeenCalledOnce();
        expect(session.isClosing).toBe(true);
        expect(store.get('sess-1')).toBeUndefined();
    });

    it('sets isClosing=true before calling handler.close', () => {
        let closingAtCallTime: boolean | undefined;
        const session = makeSession({
            handler: {
                close: vi.fn().mockImplementation(() => {
                    closingAtCallTime = session.isClosing;
                }),
                write: vi.fn(),
                resize: vi.fn(),
                isConnected: vi.fn().mockReturnValue(true),
            } as any,
        });
        store.tryAdd(session);
        store.delete('sess-1');
        expect(closingAtCallTime).toBe(true); // flag was set BEFORE close() ran
    });

    it('countByUser counts attached and detached sessions', () => {
        store.tryAdd(makeSession({ sessionId: 'a', userId: 'user-1', attachedWs: null }));
        store.tryAdd(makeSession({ sessionId: 'b', userId: 'user-1', attachedWs: {} as any }));
        store.tryAdd(makeSession({ sessionId: 'c', userId: 'user-2' }));
        expect(store.countByUser('user-1')).toBe(2);
        expect(store.countByUser('user-2')).toBe(1);
    });

    it('evictOldestDetachedForUser removes oldest detached session for user', () => {
        const old = makeSession({
            sessionId: 'old',
            userId: 'user-1',
            createdAt: 1000,
            attachedWs: null,
        });
        const newS = makeSession({
            sessionId: 'new',
            userId: 'user-1',
            createdAt: 2000,
            attachedWs: null,
        });
        store.tryAdd(old);
        store.tryAdd(newS);
        const evicted = store.evictOldestDetachedForUser('user-1');
        expect(evicted).toBe(true);
        expect(store.get('old')).toBeUndefined();
        expect(store.get('new')).toBeDefined();
    });

    it('evictOldestDetachedForUser skips attached sessions', () => {
        const attached = makeSession({
            sessionId: 'a',
            userId: 'user-1',
            createdAt: 1000,
            attachedWs: {} as any,
        });
        store.tryAdd(attached);
        const evicted = store.evictOldestDetachedForUser('user-1');
        expect(evicted).toBe(false);
        expect(store.get('a')).toBeDefined();
    });

    it('idle check evicts detached sessions past the grace period', () => {
        const session = makeSession({ detachedAt: Date.now() - 2000, attachedWs: null });
        store.tryAdd(session);
        vi.advanceTimersByTime(60_000); // trigger idle check
        expect(store.get('sess-1')).toBeUndefined();
        expect(session.handler.close).toHaveBeenCalledOnce();
    });

    it('idle check does not evict attached sessions', () => {
        const ws = {} as any;
        const session = makeSession({ detachedAt: null, attachedWs: ws });
        store.tryAdd(session);
        vi.advanceTimersByTime(60_000);
        expect(store.get('sess-1')).toBeDefined();
    });

    it('idle check does not evict a session still within its grace window', () => {
        // Grace window of 5 minutes; only 60s elapses before the check runs.
        const graceStore = new PersistentSessionStore(5 * 60_000);
        try {
            const session = makeSession({ detachedAt: Date.now(), attachedWs: null });
            graceStore.tryAdd(session);
            vi.advanceTimersByTime(60_000);
            expect(graceStore.get('sess-1')).toBeDefined();
        } finally {
            graceStore.destroy();
        }
    });

    describe('tryAdd', () => {
        it('adds session when under limit and returns true', () => {
            const session = makeSession();
            const result = store.tryAdd(session);
            expect(result).toBe(true);
            expect(store.get('sess-1')).toBe(session);
        });

        it('is unlimited by default', () => {
            // No per-user cap unless GATEWAY_MAX_CONNECTIONS_PER_USER is set.
            for (let i = 0; i < 50; i++) {
                expect(
                    store.tryAdd(makeSession({ sessionId: `sess-${i}`, userId: 'user-1' })),
                ).toBe(true);
            }
            expect(store.isAtLimit('user-1')).toBe(false);
            expect(store.countByUser('user-1')).toBe(50);
        });

        it('returns false and does not add when at an explicit limit', () => {
            const capped = new PersistentSessionStore(1000, 5);
            try {
                for (let i = 0; i < 5; i++) {
                    capped.tryAdd(makeSession({ sessionId: `sess-${i}`, userId: 'user-1' }));
                }
                const extra = makeSession({ sessionId: 'sess-extra', userId: 'user-1' });
                expect(capped.tryAdd(extra)).toBe(false);
                expect(capped.get('sess-extra')).toBeUndefined();
            } finally {
                capped.destroy();
            }
        });

        it('counts only sessions for the same user', () => {
            const capped = new PersistentSessionStore(1000, 5);
            try {
                // Fill up user-1 to limit
                for (let i = 0; i < 5; i++) {
                    capped.tryAdd(makeSession({ sessionId: `sess-u1-${i}`, userId: 'user-1' }));
                }
                // user-2 should still be able to add
                const user2Session = makeSession({ sessionId: 'sess-u2-1', userId: 'user-2' });
                expect(capped.tryAdd(user2Session)).toBe(true);
                expect(capped.get('sess-u2-1')).toBe(user2Session);
            } finally {
                capped.destroy();
            }
        });
    });
});
