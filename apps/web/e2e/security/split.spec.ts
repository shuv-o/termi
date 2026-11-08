import { randomUUID } from 'crypto';
import { expect, test, type Page } from '@playwright/test';
import { BASE } from './env';
import { signInPage, signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

const panes = (page: Page) => page.locator('[data-pane]').filter({ visible: true });

/** Wait until every visible pane has a live shell prompt. */
async function waitForShells(page: Page, count: number) {
    await expect(panes(page)).toHaveCount(count, { timeout: 20_000 });
    for (let i = 0; i < count; i++) {
        await expect(panes(page).nth(i).locator('.xterm-rows')).toContainText('#', {
            timeout: 20_000,
        });
    }
}

async function closeAllSessions() {
    const { aliceId } = state();
    sql(`delete from "PersistentSession" where "userId"='${aliceId}'`);
}

test('split panes, type in all of them, save and reopen a workspace', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await closeAllSessions();
    // One saved session, restored (and reconnected) when the workspace loads.
    const alice = await signedIn('alice');
    await alice.post('/api/sessions', {
        data: { sessionId: randomUUID(), serverId: state().sshServerId, serverName: 'ssh-box' },
    });
    await signInPage(page, 'alice');
    await page.goto(`${BASE}/panel/sessions`);
    await page.evaluate(() => localStorage.removeItem('sessions-split'));
    await waitForShells(page, 1);

    // Split right: a second shell to the same server, side by side.
    await panes(page).first().getByRole('button', { name: 'Split right' }).first().click();
    await waitForShells(page, 2);
    const [a, b] = [await panes(page).nth(0).boundingBox(), await panes(page).nth(1).boundingBox()];
    expect(b!.x).toBeGreaterThan(a!.x + a!.width - 5);

    // Type in all panes: one command, run in both shells.
    await page.getByRole('button', { name: 'Layout and workspaces' }).click();
    await page.getByRole('menuitem', { name: 'Type in all panes' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Typing goes to all 2 panes.')).toBeVisible();
    await panes(page).nth(0).locator('.xterm-screen').click();
    await page.keyboard.type('echo BCAST-$((40+2))\n');
    for (let i = 0; i < 2; i++) {
        await expect(panes(page).nth(i).locator('.xterm-rows')).toContainText('BCAST-42');
    }

    // Save it as a workspace.
    await page.getByRole('button', { name: 'Layout and workspaces' }).click();
    await page.getByRole('menuitem', { name: 'Save current as workspace…' }).click();
    await page.getByLabel('Workspace name').fill('Pair');
    await page.getByRole('button', { name: 'Save workspace' }).click();
    await expect(page.getByText('Saved workspace "Pair"')).toBeVisible();
    const saved = (await (await alice.get('/api/workspaces')).json()).data.workspaces;
    expect(saved[0]).toMatchObject({
        name: 'Pair',
        split: { layout: 'columns', panes: [0, 1] },
        tabs: [
            { serverId: state().sshServerId, available: true },
            { serverId: state().sshServerId, available: true },
        ],
    });

    // The split survives a reload.
    await page.reload();
    await waitForShells(page, 2);

    // Close everything, then reopen the workspace in one click.
    for (let i = 0; i < 2; i++) {
        await panes(page).first().getByRole('button', { name: 'Close session' }).first().click();
    }
    await expect(panes(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Layout and workspaces' }).click();
    await page.getByRole('menuitem', { name: /^Pair/ }).click();
    await waitForShells(page, 2);

    // A phone shows only the focused pane.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panes(page)).toHaveCount(1);
});

test('workspaces only accept servers the user can open', async () => {
    const bob = await signedIn('bob');
    const res = await bob.post('/api/workspaces', {
        data: { name: 'Steal', tabs: [{ serverId: state().sshServerId }] },
    });
    expect(res.status()).toBe(400);
    const bad = await bob.post('/api/workspaces', {
        data: {
            name: 'Bad layout',
            tabs: [{ serverId: null }],
            split: { layout: 'columns', panes: [0, 5], x: 0.5, y: 0.5 },
        },
    });
    expect(bad.status()).toBe(400);
    // Alice's workspace is invisible to Bob.
    const list = (await (await bob.get('/api/workspaces')).json()).data.workspaces;
    expect(list.find((w: { name: string }) => w.name === 'Pair')).toBeUndefined();
});
