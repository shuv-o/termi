/**
 * Shared settings for the security regression suite. Test-only values: the
 * suite runs against a throwaway database and containers it creates itself.
 */
import { userInfo } from 'os';

export const WEB_PORT = 23080;
export const GATEWAY_PORT = 23081;
export const SSH_PORT = 23022;
export const GUACD_PORT = 23822;
export const BASE = `http://localhost:${WEB_PORT}`;
export const OIDC_IDP_PORT = 23099;
export const OIDC_IDP = `http://localhost:${OIDC_IDP_PORT}`;
export const TUNNEL_TEMPLATE = `http://{id}.localhost:${WEB_PORT}`;

export const DOCKER_NET = 'termi-sec-e2e';
export const SSH_CONTAINER = 'termi-sec-e2e-ssh';
export const VNC_CONTAINER = 'termi-sec-e2e-vnc';
export const GUACD_CONTAINER = 'termi-sec-e2e-guacd';

export const DB = {
    host: process.env.SEC_E2E_DB_HOST ?? 'localhost',
    port: process.env.SEC_E2E_DB_PORT ?? '5432',
    user: process.env.SEC_E2E_DB_USER ?? userInfo().username,
    password: process.env.SEC_E2E_DB_PASSWORD ?? 'x',
    name: process.env.SEC_E2E_DB_NAME ?? 'termi_sec_e2e',
};

export const SECRETS = {
    SESSION_SECRET: 'sec-e2e-session-secret-0123456789abcdef0123456789',
    ENCRYPTION_KEY: 'sec-e2e-encryption-key-0123456789abcdef0123456789',
    GATEWAY_JWT_SECRET: 'sec-e2e-gateway-secret-0123456789abcdef012345678',
};

export const USERS = {
    alice: { email: 'alice@sec-e2e.local', password: 'Alice-pass-123' },
    bob: { email: 'bob@sec-e2e.local', password: 'Bob-pass-1234' },
};

export const SSH_PASSWORD = 'sec-e2e-ssh-pw';
export const VNC_PASSWORD = 'vncpw123';

/** Environment for the web app, gateway and seed script. */
export function appEnv(): Record<string, string> {
    return {
        DB_HOST: DB.host,
        DB_PORT: DB.port,
        DB_USER: DB.user,
        DB_PASSWORD: DB.password,
        DB_NAME: DB.name,
        ...SECRETS,
        NEXT_PUBLIC_APP_URL: BASE,
        NEXT_PUBLIC_GATEWAY_URL: `ws://localhost:${GATEWAY_PORT}`,
        ALLOWED_ORIGINS: BASE,
        GATEWAY_PORT: String(GATEWAY_PORT),
        GUACD_HOST: '127.0.0.1',
        GUACD_PORT: String(GUACD_PORT),
        ALLOW_PRIVATE_NETWORKS: 'true',
        TUNNEL_ORIGIN_TEMPLATE: TUNNEL_TEMPLATE,
        SMTP_HOST: '',
        NODE_ENV: 'development',
        // Single sign-on against the suite's own provider (fixtures/oidc-idp.mjs).
        OIDC_ISSUER: OIDC_IDP,
        OIDC_CLIENT_ID: 'termi-e2e',
        OIDC_CLIENT_SECRET: 'termi-e2e-secret',
        OIDC_NAME: 'Acme SSO',
        OIDC_ENFORCE_DOMAINS: 'corp.test',
    };
}
