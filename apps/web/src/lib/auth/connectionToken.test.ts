import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as jose from 'jose';
import {
    mintConnectionToken,
    getJWEKey,
    jumpClaim,
    verifyServiceToken,
    type ConnectionTokenClaims,
} from './connectionToken';

const ORIGINAL_ENV = { ...process.env };

describe('connectionToken', () => {
    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
        vi.unstubAllEnvs();
    });

    describe('getJWEKey', () => {
        it('throws in production when the secret is unset', () => {
            vi.stubEnv('NODE_ENV', 'production');
            delete process.env.GATEWAY_JWT_SECRET;
            expect(() => getJWEKey()).toThrow(/must be set/i);
        });

        it('throws in production when the secret is still the placeholder', () => {
            vi.stubEnv('NODE_ENV', 'production');
            process.env.GATEWAY_JWT_SECRET = 'gateway-secret-key-change-in-production';
            expect(() => getJWEKey()).toThrow(/must be set/i);
        });

        it('falls back to a dev key outside production', () => {
            vi.stubEnv('NODE_ENV', 'development');
            delete process.env.GATEWAY_JWT_SECRET;
            expect(() => getJWEKey()).not.toThrow();
        });

        it('derives the same key for the same secret (deterministic)', () => {
            process.env.GATEWAY_JWT_SECRET = 'a-strong-shared-secret';
            const a = getJWEKey();
            const b = getJWEKey();
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
        });

        it('derives different keys for different secrets', () => {
            process.env.GATEWAY_JWT_SECRET = 'secret-one';
            const a = getJWEKey();
            process.env.GATEWAY_JWT_SECRET = 'secret-two';
            const b = getJWEKey();
            expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
        });
    });

    describe('verifyServiceToken', () => {
        const service = (claims: Record<string, unknown>, age = '60s') =>
            new jose.EncryptJWT(claims)
                .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
                .setIssuedAt()
                .setExpirationTime(age)
                .encrypt(getJWEKey());

        it('accepts a token made for that purpose', async () => {
            expect(
                await verifyServiceToken(
                    await service({ purpose: 'access-check' }),
                    'access-check',
                ),
            ).toBe(true);
        });

        it('refuses another purpose, a connection token and garbage', async () => {
            expect(
                await verifyServiceToken(await service({ purpose: 'other' }), 'access-check'),
            ).toBe(false);
            const conn = await mintConnectionToken({
                userId: 'u',
                sid: 's',
                serverId: 'x',
                protocol: 'ssh',
                host: 'h',
                port: 22,
                username: 'r',
            });
            expect(await verifyServiceToken(conn, 'access-check')).toBe(false);
            expect(await verifyServiceToken('not-a-token', 'access-check')).toBe(false);
        });

        it('refuses an expired token', async () => {
            expect(
                await verifyServiceToken(
                    await service({ purpose: 'access-check' }, '-1s'),
                    'access-check',
                ),
            ).toBe(false);
        });
    });

    describe('mintConnectionToken', () => {
        const claims: ConnectionTokenClaims = {
            userId: 'user-1',
            sid: 'session-1',
            serverId: 'server-1',
            protocol: 'ssh',
            host: '203.0.113.5',
            port: 22,
            username: 'root',
        };

        beforeEach(() => {
            process.env.GATEWAY_JWT_SECRET = 'a-strong-shared-secret';
        });

        it('mints a token decryptable with the same key, round-tripping claims', async () => {
            const token = await mintConnectionToken(claims);
            const key = getJWEKey();
            const { payload } = await jose.jwtDecrypt(token, key);

            expect(payload.userId).toBe(claims.userId);
            expect(payload.serverId).toBe(claims.serverId);
            expect(payload.protocol).toBe(claims.protocol);
            expect(payload.host).toBe(claims.host);
            expect(payload.username).toBe(claims.username);
        });

        it('sets a ~5 minute expiry', async () => {
            const token = await mintConnectionToken(claims);
            const key = getJWEKey();
            const { payload } = await jose.jwtDecrypt(token, key);

            expect(payload.exp).toBeDefined();
            expect(payload.iat).toBeDefined();
            const ttl = (payload.exp as number) - (payload.iat as number);
            expect(ttl).toBeGreaterThanOrEqual(295);
            expect(ttl).toBeLessThanOrEqual(305);
        });

        it('cannot be decrypted with a different key', async () => {
            const token = await mintConnectionToken(claims);

            process.env.GATEWAY_JWT_SECRET = 'a-different-secret';
            const wrongKey = getJWEKey();

            await expect(jose.jwtDecrypt(token, wrongKey)).rejects.toThrow();
        });
    });
});

describe('jumpClaim', () => {
    it('is null without a jump host', () => {
        expect(jumpClaim(null)).toBeNull();
        expect(jumpClaim(undefined)).toBeNull();
    });

    it('carries the bastion credentials, with absent secrets as null', () => {
        expect(
            jumpClaim({
                host: 'bastion',
                port: 22,
                username: 'jump',
                privateKey: 'KEY',
                hostKey: { fingerprint: 'SHA256:abc' },
            }),
        ).toEqual({
            host: 'bastion',
            port: 22,
            username: 'jump',
            password: null,
            privateKey: 'KEY',
            passphrase: null,
            hostKey: 'SHA256:abc',
            certificate: null,
        });
    });

    it('survives the JWE round trip inside a connection token', async () => {
        const token = await mintConnectionToken({
            userId: 'u1',
            sid: 'sess-1',
            serverId: 's1',
            protocol: 'ssh',
            host: '10.0.2.4',
            port: 22,
            username: 'deploy',
            hostKey: 'SHA256:target',
            jump: jumpClaim({
                host: 'bastion',
                port: 2222,
                username: 'jump',
                password: 'pw',
                hostKey: { fingerprint: 'SHA256:bastion' },
            }),
        });
        const { payload } = await jose.jwtDecrypt(token, getJWEKey());
        expect(payload.hostKey).toBe('SHA256:target');
        expect(payload.jump).toMatchObject({
            host: 'bastion',
            port: 2222,
            password: 'pw',
            hostKey: 'SHA256:bastion',
        });
    });
});
