import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { BASE, DB, USERS } from './env';
import { STATE_FILE } from './global-setup';

export interface SeedState {
    aliceId: string;
    bobId: string;
    carolId: string;
    sshServerId: string;
    vncServerId: string;
}

export const state = (): SeedState => JSON.parse(readFileSync(STATE_FILE, 'utf8'));

/** Run SQL against the suite's database and return trimmed output. */
export function sql(query: string): string {
    return execFileSync('psql', ['-d', DB.name, '-Atc', query], {
        env: {
            ...process.env,
            PGHOST: DB.host,
            PGPORT: DB.port,
            PGUSER: DB.user,
            PGPASSWORD: DB.password,
        },
    })
        .toString()
        .trim();
}

const sessions = new Map<string, APIRequestContext>();

/**
 * An API client signed in as one of the seeded users. Sessions are reused:
 * the login rate limit (correctly) refuses a burst of fresh sign-ins.
 */
export async function signedIn(user: keyof typeof USERS): Promise<APIRequestContext> {
    const cached = sessions.get(user);
    if (cached) return cached;
    const ctx = await pwRequest.newContext({ baseURL: BASE });
    const res = await ctx.post('/api/auth/login', { data: USERS[user] });
    if (res.status() !== 200) throw new Error(`login ${user}: ${res.status()} ${await res.text()}`);
    sessions.set(user, ctx);
    return ctx;
}

/** Drop a cached session (e.g. after a password change signed it out). */
export function forgetSession(user: keyof typeof USERS) {
    sessions.delete(user);
}

/** Give a browser page the signed-in session of a seeded user. */
export async function signInPage(page: Page, user: keyof typeof USERS) {
    const ctx = await signedIn(user);
    const { cookies } = await ctx.storageState();
    await page.context().addCookies(cookies);
}

export const json = async (res: { status(): number; json(): Promise<unknown> }) => ({
    status: res.status(),
    body: (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        // Tests read arbitrary nested API payloads; typing each one adds nothing here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any;
    } | null,
});
