/**
 * Taking access away closes connections that are already open.
 *
 * A connection token is only checked when its WebSocket opens, so the gateway
 * asks the web app (POST /api/internal/access-check, every
 * GATEWAY_ACCESS_CHECK_SEC — 2 s in this suite) whether each open connection
 * may stay. Without that, a stolen sign-in kept its terminal after the owner
 * signed it out, and a person kept a shared server after the share was removed.
 */
import { randomUUID } from 'crypto';
import { expect, request as pwRequest, test, type APIRequestContext } from '@playwright/test';
import { BASE, SSH_PASSWORD, SSH_PORT, USERS } from './env';
import { signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

interface Terminal {
    /** Resolves with the message the connection ended with. */
    ended: Promise<string>;
    close(): void;
}

/** Open a terminal through the real gateway and wait for its shell. */
async function openTerminal(ctx: APIRequestContext, serverId: string): Promise<Terminal> {
    const tok = await (
        await ctx.post('/api/connection/token', { data: { serverId, protocol: 'ssh' } })
    ).json();
    if (!tok.success) throw new Error(`token: ${tok.error}`);
    const { token, gatewayUrl } = tok.data;
    const ws = new WebSocket(
        `${gatewayUrl}/connect?protocol=ssh&serverId=${serverId}&sessionId=${randomUUID()}`,
    );
    let resolveEnded!: (m: string) => void;
    const ended = new Promise<string>((r) => (resolveEnded = r));
    await new Promise<void>((ready, fail) => {
        const timer = setTimeout(() => fail(new Error('shell did not open')), 20_000);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
        ws.onmessage = (e) => {
            if (typeof e.data !== 'string') return;
            const msg = JSON.parse(e.data);
            if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
            if (msg.type === 'shell-ready') {
                clearTimeout(timer);
                ready();
            }
            if (['closed', 'error', 'disconnected'].includes(msg.type)) {
                resolveEnded(msg.message ?? msg.type);
            }
        };
        ws.onclose = () => resolveEnded('socket closed');
    });
    return {
        ended,
        close: () => {
            try {
                ws.send(JSON.stringify({ type: 'close-session' }));
                ws.close();
            } catch {
                /* already closed */
            }
        },
    };
}

/** Whether the terminal is still open after `ms`. */
const stillOpenAfter = (t: Terminal, ms: number) =>
    Promise.race([t.ended.then(() => false), new Promise((r) => setTimeout(() => r(true), ms))]);

test('the internal access check refuses anyone but the gateway', async ({ request }) => {
    const grants = { grants: [] };
    expect((await request.post('/api/internal/access-check', { data: grants })).status()).toBe(401);
    // A connection token (which a browser holds) is not a gateway service token.
    const alice = await signedIn('alice');
    const tok = await (
        await alice.post('/api/connection/token', {
            data: { serverId: state().sshServerId, protocol: 'ssh' },
        })
    ).json();
    const res = await request.post('/api/internal/access-check', {
        data: grants,
        headers: { authorization: `Bearer ${tok.data.token}` },
    });
    expect(res.status()).toBe(401);
});

test('signing a device out closes the terminals it opened', async () => {
    // A second sign-in for alice: the "stolen" one.
    const thief = await pwRequest.newContext({ baseURL: BASE });
    expect((await thief.post('/api/auth/login', { data: USERS.alice })).status()).toBe(200);
    const { aliceId, sshServerId } = state();
    const sid = sql(
        `select id from "Session" where "userId" = '${aliceId}' and not "isRevoked" order by "createdAt" desc limit 1`,
    );

    const stolen = await openTerminal(thief, sshServerId);
    const own = await openTerminal(await signedIn('alice'), sshServerId);
    try {
        // Alice signs the other device out from her own session.
        const alice = await signedIn('alice');
        expect((await alice.delete(`/api/auth/sessions/${sid}`)).status()).toBe(200);

        await expect(
            Promise.race([
                stolen.ended,
                new Promise((r) => setTimeout(() => r('still open'), 15_000)),
            ]),
        ).resolves.toMatch(/signed out/);
        // Her own terminal, from the sign-in she kept, stays.
        expect(await stillOpenAfter(own, 5_000)).toBe(true);
    } finally {
        stolen.close();
        own.close();
        await thief.dispose();
    }
});

test('removing a share closes the terminal it allowed', async () => {
    const { aliceId, bobId } = state();
    const alice = await signedIn('alice');
    const created = await (
        await alice.post('/api/servers', {
            data: {
                name: 'revoke-box',
                host: '127.0.0.1',
                port: SSH_PORT,
                protocol: 'SSH',
                username: 'root',
                password: SSH_PASSWORD,
            },
        })
    ).json();
    const serverId = created.data.server.id as string;
    const shareId = `share-revoke-${Date.now()}`;
    sql(
        `insert into "ServerShare" (id, "serverId", "ownerId", "sharedWithId", permissions) values ('${shareId}', '${serverId}', '${aliceId}', '${bobId}', 'connect')`,
    );

    const bobs = await openTerminal(await signedIn('bob'), serverId);
    try {
        expect(await stillOpenAfter(bobs, 5_000)).toBe(true); // checks pass while shared
        expect((await alice.delete(`/api/servers/${serverId}/shares/${shareId}`)).status()).toBe(
            200,
        );
        await expect(
            Promise.race([
                bobs.ended,
                new Promise((r) => setTimeout(() => r('still open'), 15_000)),
            ]),
        ).resolves.toMatch(/access to this server was removed/);
    } finally {
        bobs.close();
        await alice.delete(`/api/servers/${serverId}`);
    }
});
