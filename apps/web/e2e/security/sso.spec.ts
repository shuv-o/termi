import { expect, test, request as pwRequest, type Page } from '@playwright/test';
import { BASE, OIDC_IDP, USERS } from './env';
import { json, sql } from './helpers';

test.describe.configure({ mode: 'serial' });

async function nextSignIn(user: Record<string, unknown>) {
    const ctx = await pwRequest.newContext();
    await ctx.post(`${OIDC_IDP}/_test/next`, { data: user });
}

async function ssoSignIn(page: Page) {
    await page.goto(`${BASE}/login`);
    await page.getByRole('link', { name: 'Sign in with Acme SSO' }).click();
}

const me = (page: Page) => page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));

test('a new person signs in with SSO and gets an account', async ({ page }) => {
    await nextSignIn({ email: 'new.person@corp.test', email_verified: true, sub: 'u-new' });
    await ssoSignIn(page);
    await page.waitForURL(/\/panel/);
    expect((await me(page)).data.user.email).toBe('new.person@corp.test');
    expect(
        sql(
            `select count(*) from "OAuthAccount" o join "User" u on u.id=o."userId" where u.email='new.person@corp.test' and o.provider='OIDC' and o."providerAccountId"='${OIDC_IDP}|u-new'`,
        ),
    ).toBe('1');
});

test('an existing verified account is linked by email', async ({ page }) => {
    await nextSignIn({ email: USERS.alice.email, email_verified: true, sub: 'u-alice' });
    await ssoSignIn(page);
    await page.waitForURL(/\/panel/);
    expect((await me(page)).data.user.email).toBe(USERS.alice.email);
});

for (const [mode, label] of [
    ['wrong-key', 'an ID token signed with another key'],
    ['wrong-aud', 'an ID token for another client'],
    ['wrong-nonce', 'an ID token replayed from another sign-in'],
    ['wrong-issuer', 'an ID token from another issuer'],
] as const) {
    test(`refuses ${label}`, async ({ page }) => {
        await nextSignIn({ email: USERS.bob.email, email_verified: true, sub: 'u-bob', mode });
        await ssoSignIn(page);
        await page.waitForURL(/\/login\?error=sso_/);
        await expect(page.getByText(/Single sign-on failed/)).toBeVisible();
        expect((await me(page)).success).toBe(false);
    });
}

test('refuses an email the provider did not verify', async ({ page }) => {
    await nextSignIn({ email: USERS.bob.email, email_verified: false, sub: 'u-bob2' });
    await ssoSignIn(page);
    await page.waitForURL(/error=sso_email_unverified/);
    expect((await me(page)).success).toBe(false);
});

test('a forged callback (no matching state) is refused', async ({ page }) => {
    await page.goto(`${BASE}/api/auth/sso/callback?code=abc&state=forged`);
    await page.waitForURL(/error=sso_state/);
    expect((await me(page)).success).toBe(false);
});

test('domains that require SSO cannot use passwords', async () => {
    const anon = await pwRequest.newContext({ baseURL: BASE });
    const reg = await json(
        await anon.post('/api/auth/register', {
            data: { email: 'pw.user@corp.test', password: 'Abcdefg123', name: 'x' },
        }),
    );
    expect(reg.status).toBeGreaterThanOrEqual(400);
    expect(reg.body!.error).toMatch(/single sign-on/);

    // An account in that domain that has a password still can't use it.
    sql(
        `insert into "User" (id, email, "passwordHash", "isVerified", "updatedAt") select 'sso-pw-user', 'ann@corp.test', "passwordHash", true, now() from "User" where email='${USERS.alice.email}' on conflict do nothing`,
    );
    const login = await json(
        await anon.post('/api/auth/login', {
            data: { email: 'ann@corp.test', password: USERS.alice.password },
        }),
    );
    expect(login.status).toBe(401);
    expect(login.body!.error).toMatch(/single sign-on/);
});
