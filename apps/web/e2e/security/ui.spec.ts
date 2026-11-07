import { expect, test } from '@playwright/test';
import { BASE } from './env';
import { signInPage } from './helpers';

test.describe('security settings UI', () => {
    test('account activity lists recent sign-ins and security events', async ({ page }) => {
        await signInPage(page, 'alice');
        await page.goto(`${BASE}/panel/settings?section=activity`);
        await page
            .getByRole('button', { name: /Account activity/ })
            .first()
            .click();
        await expect(page.getByText('Account activity').first()).toBeVisible();
        await expect(page.getByText('Keychain secret revealed').first()).toBeVisible();
        await expect(page.getByText(/Signed in|Failed sign-in attempt/).first()).toBeVisible();
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
