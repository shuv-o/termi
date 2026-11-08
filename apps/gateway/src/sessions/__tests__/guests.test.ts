import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { answerJoin, closeGuests, fanOut, kickGuest, requestJoin } from '../guests.js';
import type { PersistentSession } from '../PersistentSessionStore.js';

class FakeWs extends EventEmitter {
    readyState: number = WebSocket.OPEN;
    sent: (string | Buffer)[] = [];
    send(data: string | Buffer) {
        this.sent.push(data);
    }
    close() {
        if (this.readyState === WebSocket.CLOSED) return;
        this.readyState = WebSocket.CLOSED;
        this.emit('close');
    }
    json() {
        return this.sent.filter((d) => typeof d === 'string').map((d) => JSON.parse(d as string));
    }
}

function session(owner: FakeWs | null) {
    return {
        sessionId: 's1',
        userId: 'owner',
        serverId: 'srv',
        handler: { write: vi.fn(), close: vi.fn() },
        buffer: { snapshot: () => Buffer.from('history'), append: vi.fn() },
        attachedWs: owner,
        isClosing: false,
        guests: new Map(),
        joinRequests: new Map(),
    } as unknown as PersistentSession & { handler: { write: ReturnType<typeof vi.fn> } };
}

const lastRequestId = (owner: FakeWs) =>
    owner
        .json()
        .filter((m) => m.type === 'join-request')
        .pop()!.id as string;

afterEach(() => vi.useRealTimers());

describe('shared sessions', () => {
    it('needs the owner to be connected', () => {
        const s = session(null);
        const guest = new FakeWs();
        requestJoin(s, guest as never, { userId: 'g', email: 'g@x', mode: 'view' });
        expect(guest.json()[0].message).toMatch(/not connected/);
        expect(guest.readyState).toBe(WebSocket.CLOSED);
    });

    it('lets a guest in only when the owner allows, then streams output', () => {
        const owner = new FakeWs();
        const s = session(owner);
        const guest = new FakeWs();
        requestJoin(s, guest as never, { userId: 'g', email: 'g@x', mode: 'view' });
        expect(guest.json()).toEqual([{ type: 'waiting' }]);
        expect(owner.json()[0]).toMatchObject({ type: 'join-request', email: 'g@x', mode: 'view' });

        fanOut(s, Buffer.from('before')); // not admitted yet
        expect(guest.sent.some((d) => Buffer.isBuffer(d))).toBe(false);

        answerJoin(s, lastRequestId(owner), true);
        expect(guest.json().pop()).toEqual({ type: 'joined', mode: 'view' });
        expect(guest.sent.find((d) => Buffer.isBuffer(d))?.toString()).toBe('history');
        fanOut(s, Buffer.from('live'));
        expect(guest.sent.at(-1)?.toString()).toBe('live');
        expect(owner.json().pop()).toMatchObject({
            type: 'participants',
            guests: [{ email: 'g@x', mode: 'view' }],
        });
    });

    it('a denied guest is disconnected', () => {
        const owner = new FakeWs();
        const s = session(owner);
        const guest = new FakeWs();
        requestJoin(s, guest as never, { userId: 'g', email: 'g@x', mode: 'control' });
        answerJoin(s, lastRequestId(owner), false);
        expect(guest.readyState).toBe(WebSocket.CLOSED);
        expect(s.guests.size).toBe(0);
    });

    it('nobody answering means no', () => {
        vi.useFakeTimers();
        const owner = new FakeWs();
        const s = session(owner);
        const guest = new FakeWs();
        requestJoin(s, guest as never, { userId: 'g', email: 'g@x', mode: 'view' });
        vi.advanceTimersByTime(61_000);
        expect(guest.readyState).toBe(WebSocket.CLOSED);
        expect(s.joinRequests.size).toBe(0);
    });

    it('only control guests can type', () => {
        const owner = new FakeWs();
        const s = session(owner);
        const viewer = new FakeWs();
        const helper = new FakeWs();
        requestJoin(s, viewer as never, { userId: 'v', email: 'v@x', mode: 'view' });
        answerJoin(s, lastRequestId(owner), true);
        requestJoin(s, helper as never, { userId: 'h', email: 'h@x', mode: 'control' });
        answerJoin(s, lastRequestId(owner), true);

        viewer.emit('message', Buffer.from('rm -rf /\r'), true);
        expect(s.handler.write).not.toHaveBeenCalled();
        helper.emit('message', Buffer.from('ls\r'), true);
        expect(s.handler.write).toHaveBeenCalledWith(Buffer.from('ls\r'));
    });

    it('the owner can remove a guest, and ending the session removes everyone', () => {
        const owner = new FakeWs();
        const s = session(owner);
        const a = new FakeWs();
        const b = new FakeWs();
        requestJoin(s, a as never, { userId: 'a', email: 'a@x', mode: 'view' });
        answerJoin(s, lastRequestId(owner), true);
        requestJoin(s, b as never, { userId: 'b', email: 'b@x', mode: 'view' });
        answerJoin(s, lastRequestId(owner), true);

        kickGuest(s, [...s.guests.keys()][0]);
        expect(a.readyState).toBe(WebSocket.CLOSED);
        expect(s.guests.size).toBe(1);

        closeGuests(s, 'The shared session has ended');
        expect(b.readyState).toBe(WebSocket.CLOSED);
        expect(s.guests.size).toBe(0);
    });
});
