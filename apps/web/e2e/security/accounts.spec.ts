import { expect, test, request as pwRequest } from '@playwright/test';
import { BASE, USERS } from './env';
import { forgetSession, json, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

test('keychain secrets need step-up and stay on the server', async () => {
    const alice = await signedIn('alice');
    const created = await json(
        await alice.post('/api/keychain', {
            data: { label: 'prod', username: 'deploy', password: 'kc-s3cret' },
        }),
    );
    expect(created.status).toBe(201);
    const id = created.body!.data.entry.id;

    // Plain read: metadata only.
    const meta = await alice.get(`/api/keychain/${id}`);
    expect(await meta.text()).not.toContain('kc-s3cret');

    // Reveal: refused without proof or with a wrong password, allowed with it,
    // then remembered for a few minutes.
    expect((await alice.post(`/api/keychain/${id}/reveal`, { data: {} })).status()).toBe(401);
    expect(
        (
            await alice.post(`/api/keychain/${id}/reveal`, { data: { authPassword: 'nope' } })
        ).status(),
    ).toBe(401);
    const revealed = await json(
        await alice.post(`/api/keychain/${id}/reveal`, {
            data: { authPassword: USERS.alice.password },
        }),
    );
    expect(revealed.body!.data.entry.password).toBe('kc-s3cret');
    expect((await alice.post(`/api/keychain/${id}/reveal`, { data: {} })).status()).toBe(200);
    expect(
        Number(sql(`select count(*) from "AuditLog" where action='KEYCHAIN_REVEALED'`)),
    ).toBeGreaterThanOrEqual(2);

    // A server created from the keychain gets the secret server-side.
    const server = await json(
        await alice.post('/api/servers', {
            data: {
                name: 'from-keychain',
                host: '127.0.0.1',
                port: 22,
                protocol: 'SSH',
                username: 'deploy',
                notes: 'hi',
                keychainId: id,
            },
        }),
    );
    expect(server.status).toBe(201);
    const sid = server.body!.data.server.id;
    const pw = await json(
        await alice.post(`/api/servers/${sid}/reveal`, {
            data: { field: 'password', authPassword: USERS.alice.password },
        }),
    );
    expect(pw.body!.data.value).toBe('kc-s3cret');

    // Someone else's keychain entry can't be used.
    const bob = await signedIn('bob');
    expect(
        (
            await bob.post('/api/servers', {
                data: {
                    name: 'x',
                    host: '127.0.0.1',
                    port: 22,
                    protocol: 'SSH',
                    username: 'u',
                    keychainId: id,
                },
            })
        ).status(),
    ).toBe(404);
});

test('encrypted values are bound to their field and owner', async () => {
    const alice = await signedIn('alice');
    const created = await json(
        await alice.post('/api/servers', {
            data: {
                name: 'bound',
                host: '127.0.0.1',
                port: 22,
                protocol: 'SSH',
                username: 'root',
                password: 'bound-pw',
                notes: 'n',
            },
        }),
    );
    const sid = created.body!.data.server.id;
    expect(
        sql(
            `select password like 'v2:%' and host like 'v2:%' and notes like 'v2:%' from "Server" where id='${sid}'`,
        ),
    ).toBe('t');

    // A database writer moves the password ciphertext into notes: it no longer decrypts.
    sql(`update "Server" set notes = password where id='${sid}'`);
    const leaked = await alice.get(`/api/servers/${sid}`);
    expect(await leaked.text()).not.toContain('bound-pw');
    expect(leaked.status()).not.toBe(200);
    sql(`update "Server" set notes = null where id='${sid}'`);

    // …or into another user's server.
    const { bobId } = state();
    const bob = await signedIn('bob');
    const bobServer = await json(
        await bob.post('/api/servers', {
            data: {
                name: 'b',
                host: '127.0.0.1',
                port: 22,
                protocol: 'SSH',
                username: 'b',
                password: 'x',
            },
        }),
    );
    const bsid = bobServer.body!.data.server.id;
    sql(
        `update "Server" set password = (select password from "Server" where id='${sid}') where id='${bsid}' and "userId"='${bobId}'`,
    );
    const stolen = await bob.post(`/api/servers/${bsid}/reveal`, {
        data: { field: 'password', authPassword: USERS.bob.password },
    });
    expect(await stolen.text()).not.toContain('bound-pw');
});

test('registration and verification do not reveal which emails have accounts', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE });
    const dup = await json(
        await anon.post('/api/auth/register', {
            data: { email: USERS.alice.email, password: 'Abcdefg123', name: 'x' },
        }),
    );
    const fresh = await json(
        await anon.post('/api/auth/register', {
            data: { email: 'new@sec-e2e.local', password: 'Abcdefg123', name: 'x' },
        }),
    );
    expect(dup.status).toBe(fresh.status);
    expect(dup.body!.data.message).toBe(fresh.body!.data.message);
    expect(dup.body!.data.userId).toHaveLength(fresh.body!.data.userId.length);

    const decoy = await json(
        await anon.post('/api/auth/verify-signup', {
            data: { userId: dup.body!.data.userId, code: '123456' },
        }),
    );
    const real = await json(
        await anon.post('/api/auth/verify-signup', {
            data: { userId: fresh.body!.data.userId, code: '123456' },
        }),
    );
    expect(decoy).toEqual(real);
});

