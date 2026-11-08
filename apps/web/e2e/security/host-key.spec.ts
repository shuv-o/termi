import { expect, test, type Page } from '@playwright/test';
import { BASE, GATEWAY_PORT, USERS } from './env';
import { json, signInPage, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const OTHER = 'SHA256:' + 'A'.repeat(43);

/** Open an SSH session through the real gateway; returns the first control messages. */
async function openSSH(
    page: Page,
    serverId: string,
): Promise<{ type: string; code?: string; message?: string }[]> {
    return page.evaluate(
        async ({ serverId, gatewayPort }) => {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'ssh' }),
            });
            const body = await res.json();
            if (!body.success) return [{ type: 'token-error', message: body.error }];
            return await new Promise((resolve) => {
                const ws = new WebSocket(
                    `ws://localhost:${gatewayPort}/connect?protocol=ssh&serverId=${serverId}&sessionId=${crypto.randomUUID()}`,
                );
                const seen: { type: string }[] = [];
                const finish = () => {
                    ws.close();
                    resolve(seen);
                };
                ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: body.data.token }));
                ws.onmessage = (e) => {
                    if (typeof e.data !== 'string') return;
                    const msg = JSON.parse(e.data);
                    seen.push(msg);
                    if (msg.type === 'shell-ready' || msg.type === 'error') finish();
                };
                setTimeout(finish, 10_000);
            });
        },
        { serverId, gatewayPort: GATEWAY_PORT },
    );
}

test('SSH host keys are pinned on first use and a changed key is refused everywhere', async ({
    page,
}) => {
    const { sshServerId: id } = state();
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/login`);

    // First connection pins the key and works.
    sql(`update "Server" set "hostKeyFingerprint" = null where id='${id}'`);
    expect((await openSSH(page, id)).map((m) => m.type)).toContain('shell-ready');
    const pinned = sql(`select "hostKeyFingerprint" from "Server" where id='${id}'`);
    expect(pinned).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(sql(`select "hostKeyType" from "Server" where id='${id}'`)).toBe('ssh-ed25519');

    // The server now "presents a different key" (simulated by changing the pin).
    sql(`update "Server" set "hostKeyFingerprint" = '${OTHER}' where id='${id}'`);

    // Gateway: the terminal is refused, with a reason the UI can act on.
    const refused = await openSSH(page, id);
    const err = refused.find((m) => m.type === 'error');
    expect(err?.code).toBe('HOST_KEY_MISMATCH');
    expect(err?.message).toContain(`expected ${OTHER}, got ${pinned}`);
    expect(refused.map((m) => m.type)).not.toContain('shell-ready');

    // Web app's own SSH (file browser) is refused too, and the refusal is logged.
    const alice = await signedIn('alice');
    const files = await alice.get(`/api/servers/${id}/sftp/list?path=/`);
    expect(files.status()).not.toBe(200);
    expect(
        Number(
            sql(
                `select count(*) from "AuditLog" where action='SERVER_HOST_KEY_MISMATCH' and resource='server:${id}'`,
            ),
        ),
    ).toBeGreaterThanOrEqual(1);

    // The owner compares and trusts the real key.
    const check = await json(await alice.get(`/api/servers/${id}/host-key?check=1`));
    expect(check.body!.data.matches).toBe(false);
    expect(check.body!.data.presented.fingerprint).toBe(pinned);

    // Only the key the server actually presents can be trusted…
    expect(
        (
            await alice.post(`/api/servers/${id}/host-key`, {
                data: {
                    fingerprint: 'SHA256:' + 'B'.repeat(43),
                    authPassword: USERS.alice.password,
                },
            })
        ).status(),
    ).toBe(409);
    expect(sql(`select "hostKeyFingerprint" from "Server" where id='${id}'`)).toBe(OTHER);

    const trusted = await alice.post(`/api/servers/${id}/host-key`, {
        data: { fingerprint: pinned, authPassword: USERS.alice.password },
    });
    expect(trusted.status()).toBe(200);
    expect(sql(`select "hostKeyFingerprint" from "Server" where id='${id}'`)).toBe(pinned);
    expect((await openSSH(page, id)).map((m) => m.type)).toContain('shell-ready');

    // Someone else can't look at or change the pin.
    const bob = await signedIn('bob');
    expect((await bob.get(`/api/servers/${id}/host-key`)).status()).toBe(404);
    expect(
        (
            await bob.post(`/api/servers/${id}/host-key`, {
                data: { fingerprint: pinned, authPassword: USERS.bob.password },
            })
        ).status(),
    ).toBe(404);
});

test('trusting a new host key needs a step-up proof', async ({ playwright }) => {
    const { sshServerId: id } = state();
    // A fresh session: no recent step-up to ride on.
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const login = await ctx.post('/api/auth/login', { data: USERS.alice });
    test.skip(login.status() === 429, 'login rate limit reached in this run');
    const pinned = sql(`select "hostKeyFingerprint" from "Server" where id='${id}'`);
    const res = await json(
        await ctx.post(`/api/servers/${id}/host-key`, { data: { fingerprint: pinned } }),
    );
    expect(res.status).toBe(401);
    expect(res.body!.error).toBe('Re-authentication required');
});

test('changing the host or port drops the pin', async () => {
    const { sshServerId: id } = state();
    const alice = await signedIn('alice');
    const port = Number(sql(`select port from "Server" where id='${id}'`));
    expect(sql(`select "hostKeyFingerprint" is not null from "Server" where id='${id}'`)).toBe('t');
    expect((await alice.patch(`/api/servers/${id}`, { data: { port: port + 1 } })).status()).toBe(
        200,
    );
    expect(sql(`select "hostKeyFingerprint" is null from "Server" where id='${id}'`)).toBe('t');
    expect((await alice.patch(`/api/servers/${id}`, { data: { port } })).status()).toBe(200);
});
