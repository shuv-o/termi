/**
 * Shared helpers for the public GitHub REST API.
 *
 * Two places call GitHub: the desktop download resolver (`/api/download`) and
 * the landing page star card. Both are server-only — the CSP in `proxy.ts`
 * pins `connect-src` to 'self', so the browser cannot reach GitHub directly.
 *
 * SERVER ONLY. `GITHUB_TOKEN` is deliberately un-prefixed (no NEXT_PUBLIC_) so
 * Next.js will never inline it into a client bundle. Do not import this module
 * from a client component: the token would silently read as undefined there
 * and every request would quietly fall back to the anonymous rate limit.
 */

/**
 * Rate limits this token buys us, per IP:
 *   unauthenticated → 60 requests/hour
 *   authenticated   → 5000 requests/hour
 *
 * Optional. Termix reads only public repository metadata, so everything works
 * without it — a token just raises the ceiling, letting the caches use a
 * shorter TTL. Self-hosters are never required to supply one.
 *
 * If set, use a fine-grained token with NO scopes ("public repositories,
 * read-only"). Nothing here needs write access or private data.
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();

/** True when a token is configured. */
export const hasGitHubToken = Boolean(GITHUB_TOKEN);

/**
 * Cache TTLs in seconds for one endpoint, chosen by rate-limit headroom.
 *
 * Caches are per server instance, so the true request rate is
 * (3600 / ttl) x instance count. Keep `anonymous` slack enough that several
 * instances together stay under 60 req/h.
 */
export interface GitHubCacheTtl {
    /** Used when a valid token is configured (5000 req/h ceiling). */
    authenticated: number;
    /** Used with no token, or after a token is rejected (60 req/h ceiling). */
    anonymous: number;
}

/**
 * Headers for a GitHub API request.
 *
 * GitHub rejects API requests that omit a User-Agent, hence the explicit one.
 *
 * @param withAuth - attach the bearer token when one is configured
 */
function githubHeaders(withAuth: boolean): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'termix-web',
    };

    if (withAuth && GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }

    return headers;
}

/**
 * Fetch a GitHub API endpoint with caching, auth, and a safety net.
 *
 * The safety net matters: everything here works fine with no token at all, so
 * a *misconfigured* token must never be worse than none. GitHub answers 401 to
 * an expired or malformed token, which would otherwise turn a working download
 * page into a 502 the moment someone typos an env var. On 401 we retry once
 * anonymously — and at the anonymous TTL, since the shorter authenticated TTL
 * would blow straight through the 60 req/h limit and trade 401s for 403s.
 */
export async function githubFetch(url: string, ttl: GitHubCacheTtl): Promise<Response> {
    const res = await fetch(url, {
        headers: githubHeaders(hasGitHubToken),
        next: { revalidate: hasGitHubToken ? ttl.authenticated : ttl.anonymous },
    });

    if (res.status === 401 && hasGitHubToken) {
        console.warn(
            '[github] GITHUB_TOKEN was rejected (401); falling back to unauthenticated requests. Check the token is valid and not expired.',
        );

        return fetch(url, {
            headers: githubHeaders(false),
            next: { revalidate: ttl.anonymous },
        });
    }

    return res;
}
