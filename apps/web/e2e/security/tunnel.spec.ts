import { expect, test } from '@playwright/test';
import { BASE, WEB_PORT } from './env';
import { signInPage, state } from './helpers';

const signIn = (page: import('@playwright/test').Page) => signInPage(page, 'alice');

const tunnelPath = () => `/tunnel/${state().sshServerId}/8000`;

test.describe('port-forward tunnels', () => {
    test('a tunnel opens on its own origin, isolated from Termi', async ({ page }) => {
        await signIn(page);
        const headers: Record<string, Record<string, string>> = {};
        page.on('response', (r) => {
            if (r.url().includes('/tunnel/'))
                headers[new URL(r.url()).pathname.split('/').pop() || 'index'] = r.headers();
        });

        await page.goto(`${BASE}${tunnelPath()}`);
        await page.waitForFunction(() => document.title === 'done');
        const url = new URL(page.url());
        // Moved to http://<16 hex>.localhost:<port>/tunnel/.../_tt_<token>
        expect(url.hostname).toMatch(/^[0-9a-f]{16}\.localhost$/);
        expect(url.port).toBe(String(WEB_PORT));
        expect(url.pathname).toContain('/_tt_');

        const result = JSON.parse((await page.locator('#out').textContent()) || '{}');
        // The app works normally on its own origin, cookies and storage included…
        expect(result.data).toBe('200:{"ok":true}');
        expect(result.postJson).toBe('200');
        expect(result.localStorage).toBe('ok');
        expect(result.cookie).toBe('ok');
        // …but that origin serves nothing of Termi's.
        expect(result.apiServers).toBe('404');
        expect(result.apiToken).toBe('404');
        expect(result.origin).toBe(url.origin);
    });

    test('a tunnel origin serves only its own tunnel', async ({ page, request }) => {
        await signIn(page);
        await page.goto(`${BASE}${tunnelPath()}`);
        await page.waitForFunction(() => document.title === 'done');
        const url = new URL(page.url());

        // Termi pages and APIs don't exist on a tunnel origin.
        expect((await request.get(`${url.origin}/login`)).status()).toBe(404);
        expect((await request.get(`${url.origin}/api/servers`)).status()).toBe(404);
        // A valid token presented on another tunnel's origin is refused.
        const otherOrigin = `http://0123456789abcdef.localhost:${WEB_PORT}`;
        expect(
            (await request.get(`${otherOrigin}${url.pathname}`, { maxRedirects: 0 })).status(),
        ).toBe(404);
    });

    test("on Termi's own origin a tunneled page is sandboxed", async ({ page }) => {
        await signIn(page);
        await page.goto(`${BASE}${tunnelPath()}`);
        await page.waitForFunction(() => document.title === 'done');
        // Present the same token on Termi's origin: served, but sandboxed.
        const sameToken = `${BASE}${new URL(page.url()).pathname}`;
        const responses: Record<string, string>[] = [];
        page.on('response', (r) => {
            if (r.url().startsWith(`${BASE}/tunnel/`)) responses.push(r.headers());
        });
        await page.goto(sameToken);
        await page.waitForFunction(() => document.title === 'done');
        const result = JSON.parse((await page.locator('#out').textContent()) || '{}');

        expect(result.origin).toBe('null');
        expect(result.data).toBe('200:{"ok":true}');
        expect(result.postJson).toBe('200');
        for (const attempt of ['apiServers', 'apiToken', 'localStorage', 'serviceWorker']) {
            expect(result[attempt], attempt).toBe('blocked');
        }
        const doc = responses[0];
        expect(doc['content-security-policy']).toContain('sandbox');
        expect(doc['content-security-policy']).not.toContain('allow-same-origin');
        expect(doc['service-worker-allowed']).toBeUndefined();
        expect(doc['clear-site-data']).toBeUndefined();
        expect(doc['access-control-allow-origin']).not.toBe('*');
    });

    test('tunnel tokens cannot be forged, reused for another port, or skipped', async ({
        page,
        playwright,
    }) => {
        await signIn(page);
        await page.goto(`${BASE}${tunnelPath()}`);
        await page.waitForFunction(() => document.title === 'done');
        const token = new URL(page.url()).pathname.match(/_tt_[^/]+/)![0];
        const anon = await playwright.request.newContext();
        const { sshServerId } = state();

        expect(
            (
                await anon.get(`${BASE}/tunnel/${sshServerId}/22/${token}`, { maxRedirects: 0 })
            ).status(),
        ).toBe(401);
        expect(
            (
                await anon.get(`${BASE}/tunnel/${sshServerId}/8000/_tt_forged.token`, {
                    maxRedirects: 0,
                })
            ).status(),
        ).toBe(401);
        expect(
            (await anon.get(`${BASE}/tunnel/${sshServerId}/8000`, { maxRedirects: 0 })).status(),
        ).toBe(401);
    });
});
