import { expect, test } from '@playwright/test';
import { BASE, GATEWAY_PORT } from './env';
import { signInPage, state } from './helpers';

/**
 * A client must never be able to run its own guacd handshake: a forged
 * `select`/`connect` would let it point guacd at any host (e.g. the cloud
 * metadata address) with any parameters. The gateway drops browser frames
 * until it has sent its own handshake, and never forwards handshake opcodes.
 */
test('forged guacd handshake frames are ignored', async ({ page }) => {
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/login`);

    const firstFrames = await page.evaluate(
        async ({ serverId, gatewayPort }) => {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'vnc' }),
            });
            const { data } = await res.json();
            const enc = (...els: string[]) =>
                els.map((e) => `${new TextEncoder().encode(e).length}.${e}`).join(',') + ';';
            return await new Promise<string[]>((resolve) => {
                const ws = new WebSocket(
                    `ws://localhost:${gatewayPort}/connect?protocol=vnc&serverId=${serverId}`,
                );
                const seen: string[] = [];
                ws.onopen = () => {
                    ws.send(JSON.stringify({ type: 'auth', token: data.token }));
                    for (let i = 0; i < 20; i++) {
                        ws.send(
                            enc('select', 'rdp') +
                                enc(
                                    'connect',
                                    'VERSION_1_5_0',
                                    '169.254.169.254',
                                    '3389',
                                    'true',
                                    '/',
                                ),
                        );
                    }
                };
                ws.onmessage = (e) => seen.push(String(e.data).slice(0, 60));
                setTimeout(() => {
                    ws.close();
                    resolve(seen);
                }, 8000);
            });
        },
        { serverId: state().vncServerId, gatewayPort: GATEWAY_PORT },
    );

    // The session reached the real VNC desktop (Xvfb 1024x768), not RDP at the
    // metadata address.
    expect(firstFrames[0]).toContain('"connected"');
    expect(firstFrames.some((f) => f.includes('4.size') && f.includes('4.1024,3.768'))).toBe(true);
    expect(firstFrames.join(' ')).not.toContain('169.254.169.254');
});
