/**
 * Active connections: the gateway reports what is open (POST
 * /api/internal/connections, every GATEWAY_REPORT_SEC — 2 s in this suite),
 * the owner sees it, including shells whose tab is gone, and can close it.
 *
 * Protections checked here: only a gateway may report (purpose-bound service
 * token, not a browser's connection token), people only see and close their
 * own connections, and a close actually ends the shell on the gateway.
 */
import { randomUUID } from 'crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { signedIn, state } from './helpers';

test.describe.configure({ mode: 'serial' });

interface Live {
    id: string;
    kind: string;
    protocol: string;
    sessionId: string | null;
    attached: boolean;
    closing: boolean;
    origin: { current: boolean };
}

/** Open a terminal through the real gateway; resolves once the shell is up. */
async function openTerminal(ctx: APIRequestContext, serverId: string) {
    const tok = await (
        await ctx.post('/api/connection/token', { data: { serverId, protocol: 'ssh' } })
    ).json();
    if (!tok.success) throw new Error(`token: ${tok.error}`);
    const sessionId = randomUUID();
    const ws = new WebSocket(
        `${tok.data.gatewayUrl}/connect?protocol=ssh&serverId=${serverId}&sessionId=${sessionId}`,
    );
    let resolveEnded!: (m: string) => void;
    const ended = new Promise<string>((r) => (resolveEnded = r));
    await new Promise<void>((ready, fail) => {
        const timer = setTimeout(() => fail(new Error('shell did not open')), 20_000);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: tok.data.token }));
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
    return { sessionId, ws, ended };
}

async function list(ctx: APIRequestContext): Promise<Live[]> {
    const res = await (await ctx.get('/api/connections')).json();
    expect(res.success).toBe(true);
    return res.data.connections;
}

/** Polls until `pick` finds something in the user's list. */
async function waitFor(ctx: APIRequestContext, pick: (l: Live[]) => Live | undefined) {
    let found: Live | undefined;
    await expect
        .poll(async () => (found = pick(await list(ctx))), { timeout: 15_000 })
        .toBeTruthy();
    return found!;
}

test('only the gateway may report connections', async ({ request }) => {
    const body = { gatewayId: 'forged', intervalSec: 2, connections: [] };
    expect((await request.post('/api/internal/connections', { data: body })).status()).toBe(401);

    // A connection token, which every browser holds, is not a service token.
    const alice = await signedIn('alice');
    const tok = await (
        await alice.post('/api/connection/token', {
            data: { serverId: state().sshServerId, protocol: 'ssh' },
        })
    ).json();
    const res = await request.post('/api/internal/connections', {
        data: body,
        headers: { authorization: `Bearer ${tok.data.token}` },
    });
    expect(res.status()).toBe(401);
});

test('a shell whose tab is gone is listed, and closing it ends it', async () => {
    const alice = await signedIn('alice');
    const bob = await signedIn('bob');
    const { sshServerId } = state();

    const term = await openTerminal(alice, sshServerId);
    const row = await waitFor(alice, (l) => l.find((c) => c.sessionId === term.sessionId));
    expect(row).toMatchObject({ kind: 'session', protocol: 'ssh', attached: true });
    expect(row.origin.current).toBe(true);

    // Bob sees none of it, and can't close it.
    expect((await list(bob)).some((c) => c.id === row.id)).toBe(false);
    const bobClose = await (
        await bob.post('/api/connections/close', { data: { ids: [row.id] } })
    ).json();
    expect(bobClose.data.closing).toEqual([]);

    // The tab goes away without closing the shell: it runs in the background.
    term.ws.close();
    await waitFor(alice, (l) => l.find((c) => c.sessionId === term.sessionId && !c.attached));

    // Reattach, then close it from the list: the tab is told why.
    // Token first: the socket must have its handlers before it can open.
    const tok = await (
        await alice.post('/api/connection/token', {
            data: { serverId: sshServerId, protocol: 'ssh' },
        })
    ).json();
    const again = new WebSocket(term.ws.url + '&resume=1');
    const message = new Promise<string>((resolve) => {
        again.onopen = () => again.send(JSON.stringify({ type: 'auth', token: tok.data.token }));
        again.onmessage = (e) => {
            if (typeof e.data !== 'string') return;
            const msg = JSON.parse(e.data);
            if (msg.type === 'ping') again.send(JSON.stringify({ type: 'pong' }));
            if (msg.type === 'closed') resolve(msg.message);
        };
    });
    await waitFor(alice, (l) => l.find((c) => c.sessionId === term.sessionId && c.attached));

    const res = await (
        await alice.post('/api/connections/close', { data: { ids: [row.id] } })
    ).json();
    expect(res.data.closing).toEqual([row.id]);
    expect(await message).toMatch(/closed this connection/i);

    // And it drops off the list.
    await expect
        .poll(async () => (await list(alice)).some((c) => c.id === row.id), { timeout: 15_000 })
        .toBe(false);
});
