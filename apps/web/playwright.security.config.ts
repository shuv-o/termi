/**
 * Security regression suite: proves Termi's protections hold against a real
 * web app, gateway, database, SSH host, guacd and VNC server. Needs Docker and a reachable Postgres (local trust auth, or the
 * SEC_E2E_DB_* variables).
 *
 *   npm run test:security
 */
import { defineConfig, devices } from '@playwright/test';
import { appEnv, BASE, GATEWAY_PORT, OIDC_IDP, OIDC_IDP_PORT, WEB_PORT } from './e2e/security/env';

export default defineConfig({
    testDir: './e2e/security',
    testMatch: /.*\.spec\.ts/,
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    timeout: 90_000,
    reporter: process.env.CI ? [['list'], ['github']] : 'list',
    globalSetup: './e2e/security/global-setup.ts',
    globalTeardown: './e2e/security/global-teardown.ts',
    use: { baseURL: BASE, ...devices['Desktop Chrome'] },
    webServer: [
        {
            command: 'node e2e/security/fixtures/oidc-idp.mjs',
            url: `${OIDC_IDP}/.well-known/openid-configuration`,
            env: { OIDC_IDP_PORT: String(OIDC_IDP_PORT) },
            reuseExistingServer: false,
            timeout: 30_000,
        },
        {
            command: `npx next dev --port ${WEB_PORT}`,
            url: `${BASE}/login`,
            env: appEnv(),
            reuseExistingServer: false,
            timeout: 180_000,
        },
        {
            command: 'npm run dev --workspace=apps/gateway',
            cwd: '../..',
            url: `http://localhost:${GATEWAY_PORT}/health`,
            env: appEnv(),
            reuseExistingServer: false,
            timeout: 120_000,
        },
    ],
});
