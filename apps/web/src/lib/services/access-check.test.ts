import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { decide, MESSAGES, type AccessFacts, type AccessGrant } from './access-check.service';

function facts(overrides: Partial<AccessFacts> = {}): AccessFacts {
    return {
        sessions: new Map([
            ['s-alice', { userId: 'alice', valid: true }],
            ['s-bob', { userId: 'bob', valid: true }],
        ]),
        activeUsers: new Set(['alice', 'bob']),
        serverAccess: new Set(['alice|srv', 'bob|srv']),
        shares: new Map([['share', { serverId: 'srv', active: true }]]),
        localAllowed: true,
        ...overrides,
    };
}

const g = (over: Partial<AccessGrant>): AccessGrant => ({
    key: 'k',
    sid: 's-alice',
    userId: 'alice',
    kind: 'server',
    serverId: 'srv',
    ...over,
});

const verdict = (grant: AccessGrant, f = facts()) => decide([grant], f)[0]?.message ?? 'ok';

describe('decide', () => {
    it('keeps a connection whose sign-in and server access are intact', () => {
        expect(verdict(g({}))).toBe('ok');
    });

    it('closes when the sign-in was revoked or expired', () => {
        const f = facts({ sessions: new Map([['s-alice', { userId: 'alice', valid: false }]]) });
        expect(verdict(g({}), f)).toBe(MESSAGES.signedOut);
    });

    it('closes when the sign-in no longer exists', () => {
        expect(verdict(g({ sid: 'gone' }))).toBe(MESSAGES.signedOut);
    });

    it("closes when the sign-in is someone else's", () => {
        expect(verdict(g({ sid: 's-bob' }))).toBe(MESSAGES.signedOut);
    });

    it('closes when the account was deactivated, even for an older token', () => {
        const f = facts({ activeUsers: new Set(['bob']) });
        expect(verdict(g({ sid: null }), f)).toBe(MESSAGES.signedOut);
    });

    it('closes when the user can no longer connect to the server', () => {
        const f = facts({ serverAccess: new Set(['bob|srv']) });
        expect(verdict(g({}), f)).toBe(MESSAGES.noAccess);
        expect(verdict(g({ serverId: undefined }))).toBe(MESSAGES.noAccess);
    });

    it('removes a guest once the share link is off or names another server', () => {
        const guest = g({ kind: 'guest', shareId: 'share' });
        expect(verdict(guest)).toBe('ok');
        const off = facts({ shares: new Map([['share', { serverId: 'srv', active: false }]]) });
        expect(verdict(guest, off)).toBe(MESSAGES.shareOff);
        expect(verdict({ ...guest, serverId: 'other' })).toBe(MESSAGES.shareOff);
        expect(verdict({ ...guest, shareId: 'unknown' })).toBe(MESSAGES.shareOff);
    });

    it('does not need server access for a guest (the owner has it)', () => {
        const f = facts({ serverAccess: new Set() });
        expect(verdict(g({ kind: 'guest', shareId: 'share' }), f)).toBe('ok');
    });

    it('closes local terminals once they are turned off', () => {
        const local = g({ kind: 'local', serverId: undefined });
        expect(verdict(local)).toBe('ok');
        expect(verdict(local, facts({ localAllowed: false }))).toBe(MESSAGES.localOff);
    });

    it('answers per grant', () => {
        const f = facts({ serverAccess: new Set(['alice|srv']) });
        const denied = decide([g({ key: 'a' }), g({ key: 'b', sid: 's-bob', userId: 'bob' })], f);
        expect(denied).toEqual([{ key: 'b', message: MESSAGES.noAccess }]);
    });
});
