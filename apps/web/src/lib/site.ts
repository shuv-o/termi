/**
 * The public URL of this deployment — for metadata that must be absolute
 * (Open Graph images, the sitemap, the canonical link, robots.txt).
 *
 * Termix is self-hosted: every instance runs on its own domain, configured via
 * `NEXT_PUBLIC_APP_URL` (see .env.example — the same variable OAuth, email
 * links, and push notifications already key off of). Hardcoding the
 * maintainer's own domain here would be wrong for every other deployment: a
 * self-hoster's pages would declare `termix.run` as their canonical URL,
 * which is actively harmful for their own SEO (it reads as duplicate content
 * of someone else's site). The fallback exists only for the case the env var
 * is unset — matching the project's default domain is still a better guess
 * than a GitHub repo URL, which was the bug this replaced.
 */
export function getSiteUrl(): string {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
    // Strip a trailing slash so callers can safely write `${getSiteUrl()}/path`
    // without risking a doubled slash.
    const base = configured || 'https://termix.run';
    return base.replace(/\/+$/, '');
}
