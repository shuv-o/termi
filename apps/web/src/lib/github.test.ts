import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `github.ts` reads GITHUB_TOKEN at module scope, so each case sets the env var
 * and then re-imports the module with a reset registry to pick it up.
 */
async function loadModule(token?: string) {
    vi.resetModules();

    if (token === undefined) {
        delete process.env.GITHUB_TOKEN;
    } else {
        process.env.GITHUB_TOKEN = token;
    }

    return import('./github');
}

const URL = 'https://api.github.com/repos/shuv-o/termix';
const TTL = { authenticated: 30, anonymous: 300 };

/** Minimal stand-in for the bits of Response that githubFetch inspects. */
function response(status: number) {
    return { status, ok: status >= 200 && status < 300 } as Response;
}

const originalToken = process.env.GITHUB_TOKEN;

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    if (originalToken === undefined) {
        delete process.env.GITHUB_TOKEN;
    } else {
        process.env.GITHUB_TOKEN = originalToken;
    }
});

describe('githubFetch', () => {
    it('sends no Authorization header when no token is configured', async () => {
        const { githubFetch, hasGitHubToken } = await loadModule(undefined);
        const fetchMock = vi.fn().mockResolvedValue(response(200));
        vi.stubGlobal('fetch', fetchMock);

        expect(hasGitHubToken).toBe(false);
        await githubFetch(URL, TTL);

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers.Authorization).toBeUndefined();
        // GitHub rejects requests with no User-Agent outright.
        expect(init.headers['User-Agent']).toBe('termix-web');
        // Anonymous requests must use the slower TTL to stay under 60 req/h.
        expect(init.next.revalidate).toBe(TTL.anonymous);
    });

    it('sends a bearer token and the faster TTL when configured', async () => {
        const { githubFetch, hasGitHubToken } = await loadModule('github_pat_valid');
        const fetchMock = vi.fn().mockResolvedValue(response(200));
        vi.stubGlobal('fetch', fetchMock);

        expect(hasGitHubToken).toBe(true);
        await githubFetch(URL, TTL);

        const [, init] = fetchMock.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer github_pat_valid');
        expect(init.next.revalidate).toBe(TTL.authenticated);
    });

    it('falls back to an anonymous request when the token is rejected', async () => {
        // Regression: a typo'd or expired GITHUB_TOKEN makes GitHub answer 401.
        // Without this retry, an optional setting would break a page that works
        // perfectly well with no token at all (/api/download would 502).
        const { githubFetch } = await loadModule('github_pat_expired');
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(response(401))
            .mockResolvedValueOnce(response(200));
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await githubFetch(URL, TTL);

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const [, retryInit] = fetchMock.mock.calls[1];
        expect(retryInit.headers.Authorization).toBeUndefined();
        // The retry must drop to the anonymous TTL too, or a broken token would
        // hammer the 60 req/h limit at the authenticated rate and earn a 403.
        expect(retryInit.next.revalidate).toBe(TTL.anonymous);
    });

    it('does not retry a 401 when no token was sent', async () => {
        const { githubFetch } = await loadModule(undefined);
        const fetchMock = vi.fn().mockResolvedValue(response(401));
        vi.stubGlobal('fetch', fetchMock);

        const res = await githubFetch(URL, TTL);

        expect(res.status).toBe(401);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('passes other failures through without retrying', async () => {
        // 403 is the rate-limit response; retrying anonymously would not help
        // and would just burn another request.
        const { githubFetch } = await loadModule('github_pat_valid');
        const fetchMock = vi.fn().mockResolvedValue(response(403));
        vi.stubGlobal('fetch', fetchMock);

        const res = await githubFetch(URL, TTL);

        expect(res.status).toBe(403);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('treats a whitespace-only token as absent', async () => {
        const { hasGitHubToken } = await loadModule('   ');
        expect(hasGitHubToken).toBe(false);
    });
});
