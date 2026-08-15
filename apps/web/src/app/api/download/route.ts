import { NextRequest, NextResponse } from 'next/server';

import { errorResponse, notFoundResponse, successResponse } from '@/lib/api';
import { githubFetch } from '@/lib/github';

/**
 * Desktop download resolver.
 *
 * The landing page cannot query GitHub directly — the CSP in `proxy.ts` pins
 * `connect-src` to 'self' — so this route proxies the lookup and redirects to
 * the real asset. It also means the download links never go stale: each
 * release is discovered from the GitHub API rather than hardcoded.
 *
 *   GET /api/download                    → JSON: version + available builds
 *   GET /api/download?os=mac&arch=arm64  → 302 to the matching asset
 */

const GITHUB_LATEST_RELEASE = 'https://api.github.com/repos/shuv-o/termix/releases/latest';

/**
 * Cache the GitHub lookup. Releases change rarely, so this stays generous even
 * with a token — a new release appearing a couple of minutes late is harmless.
 */
const CACHE_TTL = { authenticated: 120, anonymous: 600 };

const OS_VALUES = ['mac', 'windows', 'linux'] as const;
const ARCH_VALUES = ['arm64', 'x64'] as const;

type OS = (typeof OS_VALUES)[number];
type Arch = (typeof ARCH_VALUES)[number];

/** Installer extension per platform. `.blockmap` siblings are never matched. */
const EXTENSION: Record<OS, string> = {
    mac: '.dmg',
    windows: '.exe',
    linux: '.appimage',
};

interface GitHubAsset {
    name: string;
    browser_download_url: string;
    size: number;
}

interface ReleaseInfo {
    version: string;
    publishedAt: string;
    htmlUrl: string;
    assets: GitHubAsset[];
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
    const res = await githubFetch(GITHUB_LATEST_RELEASE, CACHE_TTL);

    if (!res.ok) return null;

    const data = (await res.json()) as {
        tag_name?: string;
        published_at?: string;
        html_url?: string;
        assets?: GitHubAsset[];
    };

    if (!data.tag_name) return null;

    return {
        version: data.tag_name,
        publishedAt: data.published_at ?? '',
        htmlUrl: data.html_url ?? '',
        assets: data.assets ?? [],
    };
}

/**
 * Pick the installer for an OS/arch pair.
 *
 * electron-builder omits the arch suffix for the default x64 build
 * (`termix-1.0.4.dmg`) and appends it otherwise (`termix-1.0.4-arm64.dmg`), so
 * x64 is matched by the *absence* of an arm marker rather than its presence.
 */
function findAsset(assets: GitHubAsset[], os: OS, arch: Arch): GitHubAsset | null {
    const ext = EXTENSION[os];

    const candidates = assets.filter((a) => {
        const name = a.name.toLowerCase();
        if (name.endsWith('.blockmap')) return false;
        if (!name.endsWith(ext)) return false;

        const isArm = /arm64|aarch64/.test(name);
        return arch === 'arm64' ? isArm : !isArm;
    });

    return candidates[0] ?? null;
}

function parseParam<T extends string>(value: string | null, allowed: readonly T[]): T | null {
    if (!value) return null;
    const lower = value.toLowerCase() as T;
    return allowed.includes(lower) ? lower : null;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const osParam = searchParams.get('os');
    const archParam = searchParams.get('arch');

    let release: ReleaseInfo | null;
    try {
        release = await fetchLatestRelease();
    } catch {
        return errorResponse('Could not reach GitHub to resolve the latest release', 502);
    }

    if (!release) {
        return errorResponse('No published release found', 502);
    }

    // No params → metadata for the landing page: which builds actually exist,
    // so the UI never offers a download that 404s.
    if (!osParam && !archParam) {
        const builds = OS_VALUES.flatMap((os) =>
            ARCH_VALUES.map((arch) => {
                const asset = findAsset(release.assets, os, arch);
                return asset ? { os, arch, name: asset.name, size: asset.size } : null;
            }).filter((b): b is NonNullable<typeof b> => b !== null),
        );

        return successResponse({
            version: release.version,
            publishedAt: release.publishedAt,
            releaseUrl: release.htmlUrl,
            builds,
        });
    }

    const os = parseParam(osParam, OS_VALUES);
    const arch = parseParam(archParam, ARCH_VALUES);

    if (!os) return errorResponse(`os must be one of: ${OS_VALUES.join(', ')}`, 400);
    if (!arch) return errorResponse(`arch must be one of: ${ARCH_VALUES.join(', ')}`, 400);

    const asset = findAsset(release.assets, os, arch);
    if (!asset) {
        return notFoundResponse(`No ${os} ${arch} build in ${release.version}`);
    }

    return NextResponse.redirect(asset.browser_download_url, 302);
}
