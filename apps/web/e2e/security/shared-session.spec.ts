import { randomUUID } from 'crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { BASE, USERS } from './env';
import { signInPage, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const pane = (page: Page) => page.locator('[data-pane]').filter({ visible: true }).first();
const ownerScreen = (page: Page) => pane(page).locator('.xterm-rows');

async function ownerSession(page: Page) {
    const { aliceId, sshServerId } = state();
    sql(`delete from "PersistentSession" where "userId"='${aliceId}'`);
    const alice = await signedIn('alice');
    await alice.post('/api/sessions', {
        data: { sessionId: randomUUID(), serverId: sshServerId, serverName: 'ssh-box' },
    });
    await page.setViewportSize({ width: 1300, height: 850 });
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/sessions`);
    await page.evaluate(() => localStorage.removeItem('sessions-split'));
    await expect(ownerScreen(page)).toContainText('#', { timeout: 20_000 });
}

async function shareLink(page: Page, mode: 'Watch' | 'Watch and type') {
    await pane(page).getByRole('button', { name: 'Share session' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Share this session' });
    await dialog
        .getByRole('radio', { name: mode === 'Watch' ? /^Watch See/ : /^Watch and type/ })
        .click();
    await dialog.getByRole('button', { name: 'Create link' }).click();
    const link = (await dialog.getByTestId('session-join-link').textContent())!;
    await dialog.getByRole('button', { name: 'Done' }).click();
    return new URL(link).pathname;
}

async function guest(browser: Browser, path: string) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInPage(page, 'bob');
    await page.goto(`${BASE}${path}`);
    await page.getByRole('button', { name: 'Ask to join' }).click();
    await expect(page.getByRole('status')).toContainText('Waiting for');
    return page;
}

const guestScreen = (page: Page) => page.getByTestId('guest-terminal').locator('.xterm-rows');

test('a guest watches only after the owner lets them in, and can be removed', async ({
    page,
    browser,
}) => {
    await ownerSession(page);
    const path = await shareLink(page, 'Watch');
    const bob = await guest(browser, path);

    const prompt = page.getByRole('alertdialog', { name: 'Join request' });
    await expect(prompt).toContainText(`${USERS.bob.email} wants to watch`);
    await prompt.getByRole('button', { name: 'Let in' }).click();
    await expect(bob.getByRole('status')).toContainText('session on ssh-box');

    await pane(page).locator('.xterm-screen').click();
    await page.keyboard.type('echo SHARED-$((40+2))\n');
    await expect(guestScreen(bob)).toContainText('SHARED-42');

    // Watching means watching: the guest's keys go nowhere.
    await bob.getByTestId('guest-terminal').click();
    await bob.keyboard.type('echo GUEST-$((1+1))\n');
    await page.waitForTimeout(1000);
    await expect(ownerScreen(page)).not.toContainText('GUEST-2');

    // The owner sees who's in, and removes them.
    const guests = pane(page).getByTestId('session-guests');
    await expect(guests).toContainText(USERS.bob.email);
    await guests.getByRole('button', { name: `Remove ${USERS.bob.email}` }).click();
    await expect(bob.getByRole('status')).toContainText('removed you');
    await expect(guests).toHaveCount(0);
});

test('a guest allowed to type can run commands; a denied one never gets in', async ({
    page,
    browser,
}) => {
    await ownerSession(page);
    const path = await shareLink(page, 'Watch and type');
    const bob = await guest(browser, path);
    await page
        .getByRole('alertdialog', { name: 'Join request' })
        .getByRole('button', { name: 'Let in' })
        .click();
    await expect(bob.getByRole('status')).toContainText('you can type');
    await bob.getByTestId('guest-terminal').click();
    await bob.keyboard.type('echo HELPER-$((40+2))\n');
    await expect(ownerScreen(page)).toContainText('HELPER-42');
    await bob.close();

    const denied = await guest(browser, path);
    await page
        .getByRole('alertdialog', { name: 'Join request' })
        .getByRole('button', { name: 'Deny' })
        .click();
    await expect(denied.getByRole('status')).toContainText('did not let you in');
    await expect(guestScreen(denied)).not.toContainText('HELPER-42');
});

test('a link that was turned off or belongs to nobody gets you nowhere', async () => {
    const alice = await signedIn('alice');
    const sessionId = sql(
        `select "sessionId" from "PersistentSession" where "userId"='${state().aliceId}' limit 1`,
    );
    const created = await (
        await alice.post(`/api/sessions/${sessionId}/share`, { data: { mode: 'view' } })
    ).json();
    const code = new URL(created.data.share.joinUrl).pathname.split('/').pop();
    await alice.delete(`/api/session-shares/${created.data.share.id}`);

    const bob = await signedIn('bob');
    expect((await bob.post(`/api/session-shares/join/${code}`)).status()).toBe(404);
    expect((await bob.post('/api/session-shares/join/not-a-real-code')).status()).toBe(404);
    // Nobody can share a session that isn't theirs.
    expect(
        (
            await bob.post(`/api/sessions/${sessionId}/share`, { data: { mode: 'control' } })
        ).status(),
    ).toBe(404);
});
