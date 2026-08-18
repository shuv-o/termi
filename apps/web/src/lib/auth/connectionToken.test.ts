import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as jose from 'jose';
import { mintConnectionToken, getJWEKey, type ConnectionTokenClaims } from './connectionToken';

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

    describe('mintConnectionToken', () => {
        const claims: ConnectionTokenClaims = {
            userId: 'user-1',
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
