import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { createServer, type Server } from 'http';
import { createRequire } from 'module';
import net from 'net';
import path from 'path';
import { expect, test } from '@playwright/test';
import { BASE } from './env';
import { signInPage, signedIn, state } from './helpers';

// The desktop app's runtime, exactly as the bridge script embeds it.
const { runTunnel } = createRequire(__filename)(
    path.resolve(__dirname, '../../../electron/tunnel-mux.js'),
) as {
    runTunnel: (opts: Record<string, unknown>) => { close(): void };
};

test.describe.configure({ mode: 'serial' });

/** The fixture's web app, as seen from inside the SSH container. */
const APP_PORT = 8000;

async function token(body: Record<string, unknown>) {
    const alice = await signedIn('alice');
    const res = await alice.post('/api/connection/token', {
        data: { protocol: 'tunnel', serverId: state().sshServerId, ...body },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data as { token: string; gatewayUrl: string };
}

async function open(
    mode: 'local' | 'dynamic' | 'remote',
    body: Record<string, unknown>,
    extra: Record<string, unknown> = {},
) {
    const t = await token({ mode, ...body });
    const closes: string[] = [];
    let tunnel!: { close(): void };
    const info = await new Promise<{ localPort?: number; bindPort?: number }>((resolve, reject) => {
        tunnel = runTunnel({
            wsUrl: `${t.gatewayUrl}/connect?protocol=tunnel&serverId=${state().sshServerId}&mux=1`,
            token: t.token,
            mode,
            listenPort: 0,
            ...extra,
            onReady: resolve,
            onClose: (r: string) => {
                closes.push(r);
                reject(new Error(r));
            },
        });
    });
    return { info, tunnel, closes };
}

/** Minimal SOCKS5 CONNECT by domain name, then an HTTP GET. */
function socksGet(proxyPort: number, host: string, port: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const sock = net.connect(proxyPort, '127.0.0.1');
        let stage = 0;
        let out = Buffer.alloc(0);
        sock.on('connect', () => sock.write(Buffer.from([5, 1, 0])));
        sock.on('data', (d) => {
            if (stage === 0) {
                expect([...d]).toEqual([5, 0]);
                const name = Buffer.from(host);
                const req = Buffer.concat([
                    Buffer.from([5, 1, 0, 3, name.length]),
                    name,
                    Buffer.from([port >> 8, port & 255]),
                ]);
                sock.write(req);
                stage = 1;
            } else if (stage === 1) {
                if (d[1] !== 0) return reject(new Error(`SOCKS reply ${d[1]}`));
                stage = 2;
                sock.write(`GET / HTTP/1.0\r\nHost: ${host}\r\n\r\n`);
            } else {
                out = Buffer.concat([out, d as Buffer]);
            }
        });
        sock.on('end', () => resolve(out.toString()));
        sock.on('error', reject);
    });
}

test('local forwarding: one tunnel serves many connections', async () => {
    const { info, tunnel } = await open('local', { remoteHost: '127.0.0.1', remotePort: APP_PORT });
    try {
        const results = await Promise.all(
            Array.from({ length: 20 }, () =>
                fetch(`http://127.0.0.1:${info.localPort}/`).then((r) => r.status),
            ),
        );
        expect(results.every((s) => s === 200)).toBe(true);
    } finally {
        tunnel.close();
    }
});

test('dynamic forwarding: a SOCKS5 proxy reaches hosts named per request', async () => {
    const { info, tunnel } = await open('dynamic', {});
    try {
        const res = await socksGet(info.localPort!, 'localhost', APP_PORT);
        expect(res).toMatch(/^HTTP\/1\.[01] 200/);
        // A port nothing listens on is reported as refused, not hung.
        await expect(socksGet(info.localPort!, 'localhost', 1)).rejects.toThrow(/SOCKS reply/);
    } finally {
        tunnel.close();
    }
});

