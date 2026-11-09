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
        isClosing: false,
        recording: null,
        guests: new Map(),
        joinRequests: new Map(),
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

    describe('idle and age limits', () => {
        const HOUR = 3_600_000;
        let limited: PersistentSessionStore;
        const openWs = () => ({ readyState: 1, send: vi.fn() }) as any;

        beforeEach(() => {
            limited = new PersistentSessionStore(8 * HOUR, 0, 7 * 24 * HOUR);
        });
        afterEach(() => limited.destroy());

        it('keeps a detached session that is still producing output', () => {
            const session = makeSession({ attachedWs: null });
            limited.tryAdd(session);
            // 10 hours with output every hour: never idle for 8.
            for (let h = 0; h < 10; h++) {
                vi.advanceTimersByTime(HOUR);
                limited.touch(session);
            }
            expect(limited.get('sess-1')).toBe(session);
            expect(session.handler.close).not.toHaveBeenCalled();
        });

        it('keeps a quiet detached session until the idle limit', () => {
            limited.tryAdd(makeSession({ attachedWs: null }));
            vi.advanceTimersByTime(7 * HOUR);
            expect(limited.get('sess-1')).toBeDefined();
        });

        it('closes a session with no activity for the idle limit, detached', () => {
            const session = makeSession({ attachedWs: null });
            limited.tryAdd(session);
            vi.advanceTimersByTime(8 * HOUR + 60_000);
            expect(limited.get('sess-1')).toBeUndefined();
            expect(session.handler.close).toHaveBeenCalledOnce();
        });

        it('closes an idle attached session and tells the browser why', () => {
            const ws = openWs();
            const session = makeSession({ attachedWs: ws });
            limited.tryAdd(session);
            vi.advanceTimersByTime(8 * HOUR + 60_000);
            expect(limited.get('sess-1')).toBeUndefined();
            const sent = JSON.parse(ws.send.mock.calls[0][0]);
            expect(sent).toMatchObject({
                type: 'closed',
                message: 'Closed after 8 hours without activity.',
            });
        });

        it('hands a recording in progress to the browser when closing', () => {
            const ws = openWs();
            const session = makeSession({
                attachedWs: ws,
                recording: { serialize: () => ({ cast: 'c', durationSec: 1, sizeBytes: 1 }) } as any,
            });
            limited.tryAdd(session);
            vi.advanceTimersByTime(8 * HOUR + 60_000);
            expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({ cast: 'c' });
        });

        it('closes a busy session once it reaches the age limit', () => {
            const session = makeSession({ attachedWs: null });
            limited.tryAdd(session);
            for (let h = 0; h < 7 * 24 + 1; h++) {
                vi.advanceTimersByTime(HOUR);
                if (limited.get('sess-1')) limited.touch(session);
            }
            expect(limited.get('sess-1')).toBeUndefined();
        });

        it('has no age limit when it is 0', () => {
            const unlimited = new PersistentSessionStore(8 * HOUR, 0, 0);
            try {
                const session = makeSession({ attachedWs: null });
                unlimited.tryAdd(session);
                for (let h = 0; h < 10 * 24; h++) {
                    vi.advanceTimersByTime(HOUR);
                    unlimited.touch(session);
                }
                expect(unlimited.get('sess-1')).toBeDefined();
            } finally {
                unlimited.destroy();
            }
        });
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
