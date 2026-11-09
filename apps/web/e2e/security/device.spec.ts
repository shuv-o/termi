/**
 * Desktop app devices ("connect from this computer"): registering one needs
 * a fresh password or passkey; it only ever receives logins for its user's
 * own servers that are set to connect from the device; its tokens are useless
 * anywhere else; and what it may ask or record is limited to its own user.
 */
import { generateKeyPairSync } from 'crypto';
import * as jose from 'jose';
import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { BASE, SSH_PASSWORD, SSH_PORT, USERS } from './env';
import { json, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const pair = () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const priv = privateKey.export({ format: 'jwk' }) as jose.JWK;
    const { kty, crv, x, y } = priv;
    return { priv, pub: { kty, crv, x, y } };
};
const enc = pair();
const sig = pair();
let keyId = '';

/** A sign-in of its own: step-up is remembered per sign-in, and so is the device. */
let alice: APIRequestContext;
let serverId = '';

const deviceAuth = async (purpose: string, key: jose.JWK = sig.priv, kid = keyId) =>
    `Device ${await new jose.SignJWT({ purpose })
        .setProtectedHeader({ alg: 'ES256', kid })
        .setIssuedAt()
        .setExpirationTime('60s')
        .sign(await jose.importJWK(key, 'ES256'))}`;

const register = (data: Record<string, unknown>) =>
    alice.post('/api/devices', {
        data: { name: 'test-laptop', encKey: enc.pub, sigKey: sig.pub, ...data },
    });

const token = (ctx: APIRequestContext, data: Record<string, unknown>) =>
    ctx.post('/api/connection/token', { data: { serverId, protocol: 'ssh', ...data } });

test.beforeAll(async () => {
    keyId = await jose.calculateJwkThumbprint(sig.pub);
    alice = await pwRequest.newContext({ baseURL: BASE });
    expect((await alice.post('/api/auth/login', { data: USERS.alice })).status()).toBe(200);
    const created = await json(
        await alice.post('/api/servers', {
            data: {
                name: 'device-box',
                host: '127.0.0.1',
                port: SSH_PORT,
                protocol: 'SSH',
                username: 'root',
                password: SSH_PASSWORD,
            },
        }),
    );
    expect(created.body?.success).toBe(true);
    serverId = created.body!.data.server.id;
});

test.afterAll(async () => {
    if (serverId) await alice.delete(`/api/servers/${serverId}`);
    await alice.dispose();
});

test('registering a device needs a fresh password or passkey', async () => {
    const res = await json(await register({}));
    expect(res.status).toBe(401);
    expect(res.body?.error).toBe('Re-authentication required');
    expect((await register({ authPassword: 'wrong-password' })).status()).toBe(401);
    expect((await alice.get('/api/devices').then(json)).body?.data.device).toBeNull();
});

test('a private key is never accepted as a device key', async () => {
    const res = await alice.post('/api/devices', {
        data: {
            name: 'x',
            encKey: enc.priv,
            sigKey: sig.pub,
            authPassword: USERS.alice.password,
        },
    });
    expect(res.status()).toBe(400);
    const same = await alice.post('/api/devices', {
        data: { name: 'x', encKey: sig.pub, sigKey: sig.pub },
    });
    expect(same.status()).toBe(400);
});

test('registration is recorded and audited', async () => {
    const res = await json(await register({ authPassword: USERS.alice.password }));
    expect(res.status).toBe(200);
    expect(res.body?.data.device.keyId).toBe(keyId);
    const { aliceId } = state();
    expect(
        Number(
            sql(
                `SELECT count(*) FROM "AuditLog" WHERE "userId" = '${aliceId}' AND action = 'DEVICE_REGISTERED'`,
            ),
        ),
    ).toBeGreaterThan(0);
});

test('a device token is only minted for servers set to connect from the device', async () => {
    // Default "Termi server": the device asks, the server answers with a gateway token.
    const viaServer = await json(await token(alice, { via: 'device' }));
    expect(viaServer.body, JSON.stringify(viaServer)).toMatchObject({ data: { via: 'gateway' } });

    expect(
        (await alice.patch(`/api/servers/${serverId}`, { data: { connectFrom: 'auto' } })).ok(),
    ).toBe(true);
    const viaDevice = await json(await token(alice, { via: 'device' }));
    expect(viaDevice.body?.data).toMatchObject({
        via: 'device',
        fallback: true,
        gatewayUrl: 'termi-device://local',
    });

    // Sealed to this device: its private key opens it, and it names the device.
    const { payload, protectedHeader } = await jose.jwtDecrypt(
        viaDevice.body!.data.token,
        await jose.importJWK(enc.priv, 'ECDH-ES'),
    );
    expect(protectedHeader.alg).toBe('ECDH-ES');
    expect(payload).toMatchObject({ deviceKeyId: keyId, serverId, password: SSH_PASSWORD });

    // File transfer runs on the device too; telnet never does.
    const scp = await json(await token(alice, { via: 'device', protocol: 'scp' }));
    expect(scp.body?.data.via).toBe('device');
    const telnet = await json(await token(alice, { via: 'device', protocol: 'telnet' }));
    expect(telnet.body?.data?.via).not.toBe('device');
});

test('another sign-in of the same user gets no device token', async () => {
    const other = await signedIn('alice');
    const res = await json(await token(other, { via: 'device' }));
    expect(res.body?.data.via).toBe('gateway');
});

