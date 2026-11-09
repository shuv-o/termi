import { generateKeyPairSync } from 'crypto';
import * as jose from 'jose';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { keyIdOf, parsePublicKey, sealToDevice } from './device';
import type { ConnectionTokenClaims } from './connectionToken';

const pair = () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const priv = privateKey.export({ format: 'jwk' }) as jose.JWK;
    const { kty, crv, x, y } = priv;
    return { priv, pub: { kty, crv, x, y } };
};

describe('parsePublicKey', () => {
    it('accepts a public P-256 key and drops anything extra', () => {
        const { pub } = pair();
        expect(parsePublicKey({ ...pub, kid: 'x', use: 'enc' })).toEqual(pub);
    });

    it('refuses private keys, other curves and malformed coordinates', () => {
        const { priv, pub } = pair();
        expect(parsePublicKey(priv)).toBeNull();
        expect(parsePublicKey({ ...pub, crv: 'P-384' })).toBeNull();
        expect(parsePublicKey({ ...pub, kty: 'RSA' })).toBeNull();
        expect(parsePublicKey({ ...pub, x: 'short' })).toBeNull();
        expect(parsePublicKey({ ...pub, y: `${pub.y}A` })).toBeNull();
        expect(parsePublicKey('key')).toBeNull();
        expect(parsePublicKey(null)).toBeNull();
    });
});

describe('sealToDevice', () => {
    const claims = {
        userId: 'u1',
        serverId: 's1',
        protocol: 'ssh',
        host: 'h',
        port: 22,
        username: 'root',
        password: 'secret',
        sid: 'sess',
    } as unknown as ConnectionTokenClaims;

    it('only the device holding the private key can open it', async () => {
        const dev = pair();
        const encKey = parsePublicKey(dev.pub)!;
        const keyId = await keyIdOf(encKey);
        const token = await sealToDevice(claims, { encKey, keyId });

        const { payload, protectedHeader } = await jose.jwtDecrypt(
            token,
            await jose.importJWK(dev.priv, 'ECDH-ES'),
        );
        expect(protectedHeader).toMatchObject({ alg: 'ECDH-ES', enc: 'A256GCM', kid: keyId });
        expect(payload).toMatchObject({ password: 'secret', deviceKeyId: keyId });
        expect(payload.exp! - payload.iat!).toBe(300);

        const other = pair();
        await expect(
            jose.jwtDecrypt(token, await jose.importJWK(other.priv, 'ECDH-ES')),
        ).rejects.toThrow();
    });

    it('keyIdOf is the RFC 7638 thumbprint the desktop app computes', async () => {
        const { pub } = pair();
        const json = JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y });
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
        expect(await keyIdOf(parsePublicKey(pub)!)).toBe(
            Buffer.from(digest).toString('base64url'),
        );
    });
});