test('remote forwarding: the server reaches a service on this machine (16 MB, both ways)', async () => {
    const body = randomBytes(16 * 1024 * 1024);
    const digest = createHash('sha256').update(body).digest('hex');
    const local: Server = createServer((req, res) => {
        res.writeHead(200, { 'content-length': body.length });
        res.end(body);
    });
    await new Promise<void>((r) => local.listen(0, '127.0.0.1', r));
    const localPort = (local.address() as net.AddressInfo).port;

    const remote = await open(
        'remote',
        { bindAddress: '127.0.0.1', bindPort: 9100 },
        { target: { host: '127.0.0.1', port: localPort } },
    );
    expect(remote.info.bindPort).toBe(9100);

    // Reach the server's 127.0.0.1:9100 from here through a local forward:
    // the bytes go here → server → (remote forward) → here.
    const back = await open('local', { remoteHost: '127.0.0.1', remotePort: 9100 });
    try {
        const res = await fetch(`http://127.0.0.1:${back.info.localPort}/`);
        const got = Buffer.from(await res.arrayBuffer());
        expect(got.length).toBe(body.length);
        expect(createHash('sha256').update(got).digest('hex')).toBe(digest);
    } finally {
        back.tunnel.close();
        remote.tunnel.close();
        local.close();
    }
});

test('an older client cannot open a SOCKS or remote tunnel without the new protocol', async () => {
    const t = await token({ mode: 'dynamic' });
    const msg = await new Promise<string>((resolve) => {
        const ws = new WebSocket(
            `${t.gatewayUrl}/connect?protocol=tunnel&serverId=${state().sshServerId}`,
        );
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: t.token }));
        ws.onmessage = (e) => resolve(String(e.data));
    });
    expect(msg).toContain('needs a newer Termi app');
});

test('forwarding requests are validated', async () => {
    const alice = await signedIn('alice');
    const post = (data: Record<string, unknown>) =>
        alice.post('/api/connection/token', {
            data: { protocol: 'tunnel', serverId: state().sshServerId, ...data },
        });
    expect((await post({ mode: 'local' })).status()).toBe(400);
    expect((await post({ mode: 'remote' })).status()).toBe(400);
    expect((await post({ mode: 'remote', bindPort: 9000, bindAddress: '10.0.0.1' })).status()).toBe(
        400,
    );
});

test('the downloadable bridge script runs a SOCKS proxy on its own', async () => {
    const alice = await signedIn('alice');
    const res = await alice.post('/api/tunnels', {
        data: { serverId: state().sshServerId, mode: 'dynamic' },
    });
    const { bridgeScript } = (await res.json()).data;
    const file = `${mkdtempSync(path.join(tmpdir(), 'termi-bridge-'))}/termi-tunnel.mjs`;
    writeFileSync(file, bridgeScript);

    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
        const port = await new Promise<number>((resolve, reject) => {
            let out = '';
            child.stdout.on('data', (d) => {
                out += d;
                const m = out.match(/SOCKS5 proxy on 127\.0\.0\.1:(\d+)/);
                if (m) resolve(Number(m[1]));
            });
            child.stderr.on('data', (d) => reject(new Error(String(d))));
            child.on('exit', (code) => reject(new Error(`bridge exited ${code}: ${out}`)));
        });
        expect(await socksGet(port, 'localhost', APP_PORT)).toMatch(/^HTTP\/1\.[01] 200/);
    } finally {
        child.kill('SIGINT');
    }
});

test('the server page offers local, SOCKS and remote forwarding', async ({ page }) => {
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/servers/${state().sshServerId}`);
    const section = page
        .locator('div', { has: page.getByRole('heading', { name: 'Port forwarding' }) })
        .last();
    await section.getByRole('radio', { name: 'SOCKS proxy' }).click();
    await section.getByRole('button', { name: 'Start proxy' }).click();
    await expect(section.getByText(/start a SOCKS5 proxy/)).toBeVisible();
    await expect(section.locator('pre')).toContainText('runTunnel');

    await section.getByRole('radio', { name: 'Remote' }).click();
    await section.getByLabel('Server port').fill('9200');
    await section.getByLabel('Port on this computer').fill('3000');
    await section.getByRole('button', { name: 'Open forward' }).click();
    await expect(section.getByText(/so the server can reach 127\.0\.0\.1:3000/)).toBeVisible();
    await expect(section.getByText('server :9200 → 127.0.0.1:3000')).toBeVisible();
    await expect(section.getByText('SOCKS proxy', { exact: true }).last()).toBeVisible();
});
