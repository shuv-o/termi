import Link from 'next/link';
import { Star, GitFork, Github } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { githubFetch } from '@/lib/github';

/**
 * "Star us on GitHub" card for the landing page.
 *
 * Renders on the server so the star count can be fetched directly — the CSP in
 * `proxy.ts` pins `connect-src` to 'self', so the browser cannot call the
 * GitHub API itself (same constraint that `/api/download` works around).
 */

const GITHUB_REPO_API = 'https://api.github.com/repos/shuv-o/termi';
const GITHUB_REPO_URL = 'https://github.com/shuv-o/termi';

/**
 * How stale the star count may get.
 *
 * With a GITHUB_TOKEN the ceiling is 5000 req/h, so 30s is cheap and the count
 * is effectively live. Without one we share the 60 req/h anonymous limit, so
 * 300s (12 req/h per instance) leaves headroom to scale out.
 */
const CACHE_TTL = { authenticated: 30, anonymous: 300 };

interface RepoStats {
    stars: number;
    forks: number;
}

async function fetchRepoStats(): Promise<RepoStats | null> {
    try {
        const res = await githubFetch(GITHUB_REPO_API, CACHE_TTL);

        if (!res.ok) return null;

        const data = (await res.json()) as {
            stargazers_count?: number;
            forks_count?: number;
        };

        if (typeof data.stargazers_count !== 'number') return null;

        return {
            stars: data.stargazers_count,
            forks: data.forks_count ?? 0,
        };
    } catch {
        // Rate limit, network blip, offline build — the card still works
        // without the numbers, so never let this break the page.
        return null;
    }
}

/** 1200 → "1.2k". Keeps the badge narrow once the repo grows. */
function formatCount(value: number): string {
    if (value < 1000) return String(value);
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export default async function StarOnGitHub() {
    const stats = await fetchRepoStats();

    return (
        <section className="border-t border-border px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-6xl">
                <Card className="relative overflow-hidden p-6 sm:p-8">

                    <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-warning/25 bg-warning/10">
                            <Star className="h-6 w-6 text-warning" />
                        </div>

                        <div className="flex-1">
                            <h2 className="mb-2 text-xl font-semibold tracking-[-0.01em] sm:text-2xl">Enjoying Termi? Star it on GitHub</h2>
                            <p className="text-muted-foreground max-w-xl">
                                Termi is free, open source and MIT licensed. A star costs you
                                nothing, helps other developers find the project, and keeps it
                                moving forward.
                            </p>

                            {/* Hidden at zero — "0 stars" under a "please star
                                us" ask reads worse than no number at all. */}
                            {stats && stats.stars > 0 && (
                                <div className="mt-4 flex items-center gap-2 text-sm">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning/10 text-warning border border-warning/20">
                                        <Star className="w-3.5 h-3.5" />
                                        {formatCount(stats.stars)} stars
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-foreground/85 border border-border">
                                        <GitFork className="w-3.5 h-3.5" />
                                        {formatCount(stats.forks)} forks
                                    </span>
                                </div>
                            )}
                        </div>

                        <Button size="lg" asChild className="glow-hover shrink-0">
                            <Link href={GITHUB_REPO_URL} rel="noopener noreferrer" target="_blank">
                                <Github className="w-5 h-5 mr-1" />
                                Star on GitHub
                            </Link>
                        </Button>
                    </div>
                </Card>
            </div>
        </section>
    );
}
