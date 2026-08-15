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
        <section className="py-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <Card className="relative overflow-hidden p-8 sm:p-10 bg-card border-border">
                    {/* Ambient glow, matching the hero treatment */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 bg-yellow-500/10 rounded-full blur-3xl"
                    />

                    <div className="relative flex flex-col md:flex-row items-center gap-8">
                        <div className="w-16 h-16 shrink-0 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                            <Star className="w-8 h-8 text-yellow-400" />
                        </div>

                        <div className="flex-1 text-center md:text-left">
                            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
                                Enjoying Termi? Star it on GitHub
                            </h2>
                            <p className="text-slate-400 max-w-xl">
                                Termix is free, open source and MIT licensed. A star costs you
                                nothing, helps other developers find the project, and keeps it
                                moving forward.
                            </p>
                            <p className="text-slate-500 text-sm max-w-xl mt-2">
                                Just want to bookmark it? A star is lighter than a fork — and
                                it&apos;s the only one that shows up in search and helps others find
                                Termix too.
                            </p>

                            {/* Hidden at zero — "0 stars" under a "please star
                                us" ask reads worse than no number at all. */}
                            {stats && stats.stars > 0 && (
                                <div className="mt-5 flex items-center justify-center md:justify-start gap-3 text-sm">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                        <Star className="w-3.5 h-3.5" />
                                        {formatCount(stats.stars)} stars
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 text-slate-300 border border-slate-500/20">
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
