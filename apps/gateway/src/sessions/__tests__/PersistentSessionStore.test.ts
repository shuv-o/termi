import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PersistentSessionStore, type PersistentSession } from '../PersistentSessionStore.js';

function makeSession(overrides: Partial<PersistentSession> = {}): PersistentSession {
    return {
        sessionId: 'sess-1',
        userId: 'user-1',
        serverId: 'server-1',
        handler: { close: vi.fn(), isConnected: vi.fn().mockReturnValue(true) } as any,
        buffer: { append: vi.fn(), snapshot: vi.fn().mockReturnValue(new Uint8Array(0)), byteLength: 0 } as any,
        lastKeystrokeAt: Date.now(),
        createdAt: Date.now(),
        attachedWs: null,
        isClosing: false,
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
        store.add(session);
        expect(store.get('sess-1')).toBe(session);
    });

    it('returns undefined for unknown sessionId', () => {
        expect(store.get('unknown')).toBeUndefined();
    });

    it('delete calls handler.close and removes session', () => {
        const session = makeSession();
        store.add(session);
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
        store.add(session);
        store.delete('sess-1');
        expect(closingAtCallTime).toBe(true); // flag was set BEFORE close() ran
    });

    it('countByUser counts attached and detached sessions', () => {
        store.add(makeSession({ sessionId: 'a', userId: 'user-1', attachedWs: null }));
        store.add(makeSession({ sessionId: 'b', userId: 'user-1', attachedWs: {} as any }));
        store.add(makeSession({ sessionId: 'c', userId: 'user-2' }));
        expect(store.countByUser('user-1')).toBe(2);
        expect(store.countByUser('user-2')).toBe(1);
    });

    it('evictOldestDetachedForUser removes oldest detached session for user', () => {
        const old = makeSession({ sessionId: 'old', userId: 'user-1', createdAt: 1000, attachedWs: null });
        const newS = makeSession({ sessionId: 'new', userId: 'user-1', createdAt: 2000, attachedWs: null });
        store.add(old);
        store.add(newS);
        const evicted = store.evictOldestDetachedForUser('user-1');
        expect(evicted).toBe(true);
        expect(store.get('old')).toBeUndefined();
        expect(store.get('new')).toBeDefined();
    });

    it('evictOldestDetachedForUser skips attached sessions', () => {
        const attached = makeSession({ sessionId: 'a', userId: 'user-1', createdAt: 1000, attachedWs: {} as any });
        store.add(attached);
        const evicted = store.evictOldestDetachedForUser('user-1');
        expect(evicted).toBe(false);
        expect(store.get('a')).toBeDefined();
    });

    it('idle check evicts detached sessions past timeout', () => {
        const session = makeSession({ lastKeystrokeAt: Date.now() - 2000, attachedWs: null });
        store.add(session);
        vi.advanceTimersByTime(60_000); // trigger idle check
        expect(store.get('sess-1')).toBeUndefined();
        expect(session.handler.close).toHaveBeenCalledOnce();
    });

    it('idle check does not evict attached sessions', () => {
        const ws = {} as any;
        const session = makeSession({ lastKeystrokeAt: Date.now() - 2000, attachedWs: ws });
        store.add(session);
        vi.advanceTimersByTime(60_000);
        expect(store.get('sess-1')).toBeDefined();
    });
});
