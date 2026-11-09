import { expect, test, request as pwRequest } from '@playwright/test';
import { BASE } from './env';
import { signInPage, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

// Carol is the "new account"; these tests are about the pages, not first-run setup.
test.beforeAll(() => {
    sql(`update "User" set "onboardedAt" = now() where id='${state().carolId}'`);
});

const recentConnections = (userId: string, serverId: string) =>
    Number(
        sql(
            `select count(*) from "AuditLog" where "userId"='${userId}' and action='CONNECTION_OPENED' ` +
                `and resource='server:${serverId}' and "createdAt" > (now() at time zone 'utc') - interval '10 minutes'`,
        ),
    );

test('opening a server is logged once per stretch of work, for that user only', async () => {
    const { aliceId, bobId, sshServerId } = state();
    const alice = await signedIn('alice');
    // A terminal asks for a new token on every reconnect: still one entry.
    for (let i = 0; i < 2; i++) {
        const res = await alice.post('/api/connection/token', {
            data: { serverId: sshServerId, protocol: 'ssh' },
        });
        expect(res.status()).toBe(200);
    }
    expect(recentConnections(aliceId, sshServerId)).toBe(1);

    const list = (await (await alice.get('/api/account/connections')).json()).data;
    expect(list.entries).toContainEqual(
        expect.objectContaining({ serverId: sshServerId, protocol: 'ssh' }),
    );
    // Connections stay out of the security activity list.
    const activity = (await (await alice.get('/api/account/activity')).json()).data.entries;
    expect(activity.map((e: { action: string }) => e.action)).not.toContain('CONNECTION_OPENED');

    // Nobody else sees them.
    const bob = await signedIn('bob');
    const bobs = (await (await bob.get('/api/account/connections')).json()).data.entries;
    expect(bobs.some((e: { serverId: string }) => e.serverId === sshServerId)).toBe(false);
    expect(recentConnections(bobId, sshServerId)).toBe(0);
});

test('connection history needs a session, and old Settings links only match real sections', async ({
    page,
}) => {
    const anon = await pwRequest.newContext({ baseURL: BASE });
    expect((await anon.get('/api/account/connections')).status()).toBe(401);

    await signInPage(page, 'alice');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/panel/settings?section=constructor`);
    await expect(page).toHaveURL(/\/panel\/settings\?section=constructor/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(errors).toEqual([]);
});

test('History lists connections and opens them again', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/history`);
    await expect(page.getByRole('tab', { name: 'Connections' })).toHaveAttribute(
        'aria-selected',
        'true',
    );
    const today = page.getByRole('region', { name: 'Today' });
    // "Open again" goes back to the same server, the same way.
    await expect(
        today.locator(`a[href="/panel/connect/${state().sshServerId}/ssh"]`).first(),
    ).toHaveAccessibleName(/^Open .* again$/);
    await page.getByRole('tab', { name: 'Account activity' }).click();
    await expect(page).toHaveURL(/tab=activity/);
    await expect(page.getByText('Signed in').first()).toBeVisible();
});

test('Snippets: start from a suggestion, edit it, delete it', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signInPage(page, 'carol');
    sql(`delete from "CommandSnippet" where "userId"='${state().carolId}'`);
    await page.goto(`${BASE}/panel/snippets`);

    await page.getByRole('button', { name: 'Disk space' }).click();
    const list = page.getByRole('list', { name: 'Snippets' });
    await expect(list.getByText('df -h')).toBeVisible();

    await list.getByRole('button', { name: 'Edit Disk space' }).click();
    await list.getByRole('textbox', { name: 'Command' }).fill('df -h {{mount:/}}');
    await page.getByRole('button', { name: 'Save changes' }).click();
    // The variable is picked out, so you can see what it will ask for.
    await expect(list.getByTitle('Asks for mount when you run it')).toBeVisible();
    expect(sql(`select command from "CommandSnippet" where "userId"='${state().carolId}'`)).toBe(
        'df -h {{mount:/}}',
    );

    await list.getByRole('button', { name: 'Delete Disk space' }).click();
    await list.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(list).toHaveCount(0);
    expect(sql(`select count(*) from "CommandSnippet" where "userId"='${state().carolId}'`)).toBe(
        '0',
    );
});

test('Known hosts shows the pinned key and checks it on request', async ({ page }) => {
    const alice = await signedIn('alice');
    // Connecting pins the key if it isn't yet.
    await alice.post('/api/connection/token', {
        data: { serverId: state().sshServerId, protocol: 'ssh' },
    });
    const fp = sql(`select "hostKeyFingerprint" from "Server" where id='${state().sshServerId}'`);
    expect(fp).toMatch(/^SHA256:/);

    await page.setViewportSize({ width: 1400, height: 900 });
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/known-hosts`);
    const row = page.getByRole('listitem').filter({ hasText: fp });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Check key' }).click();
    await expect(row.getByText('The server presents this key.')).toBeVisible({ timeout: 20_000 });
});

test('Workspaces opens a saved workspace in Connections', async ({ page }) => {
    const alice = await signedIn('alice');
    const name = `ws-${Date.now()}`;
    const res = await alice.post('/api/workspaces', {
        data: { name, tabs: [{ serverId: state().sshServerId }], split: null },
    });
    expect(res.status()).toBe(201);

    await page.setViewportSize({ width: 1400, height: 900 });
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/workspaces`);
    const card = page.getByRole('listitem').filter({ hasText: name });
    await card.getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(`${BASE}/panel/sessions`);
    await expect(
        page.locator('[data-pane] .xterm-rows').filter({ visible: true }).first(),
    ).toContainText('#', { timeout: 20_000 });
});

test('old Settings links land on the new pages', async ({ page }) => {
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/settings?section=tunnels`);
    await expect(page).toHaveURL(`${BASE}/panel/forwarding`);
    await expect(page.getByRole('heading', { name: 'Port forwarding' })).toBeVisible();
    await page.goto(`${BASE}/panel/settings?section=recordings`);
    await expect(page).toHaveURL(`${BASE}/panel/history?tab=recordings`);
});

test('a menu saved before these pages existed gets them, before Settings', async ({ page }) => {
    const carol = await signedIn('carol');
    await carol.put('/api/account/appearance', {
        data: {
            appearance: {
                nav: 'sidebar',
                menu: {
                    order: ['servers', 'connections', 'keys', 'groups', 'teams', 'settings'],
                    hidden: [],
                },
            },
        },
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await signInPage(page, 'carol');
    await page.goto(`${BASE}/panel`);
    const menu = page.locator('aside[aria-label="Menu"] nav[aria-label="Main"] a');
    await expect(menu.last()).toHaveText('Settings');
    const names = await menu.allTextContents();
    expect(names).toEqual(
        expect.arrayContaining([
            'Snippets',
            'Port forwarding',
            'Known hosts',
            'History',
            'Workspaces',
        ]),
    );
});
