import { describe, it, expect, vi } from 'vitest';
import * as jose from 'jose';
import { createHash } from 'crypto';
import {
    grantKey,
    runAccessCheck,
    webAccessAsker,
    type Grant,
} from '../access-check.js';
import { mintServiceToken, validateToken } from '../../auth/token.js';

const conn = (grant: Grant) => ({ grant, close: vi.fn<(message: string) => void>() });

const alice: Grant = { sid: 's-a', userId: 'alice', kind: 'server', serverId: 'srv1' };
const bob: Grant = { sid: 's-b', userId: 'bob', kind: 'server', serverId: 'srv1' };

describe('runAccessCheck', () => {
    it('closes only the connections the web app denies, with its message', async () => {
        const a1 = conn(alice);
        const a2 = conn(alice); // a second terminal on the same grant
        const b = conn(bob);
        const closed = await runAccessCheck([a1, a2, b], async () => [
            { key: grantKey(alice), message: 'You were signed out' },
        ]);
        expect(closed).toBe(2);
        expect(a1.close).toHaveBeenCalledWith('You were signed out');
        expect(a2.close).toHaveBeenCalledWith('You were signed out');
        expect(b.close).not.toHaveBeenCalled();
    });

    it('asks about each distinct grant once', async () => {
        const ask = vi.fn().mockResolvedValue([]);
        await runAccessCheck([conn(alice), conn(alice), conn(bob)], ask);
        expect(ask).toHaveBeenCalledOnce();
        expect(ask.mock.calls[0][0]).toHaveLength(2);
    });

    it('keeps everything open when the web app cannot answer', async () => {
        const a = conn(alice);
        expect(await runAccessCheck([a], async () => null)).toBe(0);
        expect(a.close).not.toHaveBeenCalled();
    });

    it('does not call the web app with nothing open', async () => {
        const ask = vi.fn();
        await runAccessCheck([], ask);
        expect(ask).not.toHaveBeenCalled();
    });

    it('tells grants apart by sign-in, server and share link', () => {
        const keys = new Set([
            grantKey(alice),
            grantKey({ ...alice, sid: 'other' }),
            grantKey({ ...alice, serverId: 'srv2' }),
            grantKey({ ...alice, kind: 'guest', shareId: 'x' }),
            grantKey({ ...alice, kind: 'guest', shareId: 'y' }),
        ]);
        expect(keys.size).toBe(5);
    });
});

describe('webAccessAsker', () => {
    it('sends a service token and returns the denials', async () => {
        const fetchFn = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ data: { denied: [{ key: 'k', message: 'm' }] } })),
            );
        const ask = webAccessAsker('http://web:22080', fetchFn as never);
        expect(await ask([{ ...alice, key: 'k' }])).toEqual([{ key: 'k', message: 'm' }]);
        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe('http://web:22080/api/internal/access-check');
        const token = (init.headers.authorization as string).replace('Bearer ', '');
        const key = new Uint8Array(createHash('sha256').update('dev-gateway-secret').digest());
        const { payload } = await jose.jwtDecrypt(token, key);
        expect(payload.purpose).toBe('access-check');
    });

    it('fails open on an error status or a network error', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const bad = webAccessAsker(
            'http://web',
            vi.fn().mockResolvedValue(new Response('', { status: 500 })) as never,
        );
        expect(await bad([{ ...alice, key: 'k' }])).toBeNull();
        const down = webAccessAsker(
            'http://web',
            vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never,
        );
        expect(await down([{ ...alice, key: 'k' }])).toBeNull();
    });
});

describe('service tokens', () => {
    it('are never accepted as connection tokens', async () => {
        await expect(validateToken(await mintServiceToken('access-check'))).rejects.toThrow();
    });
});
