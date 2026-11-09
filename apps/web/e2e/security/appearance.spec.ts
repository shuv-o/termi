import { randomUUID } from 'crypto';
import { expect, test, request as pwRequest, type Page } from '@playwright/test';
import { BASE, SSH_PASSWORD, SSH_PORT } from './env';
import { signInPage, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const html = (page: Page, attr: string) =>
    page.evaluate((a) => document.documentElement.getAttribute(a), attr);

/** Carol's saved choices as the server holds them. */
const saved = () =>
    JSON.parse(sql(`select appearance from "User" where id='${state().carolId}'`) || 'null');

test('a new account sets Termi up on first sign-in, and it sticks', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signInPage(page, 'carol');
    await page.goto(`${BASE}/panel`);

    const setup = page.getByRole('dialog', { name: /Welcome, carol/ });
    await expect(setup).toBeVisible();
    // Each choice applies at once, behind the setup screen too.
    await setup.getByText('Day', { exact: true }).click();
    expect(await html(page, 'data-theme')).toBe('day');
    await setup.getByText('Violet', { exact: true }).click();
    await setup.getByText('Top bar', { exact: true }).click();
    await setup.getByText('Compact', { exact: true }).click();
    await setup.getByRole('button', { name: 'Start using Termi' }).click();
    await expect(setup).toHaveCount(0);

    // The menu is now a bar across the top.
    await expect(page.locator('header nav[aria-label="Main"]')).toBeVisible();
    await expect(page.locator('aside[aria-label="Menu"]')).toHaveCount(0);
    expect(saved()).toMatchObject({ theme: 'day', accent: 'violet', nav: 'topbar' });
    expect(sql(`select "onboardedAt" is not null from "User" where id='${state().carolId}'`)).toBe(
        't',
    );

    // The server paints the first frame in the chosen theme (no flash of Night).
    const res = await page.request.get(`${BASE}/panel`);
    const body = await res.text();
    expect(body).toMatch(/<html[^>]*data-theme="day"/);
    expect(body).toMatch(/<html[^>]*data-density="compact"/);
    expect(body).toMatch(/name="theme-color" content="#f4f6f9"/);

    // Setup doesn't come back.
    await page.reload();
    await expect(page.getByRole('dialog', { name: /Welcome/ })).toHaveCount(0);

    // Another device picks the choices up from the account.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.setViewportSize({ width: 1400, height: 900 });
    await signInPage(otherPage, 'carol');
    await otherPage.goto(`${BASE}/panel`);
    await expect.poll(() => html(otherPage, 'data-theme')).toBe('day');
    await expect(otherPage.locator('header nav[aria-label="Main"]')).toBeVisible();
    await other.close();
});

test('people already using Termi never see first-run setup', async ({ page }) => {
    await signInPage(page, 'bob');
    await page.goto(`${BASE}/panel`);
    await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: /Welcome/ })).toHaveCount(0);
});

test('the menu can be rearranged, trimmed, moved and set up for phones', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signInPage(page, 'carol');
    await page.goto(`${BASE}/panel/settings?section=appearance`);
    await page.getByText('Sidebar', { exact: true }).click();
    await page.getByText('Right', { exact: true }).click();
    await page.getByRole('button', { name: 'Move Groups up' }).click();
    await page.getByRole('switch', { name: 'Show Teams in the menu' }).click();
    // Settings stays, whatever happens.
    await expect(page.getByRole('switch', { name: /Settings always stays/ })).toBeDisabled();

    const menu = page.locator('aside[aria-label="Menu"]');
    await expect(menu).toHaveCSS('right', '0px');
    const names = await menu.locator('nav[aria-label="Main"] a').allTextContents();
    expect(names).toEqual([
        'Servers',
        'Connections',
        'Workspaces',
        'Keys & passwords',
        'Snippets',
        'Port forwarding',
        'Groups',
        'Known hosts',
        'History',
        'Settings',
    ]);
    // Hidden pages are still one search away.
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('team vault');
    await expect(page.getByRole('option', { name: 'Teams' })).toBeVisible();
    await page.keyboard.press('Escape');

    // The phone bar: swap Groups for Teams.
    await page.getByRole('checkbox', { name: 'Show Groups in the phone bar' }).uncheck();
    await page.getByRole('checkbox', { name: 'Show Teams in the phone bar' }).check();
    await expect.poll(() => saved()?.menu.mobile).toContain('teams');

    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${BASE}/panel`);
    const bar = page.locator('nav[aria-label="Main"]').filter({ visible: true });
    await expect(bar.getByRole('link')).toHaveText([
        'Servers',
        'Open',
        'Keys',
        'Teams',
        'Settings',
    ]);
});

test('terminals follow the terminal settings live', async ({ page }) => {
    const carol = await signedIn('carol');
    const server = await (
        await carol.post('/api/servers', {
            data: {
                name: 'carol-box',
                host: '127.0.0.1',
                port: SSH_PORT,
                protocol: 'SSH',
                username: 'root',
                password: SSH_PASSWORD,
            },
        })
    ).json();
    sql(`delete from "PersistentSession" where "userId"='${state().carolId}'`);
    await carol.post('/api/sessions', {
        data: { sessionId: randomUUID(), serverId: server.data.server.id, serverName: 'carol-box' },
    });

    await page.setViewportSize({ width: 1400, height: 900 });
    await signInPage(page, 'carol');
    await page.goto(`${BASE}/panel/sessions`);
    const pane = page.locator('[data-pane]').filter({ visible: true }).first();
    await expect(pane.locator('.xterm-rows')).toContainText('#', { timeout: 20_000 });
    const box = pane.locator('.terminal-container').first();
    // Day theme, terminal colours "match the app".
    await expect(box).toHaveCSS('background-color', 'rgb(251, 252, 253)');

    // Go to Settings in the same tab (the terminal keeps running behind it),
    // pick another scheme, and come back: the open terminal has restyled.
    await page.locator('nav[aria-label="Main"] a', { hasText: 'Settings' }).first().click();
    await page
        .getByRole('button', { name: /^Appearance/ })
        .first()
        .click();
    await page.getByText('Nord', { exact: true }).click();
    await page.locator('nav[aria-label="Main"] a', { hasText: 'Connections' }).first().click();
    await expect(box).toHaveCSS('background-color', 'rgb(46, 52, 64)');

    // …and the terminal still works.
    await pane.locator('.xterm-screen').click();
    await page.keyboard.type('echo LOOK-$((40+2))\n');
    await expect(pane.locator('.xterm-rows')).toContainText('LOOK-42', { timeout: 20_000 });
});

test('the save endpoint needs a session and cleans what it is sent', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE });
    expect((await anon.put('/api/account/appearance', { data: { appearance: {} } })).status()).toBe(
        401,
    );

    const carol = await signedIn('carol');
    const res = await carol.put('/api/account/appearance', {
        data: {
            appearance: {
                theme: '"><script>',
                accent: 'pink',
                menu: { hidden: ['settings'], order: ['nope'] },
                terminal: { fontSize: 400 },
            },
        },
    });
    expect(res.status()).toBe(200);
    const stored = saved();
    expect(stored.theme).toBe('night');
    expect(stored.accent).toBe('pink');
    expect(stored.menu.hidden).not.toContain('settings');
    expect(stored.terminal.fontSize).toBe(22);
    // The cookie the server paints from carries only known values.
    const cookie = res.headers()['set-cookie'] ?? '';
    expect(cookie).toMatch(/termi-ui=night\.pink\.comfortable\.full/);
});
