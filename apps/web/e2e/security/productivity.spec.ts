import { randomUUID } from 'crypto';
import { expect, test, type Page } from '@playwright/test';
import { BASE } from './env';
import { signInPage, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const pane = (page: Page) => page.locator('[data-pane]').filter({ visible: true }).first();
const screen = (page: Page) => pane(page).locator('.xterm-rows');

async function openSession(page: Page) {
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
    await expect(screen(page)).toContainText('#', { timeout: 20_000 });
    await pane(page).locator('.xterm-screen').click();
}

const history = (page: Page) =>
    page.evaluate((id) => localStorage.getItem(`termi-history:${id}`) ?? '', state().sshServerId);

test('command suggestions: learned from history, accepted with →, never secrets', async ({
    page,
}) => {
    await openSession(page);
    await page.evaluate(() => {
        for (const k of Object.keys(localStorage))
            if (k.startsWith('termi-history:')) localStorage.removeItem(k);
    });

    await page.keyboard.type('echo SUGGEST-$((40+2))\n');
    await expect(screen(page)).toContainText('SUGGEST-42');
    expect(await history(page)).toContain('echo SUGGEST-$((40+2))');

    // Typing the start shows the rest greyed out; → accepts it.
    await page.keyboard.type('echo SUG');
    const ghost = page.getByTestId('command-suggestion');
    await expect(ghost).toHaveText('GEST-$((40+2))');
    await page.keyboard.press('ArrowRight');
    await expect(ghost).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect
        .poll(async () => ((await screen(page).textContent()) ?? '').split('SUGGEST-42').length - 1)
        .toBe(2);

    // A password typed at a prompt that doesn't echo is never remembered…
    await page.keyboard.type('read -s -p "Password: " PW; echo GOT-$((1+1))\n');
    await expect(screen(page)).toContainText('Password:');
    await page.keyboard.type('hunter2-secret\n');
    await expect(screen(page)).toContainText('GOT-2');
    // …nor is a command typed with a leading space.
    await page.keyboard.type(' echo HIDDEN-$((1+1))\n');
    await expect(screen(page)).toContainText('HIDDEN-2');
    const h = await history(page);
    expect(h).not.toContain('hunter2');
    expect(h).not.toContain('HIDDEN');
});

test('snippet variables are asked for and quoted safely', async ({ page }) => {
    const alice = await signedIn('alice');
    await alice.post('/api/snippets', {
        data: { label: 'Greet', command: 'echo HELLO-{{who|q}}-{{n:7}}', runImmediately: true },
    });
    await openSession(page);
    await pane(page).getByRole('button', { name: 'Quick tools' }).first().click();
    await page.getByRole('button', { name: 'Greet', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Greet' });
    await expect(dialog.getByLabel('n')).toHaveValue('7');
    await dialog.getByLabel('who').fill("it's; echo PWNED");
    await expect(dialog.locator('pre')).toHaveText(`echo HELLO-'it'\\''s; echo PWNED'-7`);
    await dialog.getByRole('button', { name: 'Use command' }).click();
    await expect(screen(page)).toContainText("HELLO-it's; echo PWNED-7");
    // The value stayed one argument: nothing ran as a second command.
    expect((await screen(page).textContent())?.match(/^PWNED/m)).toBeNull();
});

test('run a command on several servers from the command palette', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 900 });
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel`);
    await page.getByRole('button', { name: /Search or run/ }).first().click();
    await page.getByRole('option', { name: 'Run a command on several servers' }).click();
    const dialog = page.getByRole('dialog', { name: 'Run on several servers' });
    await dialog.getByLabel('Command').fill('echo MULTI-$((40+2))');
    await dialog.getByRole('checkbox', { name: 'ssh-box', exact: true }).click();
    await dialog.getByRole('button', { name: /^Run on 1 server$/ }).click();
    await expect(dialog.getByText('1 of 1')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: /ssh-box/ }).click();
    await expect(dialog.getByTestId('run-output-ssh-box')).toContainText('MULTI-42');
});

test("the run API only uses the caller's own SSH servers", async () => {
    const bob = await signedIn('bob');
    const res = await bob.post('/api/servers/run', {
        data: { serverIds: [state().sshServerId], command: 'id' },
    });
    expect(res.status()).toBe(400);
    expect(
        Number(
            sql(
                `select count(*) from "AuditLog" where action='SERVERS_COMMAND_RUN' and "userId"='${state().bobId}'`,
            ),
        ),
    ).toBe(0);
});
