import { randomUUID } from 'crypto';
import { expect, test, request as pwRequest, type Page } from '@playwright/test';
import { BASE, USERS } from './env';
import { sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

/** A brand-new session (locking the suite's shared ones would break other tests). */
async function freshSession(page: Page, user: 'alice' | 'bob') {
    const ctx = await pwRequest.newContext({ baseURL: BASE });
    const res = await ctx.post('/api/auth/login', { data: USERS[user] });
    expect(res.status()).toBe(200);
    const { cookies } = await ctx.storageState();
    await page.context().addCookies(cookies);
    return ctx;
}

const overlay = (page: Page) => page.getByRole('dialog', { name: 'Termi is locked' });

test('locking is enforced by the server and survives a reload', async ({ page }) => {
    const api = await freshSession(page, 'bob');
    await page.goto(`${BASE}/panel/settings?section=security`);
    await page
        .getByRole('button', { name: /^Security/ })
        .first()
        .click();
    await page.getByRole('button', { name: 'Lock now' }).click();
    await expect(overlay(page)).toBeVisible();

    // Not just a screen: the session can't use the API…
    expect((await api.get('/api/servers')).status()).toBe(401);
    expect((await api.get('/api/auth/me')).status()).toBe(423);
    // …and reloading doesn't help.
    await page.reload();
    await expect(overlay(page)).toBeVisible();

    await overlay(page).getByLabel('Password').fill('wrong-password');
    await overlay(page).getByRole('button', { name: 'Unlock' }).click();
    await expect(overlay(page)).toContainText('That did not match');
    await overlay(page).getByLabel('Password').fill(USERS.bob.password);
    await overlay(page).getByRole('button', { name: 'Unlock' }).click();
    await expect(overlay(page)).toHaveCount(0);
    expect((await api.get('/api/servers')).status()).toBe(200);
});

test('five wrong answers on the lock screen sign the session out', async () => {
    const api = await pwRequest.newContext({ baseURL: BASE });
    await api.post('/api/auth/login', { data: USERS.bob });
    await api.post('/api/auth/lock');
    for (let i = 0; i < 4; i++) {
        expect(
            (await api.post('/api/auth/unlock', { data: { authPassword: 'nope' } })).status(),
        ).toBe(401);
    }
    const last = await api.post('/api/auth/unlock', { data: { authPassword: 'nope' } });
    expect((await last.json()).error).toMatch(/signed out/);
    // Gone for good, even with the right password now.
    expect(
        (
            await api.post('/api/auth/unlock', { data: { authPassword: USERS.bob.password } })
        ).status(),
    ).toBe(401);
    expect((await api.get('/api/auth/me')).status()).toBe(401);
});

test('idle time locks the app, and terminals disconnect until unlocked', async ({ page }) => {
    const api = await freshSession(page, 'alice');
    await api.patch('/api/account/lock', { data: { lockAfterMinutes: 1 } });
    sql(`delete from "PersistentSession" where "userId"='${state().aliceId}'`);
    await api.post('/api/sessions', {
        data: { sessionId: randomUUID(), serverId: state().sshServerId, serverName: 'ssh-box' },
    });
    await page.setViewportSize({ width: 1300, height: 850 });
    await page.goto(`${BASE}/panel/sessions`);
    const screen = page
        .locator('[data-pane]')
        .filter({ visible: true })
        .first()
        .locator('.xterm-rows');
    await expect(screen).toContainText('#', { timeout: 20_000 });

    // Pretend the last activity was an hour ago; the idle check runs every 10 s.
    await page.evaluate(() =>
        localStorage.setItem('termi-last-activity', String(Date.now() - 3_600_000)),
    );
    await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
    await expect(screen).toContainText('Termi is locked.');

    await overlay(page).getByLabel('Password').fill(USERS.alice.password);
    await overlay(page).getByRole('button', { name: 'Unlock' }).click();
    await expect(overlay(page)).toHaveCount(0);
    // The terminal reattaches to the still-running session and works.
    await page
        .locator('[data-pane]')
        .filter({ visible: true })
        .first()
        .locator('.xterm-screen')
        .click();
    await page.keyboard.type('echo BACK-$((40+2))\n');
    await expect(screen).toContainText('BACK-42', { timeout: 20_000 });
    await api.patch('/api/account/lock', { data: { lockAfterMinutes: null } });
});
