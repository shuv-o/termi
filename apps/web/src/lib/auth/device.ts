/**
 * Desktop app devices: connecting to the user's own servers from their
 * computer, through a gateway that runs inside the app.
 *
 * A device registers two public P-256 keys: tokens are sealed to the first
 * (ECDH-ES), so only that app can open them; it signs requests with the
 * second (ES256), which identifies it by the key's thumbprint. Private keys
 * never leave the device.
 */

import * as jose from 'jose';

import { prisma } from '@/lib/db';
import type { ConnectionTokenClaims } from './connectionToken';

/** What the browser is told to connect to for a device token. */
export const DEVICE_GATEWAY_URL = 'termi-device://local';

export interface PublicJwk {
    kty: 'EC';
    crv: 'P-256';
    x: string;
    y: string;
}

const B64URL_32 = /^[A-Za-z0-9_-]{43}$/;

/** A public P-256 key, or null. A private key (`d`) is refused outright. */
export function parsePublicKey(value: unknown): PublicJwk | null {
    if (!value || typeof value !== 'object') return null;
    const k = value as Record<string, unknown>;
    if ('d' in k) return null;
    if (k.kty !== 'EC' || k.crv !== 'P-256') return null;
    if (typeof k.x !== 'string' || typeof k.y !== 'string') return null;
    if (!B64URL_32.test(k.x) || !B64URL_32.test(k.y)) return null;
    return { kty: 'EC', crv: 'P-256', x: k.x, y: k.y };
}

export function keyIdOf(sigKey: PublicJwk): Promise<string> {
    return jose.calculateJwkThumbprint(sigKey);
}

/** Seal connection claims so that only this device can open them. */
export async function sealToDevice(
    claims: ConnectionTokenClaims,
    device: { encKey: PublicJwk; keyId: string },
): Promise<string> {
    const key = await jose.importJWK(device.encKey, 'ECDH-ES');
    return new jose.EncryptJWT({ ...claims, deviceKeyId: device.keyId })
        .setProtectedHeader({ alg: 'ECDH-ES', enc: 'A256GCM', kid: device.keyId })
        .setIssuedAt()
        .setExpirationTime('5m')
        .encrypt(key);
}

export interface VerifiedDevice {
    id: string;
    userId: string;
    sessionId: string;
    keyId: string;
}

/**
 * The device behind an `Authorization: Device <jwt>` header, if the signature
 * is valid, the token is fresh and for `purpose`, and the sign-in the device
 * belongs to still stands.
 */
export async function verifyDeviceRequest(
    authorization: string | null,
    purpose: string,
): Promise<VerifiedDevice | null> {
    if (!authorization?.startsWith('Device ')) return null;
    const jwt = authorization.slice(7).trim();
    try {
        const { kid } = jose.decodeProtectedHeader(jwt);
        if (typeof kid !== 'string' || kid.length > 100) return null;
        const device = await prisma.device.findUnique({ where: { keyId: kid } });
        const sigKey = parsePublicKey(device?.sigKey);
        if (!device || !sigKey) return null;
        const { payload } = await jose.jwtVerify(jwt, await jose.importJWK(sigKey, 'ES256'), {
            algorithms: ['ES256'],
            maxTokenAge: '2m',
        });
        if (payload.purpose !== purpose) return null;
        const session = await prisma.session.findUnique({
            where: { id: device.sessionId },
            select: { userId: true, isRevoked: true, expiresAt: true },
        });
        if (
            !session ||
            session.isRevoked ||
            session.expiresAt < new Date() ||
            session.userId !== device.userId
        ) {
            return null;
        }
        await prisma.device
            .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
            .catch(() => {});
        return {
            id: device.id,
            userId: device.userId,
            sessionId: device.sessionId,
            keyId: device.keyId,
        };
    } catch {
        return null;
    }
}
