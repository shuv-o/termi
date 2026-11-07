import { describe, it, expect, beforeAll } from 'vitest';
import { mintTunnelToken, readTunnelToken } from './tunnel-token';

const grant = { userId: 'u1', serverId: 's1', port: 8080, host: '127.0.0.1' };

describe('tunnel tokens', () => {
    beforeAll(() => {
        process.env.SESSION_SECRET = 'x'.repeat(40);
    });

    it('round-trips a grant', () => {
        expect(readTunnelToken(mintTunnelToken(grant))).toEqual(grant);
    });

    it('rejects a token whose payload was changed', () => {
        const [data, sig] = mintTunnelToken(grant).split('.');
        const forged = Buffer.from(
            JSON.stringify({ ...JSON.parse(Buffer.from(data, 'base64url').toString()), p: 22 }),
        ).toString('base64url');
        expect(readTunnelToken(`${forged}.${sig}`)).toBeNull();
    });

    it('rejects an expired token', () => {
        const old = mintTunnelToken(grant, Date.now() - 9 * 60 * 60 * 1000);
        expect(readTunnelToken(old)).toBeNull();
    });

    it('rejects a token signed with another secret', () => {
        const token = mintTunnelToken(grant);
        process.env.SESSION_SECRET = 'y'.repeat(40);
        expect(readTunnelToken(token)).toBeNull();
        process.env.SESSION_SECRET = 'x'.repeat(40);
    });

    it('rejects garbage', () => {
        for (const t of ['', 'abc', 'a.b.c', '.']) expect(readTunnelToken(t)).toBeNull();
    });
});