test('cloud metadata addresses are refused even with private networks allowed', async () => {
    const alice = await signedIn('alice');
    for (const host of ['169.254.169.254', 'metadata.google.internal']) {
        const res = await alice.post('/api/servers', {
            data: { name: 'meta', host, port: 22, protocol: 'SSH', username: 'u', password: 'p' },
        });
        expect(res.status(), host).toBe(400);
    }
});

test("the activity log shows only the user's own events", async () => {
    const alice = await signedIn('alice');
    const { bobId } = state();
    const res = await json(await alice.get('/api/account/activity'));
    expect(res.status).toBe(200);
    const entries = res.body!.data.entries as {
        action: string;
        details: Record<string, unknown>;
    }[];
    expect(entries.length).toBeGreaterThan(0);
    const ids = sql(`select string_agg(id, ',') from "AuditLog" where "userId"='${bobId}'`).split(
        ',',
    );
    for (const e of entries as unknown as { id: string }[]) expect(ids).not.toContain(e.id);
    for (const e of entries) {
        for (const k of Object.keys(e.details)) {
            expect([
                'method',
                'field',
                'format',
                'success',
                'reason',
                'name',
                'passkeyName',
            ]).toContain(k);
        }
    }
});

test('"passkey only" needs a passkey and then refuses password sign-in', async () => {
    const bob = await signedIn('bob');
    // No passkey yet: can't be turned on.
    const refused = await bob.post('/api/auth/password-login', {
        data: { disabled: true, authPassword: USERS.bob.password },
    });
    expect(refused.status()).toBe(400);

    // With the flag set (as if a passkey existed), password sign-in is refused.
    const { bobId } = state();
    sql(`update "User" set "passwordLoginDisabled" = true where id='${bobId}'`);
    const anon = await pwRequest.newContext({ baseURL: BASE });
    const login = await json(await anon.post('/api/auth/login', { data: USERS.bob }));
    expect(login.status).toBe(401);
    expect(login.body!.error).toMatch(/passkey/i);
    sql(`update "User" set "passwordLoginDisabled" = false where id='${bobId}'`);
});

test('changing the password works for a user who has servers', async () => {
    const bob = await signedIn('bob');
    const next = `${USERS.bob.password}X9`;
    expect(
        (
            await bob.post('/api/auth/password', {
                data: { currentPassword: USERS.bob.password, newPassword: next },
            })
        ).status(),
    ).toBe(200);
    const anon = await pwRequest.newContext({ baseURL: BASE });
    expect(
        (
            await anon.post('/api/auth/login', { data: { email: USERS.bob.email, password: next } })
        ).status(),
    ).toBe(200);
    expect(
        Number(sql(`select count(*) from "Server" where "userId"='${state().bobId}'`)),
    ).toBeGreaterThan(0);

    // Put the password back for later tests; the change signed out the old session.
    expect(
        (
            await anon.post('/api/auth/password', {
                data: { currentPassword: next, newPassword: USERS.bob.password },
            })
        ).status(),
    ).toBe(200);
    forgetSession('bob');
});
