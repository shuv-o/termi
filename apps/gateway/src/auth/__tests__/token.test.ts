import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as jose from 'jose';
import { createHash } from 'crypto';
import { validateToken } from '../token.js';

const ORIGINAL_ENV = { ...process.env };
const SECRET = 'a-strong-shared-secret';

function keyFor(secret: string): Uint8Array {
    return new Uint8Array(createHash('sha256').update(secret).digest());
}

async function makeToken(
    claims: Record<string, unknown>,
    opts: { secret?: string; expiresIn?: string } = {},
): Promise<string> {
    const key = keyFor(opts.secret ?? SECRET);
    return new jose.EncryptJWT(claims)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setExpirationTime(opts.expiresIn ?? '5m')
        .setIssuedAt()
        .encrypt(key);
}

const BASE_SSH_CLAIMS = {
    userId: 'user-1',
    serverId: 'server-1',
    protocol: 'ssh',
    host: '203.0.113.5',
    port: 22,
    username: 'root',
};

describe('validateToken', () => {
    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
        process.env.GATEWAY_JWT_SECRET = SECRET;
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('accepts a well-formed ssh token and returns its payload', async () => {
        const token = await makeToken(BASE_SSH_CLAIMS);
        const payload = await validateToken(token);
        expect(payload.userId).toBe('user-1');
        expect(payload.serverId).toBe('server-1');
        expect(payload.protocol).toBe('ssh');
        expect(payload.host).toBe('203.0.113.5');
        expect(payload.username).toBe('root');
    });

    it('accepts a tunnel token carrying remoteHost/remotePort', async () => {
        const token = await makeToken({
            ...BASE_SSH_CLAIMS,
            protocol: 'tunnel',
            remoteHost: 'internal-service',
            remotePort: 8080,
        });
        const payload = await validateToken(token);
        expect(payload.protocol).toBe('tunnel');
        expect(payload.remoteHost).toBe('internal-service');
        expect(payload.remotePort).toBe(8080);
    });

    it('accepts a local-protocol token without host/username', async () => {
        const token = await makeToken({
            userId: 'user-1',
            serverId: 'local-session',
            protocol: 'local',
        });
        const payload = await validateToken(token);
        expect(payload.protocol).toBe('local');
    });

    it('rejects a token missing userId', async () => {
        const token = await makeToken({ ...BASE_SSH_CLAIMS, userId: undefined });
        await expect(validateToken(token)).rejects.toThrow('Invalid token');
    });

    it('rejects a token with an invalid protocol', async () => {
        const token = await makeToken({ ...BASE_SSH_CLAIMS, protocol: 'ftp' });
        await expect(validateToken(token)).rejects.toThrow('Invalid token');
    });

    it('rejects a remote-protocol token missing host/username', async () => {
        const token = await makeToken({
            userId: 'user-1',
            serverId: 'server-1',
            protocol: 'ssh',
        });
        await expect(validateToken(token)).rejects.toThrow('Invalid token');
    });

    it('rejects an expired token with a distinct error', async () => {
        const token = await makeToken(BASE_SSH_CLAIMS, { expiresIn: '-1s' });
        await expect(validateToken(token)).rejects.toThrow('Token expired');
    });

    it('rejects a token encrypted with a different secret', async () => {
        const token = await makeToken(BASE_SSH_CLAIMS, { secret: 'wrong-secret' });
        await expect(validateToken(token)).rejects.toThrow('Invalid token');
    });

    it('rejects a tampered/garbage token', async () => {
        await expect(validateToken('not.a.real.jwe.token')).rejects.toThrow('Invalid token');
    });

    it('throws if GATEWAY_JWT_SECRET is unset in production', async () => {
        const token = await makeToken(BASE_SSH_CLAIMS);
        process.env.NODE_ENV = 'production';
        delete process.env.GATEWAY_JWT_SECRET;
        await expect(validateToken(token)).rejects.toThrow('Invalid token');
    });
});