test('a server shared with someone never goes to their device', async () => {
    const { aliceId, bobId } = state();
    const set = await alice.patch(`/api/servers/${serverId}`, { data: { connectFrom: 'auto' } });
    expect(set.ok()).toBe(true);
    // Bob, on a sign-in of his own with a device of his own.
    const bob = await pwRequest.newContext({ baseURL: BASE });
    try {
        expect((await bob.post('/api/auth/login', { data: USERS.bob })).status()).toBe(200);
        const bobKeys = { encKey: pair().pub, sigKey: pair().pub };
        const reg = await bob.post('/api/devices', {
            data: { name: 'bob-laptop', ...bobKeys, authPassword: USERS.bob.password },
        });
        expect(reg.status()).toBe(200);

        expect((await token(bob, { via: 'device' })).status()).toBe(404);
        sql(
            `INSERT INTO "ServerShare" (id, "serverId", "ownerId", "sharedWithId", permissions)
             VALUES ('device-share', '${serverId}', '${aliceId}', '${bobId}', 'connect')`,
        );
        // He can connect, but only through Termi: the login never leaves the server.
        const res = await json(await token(bob, { via: 'device' }));
        expect(res.status).toBe(200);
        expect(res.body?.data.via).toBe('gateway');
    } finally {
        sql(`DELETE FROM "ServerShare" WHERE id = 'device-share'`);
        await bob.delete('/api/devices');
        await bob.dispose();
    }
});

test('the shared gateway refuses a device token', async () => {
    const gw = await json(await token(alice, {}));
    const dev = await json(await token(alice, { via: 'device' }));
    const ws = new WebSocket(
        `${gw.body!.data.gatewayUrl}/connect?protocol=ssh&serverId=${serverId}`,
    );
    const reply = await new Promise<string>((resolve) => {
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: dev.body!.data.token }));
        ws.onmessage = (e) => {
            const m = JSON.parse(String(e.data));
            if (m.type === 'error') resolve(m.message);
        };
        ws.onclose = () => resolve('closed');
    });
    expect(reply).toBe('Invalid or expired token');
    ws.close();
});

test('the access check answers a device only about its own user', async ({ request }) => {
    const { aliceId, bobId } = state();
    const sid = sql(`SELECT "sessionId" FROM "Device" WHERE "keyId" = '${keyId}'`);
    const grants = [
        { key: 'mine', sid, userId: aliceId, kind: 'server', serverId },
        { key: 'theirs', sid: 'x', userId: bobId, kind: 'server', serverId: state().sshServerId },
    ];
    const res = await json(
        await request.post('/api/internal/access-check', {
            data: { grants },
            headers: { authorization: await deviceAuth('access-check') },
        }),
    );
    expect(res.status).toBe(200);
    const denied = res.body!.data.denied as { key: string }[];
    expect(denied.map((d) => d.key)).toEqual(['theirs']);

    // Wrong purpose, wrong key, or a key that merely claims the device's id: refused.
    const wrongPurpose = await request.post('/api/internal/access-check', {
        data: { grants },
        headers: { authorization: await deviceAuth('host-key') },
    });
    expect(wrongPurpose.status()).toBe(401);
    const forged = await request.post('/api/internal/access-check', {
        data: { grants },
        headers: { authorization: await deviceAuth('access-check', pair().priv) },
    });
    expect(forged.status()).toBe(401);
});

test('a reported host key only fills an empty pin on an owned server', async ({ request }) => {
    const report = async (data: Record<string, unknown>) =>
        request.post('/api/devices/host-key', {
            data: { jump: false, keyType: 'ssh-ed25519', ...data },
            headers: { authorization: await deviceAuth('host-key') },
        });
    const first = `SHA256:${'A'.repeat(43)}`;
    const second = `SHA256:${'B'.repeat(43)}`;
    sql(`UPDATE "Server" SET "hostKeyFingerprint" = NULL WHERE id = '${serverId}'`);

    expect((await json(await report({ serverId, fingerprint: first }))).body?.data.pinned).toBe(
        true,
    );
    expect((await json(await report({ serverId, fingerprint: second }))).body?.data.pinned).toBe(
        false,
    );
    expect(sql(`SELECT "hostKeyFingerprint" FROM "Server" WHERE id = '${serverId}'`)).toBe(first);

    // Bob's server: as if it didn't exist.
    const bobServer = sql(`SELECT id FROM "Server" WHERE "userId" = '${state().bobId}' LIMIT 1`);
    if (bobServer) {
        expect((await report({ serverId: bobServer, fingerprint: first })).status()).toBe(404);
    }
    // Unsigned: refused.
    const unsigned = await request.post('/api/devices/host-key', {
        data: { serverId, jump: false, keyType: 'ssh-ed25519', fingerprint: first },
    });
    expect(unsigned.status()).toBe(401);
});

test('removing the device ends everything it could do', async ({ request }) => {
    expect((await alice.delete('/api/devices')).ok()).toBe(true);
    const res = await request.post('/api/internal/access-check', {
        data: { grants: [] },
        headers: { authorization: await deviceAuth('access-check') },
    });
    expect(res.status()).toBe(401);
    expect((await json(await token(alice, { via: 'device' }))).body?.data.via).toBe('gateway');
});

test('signing out ends the device with the sign-in', async ({ request }) => {
    expect((await register({ authPassword: USERS.alice.password })).ok()).toBe(true);
    await alice.post('/api/auth/logout');
    const res = await request.post('/api/internal/access-check', {
        data: { grants: [] },
        headers: { authorization: await deviceAuth('access-check') },
    });
    expect(res.status()).toBe(401);
    // Sign back in for afterAll's clean-up.
    expect((await alice.post('/api/auth/login', { data: USERS.alice })).status()).toBe(200);
});
