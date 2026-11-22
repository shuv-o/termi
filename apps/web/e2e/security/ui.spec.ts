import { expect, test } from '@playwright/test';
import { BASE } from './env';
import { signInPage } from './helpers';

test.describe('security settings UI', () => {
    test('account activity lists recent sign-ins and security events', async ({ page }) => {
        await signInPage(page, 'alice');
        // Account activity moved from Settings to History; the old link still lands there.
        await page.goto(`${BASE}/panel/settings?section=activity`);
        await expect(page).toHaveURL(/\/panel\/history\?tab=activity/);
        await expect(page.getByRole('tab', { name: 'Account activity' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await expect(page.getByText(/Signed in|Failed sign-in attempt/).first()).toBeVisible();
        // The reveal happened in accounts.spec; how many events other specs
        // add after it varies (a retried spec signs in again), so page back.
        const revealed = page.getByText('Keychain secret revealed').first();
        const older = page.getByRole('button', { name: 'Show older' });
        for (let i = 0; i < 10 && !(await revealed.isVisible()); i++) {
            if (!(await older.isVisible())) break;
            await older.click();
            await expect(older.locator('svg.animate-spin')).toHaveCount(0);
        }
        await expect(revealed).toBeVisible();
    });

    test('"Passkey only" can only be turned on once a passkey exists', async ({ page }) => {
        await signInPage(page, 'alice');
        await page.goto(`${BASE}/panel/settings`);
        await page
            .getByRole('button', { name: /^Passkeys/ })
            .first()
            .click();
        await expect(page.getByText('Passkey only')).toBeVisible();
        await expect(page.getByText(/Add a passkey first/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Turn on' })).toBeDisabled();
    });

    test('the removed encryption-passphrase pages redirect to the panel', async ({ page }) => {
        await signInPage(page, 'alice');
        await page.goto(`${BASE}/setup-encryption`);
        await expect(page).toHaveURL(/\/panel/);
    });
});
