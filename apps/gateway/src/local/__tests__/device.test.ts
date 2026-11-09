import { generateKeyPairSync } from 'crypto';
import { EventEmitter } from 'events';
import * as jose from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client, ConnectConfig } from 'ssh2';

/**
 * Device mode as the desktop app runs it: LOCAL_GATEWAY=1, config over the
 * utility process's message port.
 */

const jwk = () =>
    generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
const pub = ({ kty, crv, x, y }: jose.JWK) => ({ kty, crv, x, y });

const enc = jwk() as jose.JWK;
const sig = jwk() as jose.JWK;
const SECRET = 'a'.repeat(43);

type DeviceModule = typeof import('../device.js');
type TokenModule = typeof import('../../auth/token.js');
let device: DeviceModule;
let token: TokenModule;
let keyId: string;
const port = new EventEmitter() as EventEmitter & { postMessage: (m: unknown) => void };
port.postMessage = () => {};

beforeAll(async () => {
    process.env.LOCAL_GATEWAY = '1';
    (process as unknown as { parentPort: unknown }).parentPort = port;
    vi.resetModules();
    device = await import('../device.js');
    token = await import('../../auth/token.js');
    const ready = device.receiveLocalConfig();
    // Junk first: only a well-formed config message counts.
    port.emit('message', { data: { type: 'other' } });
    port.emit('message', { data: { type: 'config', secret: SECRET, enc, sig } });
    keyId = (await ready).keys.keyId;
});

afterAll(() => {
    delete process.env.LOCAL_GATEWAY;
    delete (process as unknown as { parentPort?: unknown }).parentPort;
    vi.resetModules();
});

async function seal(claims: Record<string, unknown>, to: jose.JWK = enc) {
    const key = await jose.importJWK(pub(to), 'ECDH-ES');
    return new jose.EncryptJWT({
        userId: 'u1',
        serverId: 's1',
        protocol: 'ssh',
        host: '10.0.0.5',
        username: 'root',
        sid: 'sess',
        deviceKeyId: keyId,
        ...claims,
    })
        .setProtectedHeader({ alg: 'ECDH-ES', enc: 'A256GCM' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .encrypt(key);
}

describe('device mode', () => {
    it('identifies the device by its signing key thumbprint', async () => {
        expect(keyId).toBe(await jose.calculateJwkThumbprint(pub(sig)));
    });

    it('ignores a second config message', async () => {
        port.emit('message', { data: { type: 'config', secret: 'b'.repeat(43), enc, sig } });
        expect(device.localSecretOk(new URL(`ws://x/connect?lk=${SECRET}`))).toBe(true);
    });

    it('accepts only connections carrying the launch secret', () => {
        expect(device.localSecretOk(new URL(`ws://x/connect?lk=${SECRET}`))).toBe(true);
        expect(device.localSecretOk(new URL('ws://x/connect'))).toBe(false);
        expect(device.localSecretOk(new URL(`ws://x/connect?lk=${'b'.repeat(43)}`))).toBe(false);
        expect(device.localSecretOk(new URL('ws://x/connect?lk=short'))).toBe(false);
    });

    it('opens a token sealed to this device', async () => {
        const t = await token.validateToken(await seal({}));
        expect(t.host).toBe('10.0.0.5');
    });

    it('refuses a token sealed to another device', async () => {
        await expect(token.validateToken(await seal({}, jwk() as jose.JWK))).rejects.toThrow();
    });

    it('refuses a token naming another device', async () => {
        await expect(token.validateToken(await seal({ deviceKeyId: 'other' }))).rejects.toThrow();
    });

    it('refuses guest joins and shared-gateway tokens', async () => {
        const join = { sessionId: 'x', ownerId: 'o', mode: 'view' };
        await expect(token.validateToken(await seal({ join }))).rejects.toThrow();
        const shared = await new jose.EncryptJWT({ userId: 'u1', serverId: 's1' })
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .setExpirationTime('5m')
            .encrypt(new Uint8Array(32));
        await expect(token.validateToken(shared)).rejects.toThrow();
    });

    it('signs device requests with a short-lived ES256 token', async () => {
        const header = await device.deviceAuthorization('access-check');
        expect(header.startsWith('Device ')).toBe(true);
        const { payload, protectedHeader } = await jose.jwtVerify(
            header.slice(7),
            await jose.importJWK(pub(sig), 'ES256'),
        );
        expect(payload.purpose).toBe('access-check');
        expect(protectedHeader.kid).toBe(keyId);
        expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
    });

    it('turns an unpinned host into a first-use check that reports the key', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
        vi.stubGlobal('fetch', fetchMock);
        const t = await token.validateToken(await seal({ hostKeyFirstUse: true }));
        device.armFirstUse(t);
        expect(typeof t.hostKey).toBe('object');

        const { applyHostKeyCheck } = await import('../../auth/host-key.js');
        const cc: ConnectConfig = {};
        const client = { prependListener: vi.fn() } as unknown as Client;
        applyHostKeyCheck(client, cc, t.hostKey, 'Server');
        const key = Buffer.from('000000077373682d7273610000', 'hex');
        expect((cc.hostVerifier as (k: Buffer) => boolean)(key)).toBe(true);
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toMatch(/\/api\/devices\/host-key$/);
        expect(JSON.parse(init.body)).toMatchObject({ serverId: 's1', jump: false });
        expect(init.headers.authorization).toMatch(/^Device /);
        vi.unstubAllGlobals();
    });

    it('keeps a pinned key strict', async () => {
        const t = await token.validateToken(
            await seal({ hostKeyFirstUse: true, hostKey: 'SHA256:pinned' }),
        );
        device.armFirstUse(t);
        expect(t.hostKey).toBe('SHA256:pinned');
    });
});
