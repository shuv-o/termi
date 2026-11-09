#!/usr/bin/env node
/**
 * Records how widely Termi is used, from public download counts only — Termi
 * itself sends nothing anywhere.
 *
 *   STATS_DIR=stats-data GITHUB_TOKEN=… node scripts/collect-stats.mjs
 *
 * Writes into STATS_DIR:
 *   history.json  one snapshot per day of the running totals
 *   traffic.json  GitHub's daily views and clones, kept past its 14-day window
 *   README.md     the latest figures and how they changed
 *
 * Run daily by .github/workflows/usage-stats.yml. Traffic needs a token with
 * push access to the repository; without one it is skipped, not fatal.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.env.STATS_REPO || 'shuv-o/termi';
const DOCKER_REPOS = (process.env.STATS_DOCKER_REPOS || 'shuvoo/termi-web,shuvoo/termi-gateway')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const DIR = process.env.STATS_DIR || 'stats-data';
const TOKEN = process.env.GITHUB_TOKEN || '';

const today = new Date().toISOString().slice(0, 10);

async function getJson(url, headers = {}) {
    const res = await fetch(url, {
        headers: { 'user-agent': 'termi-usage-stats', ...headers },
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return { json: await res.json(), headers: res.headers };
}

const github = (path) =>
    getJson(`https://api.github.com${path}`, {
        accept: 'application/vnd.github+json',
        ...(TOKEN && { authorization: `Bearer ${TOKEN}` }),
    });

/** Every release, following pagination. */
async function releases() {
    const all = [];
    for (let page = 1; page < 50; page++) {
        const { json } = await github(`/repos/${REPO}/releases?per_page=100&page=${page}`);
        all.push(...json);
        if (json.length < 100) break;
    }
    return all;
}

function platformOf(name) {
    const n = name.toLowerCase();
    const arm = /arm64|aarch64/.test(n);
    if (n.endsWith('.blockmap')) return null;
    if (n.endsWith('.dmg')) return arm ? 'macArm64' : 'macX64';
    if (n.endsWith('.exe')) return 'windows';
    if (n.endsWith('.appimage')) return arm ? 'linuxArm64' : 'linuxX64';
    return null;
}

async function desktop() {
    const installers = { total: 0, macX64: 0, macArm64: 0, windows: 0, linuxX64: 0, linuxArm64: 0 };
    let updateChecks = 0;
    const list = await releases();
    for (const r of list) {
        for (const a of r.assets) {
            const p = platformOf(a.name);
            if (p) {
                installers[p] += a.download_count;
                installers.total += a.download_count;
            } else if (/^latest.*\.yml$/.test(a.name)) {
                updateChecks += a.download_count;
            }
        }
    }
    const latest = list.find((r) => !r.draft && !r.prerelease);
    return { installers, updateChecks, latestRelease: latest?.tag_name ?? null };
}

async function docker() {
    const pulls = {};
    for (const repo of DOCKER_REPOS) {
        try {
            const { json } = await getJson(`https://hub.docker.com/v2/repositories/${repo}/`);
            pulls[repo] = json.pull_count ?? null;
        } catch (err) {
            console.warn(`Docker Hub ${repo}: ${err.message}`);
            pulls[repo] = null;
        }
    }
    return pulls;
}

async function repoStats() {
    const { json } = await github(`/repos/${REPO}`);
    return {
        stars: json.stargazers_count,
        forks: json.forks_count,
        watchers: json.subscribers_count,
        openIssues: json.open_issues_count,
    };
}

/** GitHub's daily views and clones (last 14 days), or null without access. */
async function traffic() {
    try {
        const [views, clones] = await Promise.all([
            github(`/repos/${REPO}/traffic/views`),
            github(`/repos/${REPO}/traffic/clones`),
        ]);
        const days = (list) =>
            Object.fromEntries(
                list.map((d) => [d.timestamp.slice(0, 10), { count: d.count, uniques: d.uniques }]),
            );
        return { views: days(views.json.views), clones: days(clones.json.clones) };
    } catch (err) {
        console.warn(
            `Traffic skipped (${err.message}). It needs a token with push access: set the STATS_TOKEN secret.`,
        );
        return null;
    }
}

function readJson(file, fallback) {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

/** The most recent snapshot at least `days` days before `date`. */
function snapshotBefore(history, date, days) {
    const cutoff = new Date(Date.parse(date) - days * 86_400_000).toISOString().slice(0, 10);
    return [...history].reverse().find((s) => s.date <= cutoff) ?? null;
}

function sumTraffic(byDay, date, days) {
    const from = new Date(Date.parse(date) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    let count = 0;
    let uniques = 0;
    for (const [d, v] of Object.entries(byDay)) {
        if (d >= from && d <= date) {
            count += v.count;
            uniques += v.uniques;
        }
    }
    return { count, uniques };
}

function summary(history, trafficData) {
    const now = history[history.length - 1];
    const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
    const delta = (pick, days) => {
        const then = snapshotBefore(history, now.date, days);
        const a = pick(now);
        const b = then && pick(then);
        if (a == null || b == null) return '—';
        const d = a - b;
        return d >= 0 ? `+${fmt(d)}` : fmt(d);
    };
    const rows = [
        ['Docker pulls, web', (s) => s.docker[DOCKER_REPOS[0]]],
        ['Docker pulls, gateway', (s) => s.docker[DOCKER_REPOS[1]]],
        ['Desktop installers downloaded', (s) => s.desktop.installers.total],
        ['…macOS Intel', (s) => s.desktop.installers.macX64],
        ['…macOS Apple Silicon', (s) => s.desktop.installers.macArm64],
        ['…Windows', (s) => s.desktop.installers.windows],
        ['…Linux x64', (s) => s.desktop.installers.linuxX64],
        ['…Linux arm64', (s) => s.desktop.installers.linuxArm64],
        ['Desktop update checks', (s) => s.desktop.updateChecks],
        ['GitHub stars', (s) => s.github.stars],
        ['GitHub forks', (s) => s.github.forks],
    ];
    const table = rows
        .map(
            ([label, pick]) =>
                `| ${label} | ${fmt(pick(now))} | ${delta(pick, 7)} | ${delta(pick, 30)} |`,
        )
        .join('\n');

    let trafficTable = 'Not collected yet (needs the `STATS_TOKEN` secret).';
    if (trafficData && Object.keys(trafficData.views).length) {
        const line = (label, byDay) => {
            const w = sumTraffic(byDay, now.date, 7);
            const m = sumTraffic(byDay, now.date, 30);
            return `| ${label} | ${fmt(w.count)} (${fmt(w.uniques)}) | ${fmt(m.count)} (${fmt(m.uniques)}) |`;
        };
        trafficTable = [
            '| | Last 7 days | Last 30 days |',
            '| --- | --- | --- |',
            line('Page views', trafficData.views),
            line('Clones', trafficData.clones),
            '',
            'In brackets: unique visitors (or cloners) per day, added up.',
        ].join('\n');
    }

    return `# Termi usage statistics

Updated ${now.date} from public download counts. Termi itself sends no data anywhere.
Latest release: ${now.desktop.latestRelease ?? '—'}

| | Total | Last 7 days | Last 30 days |
| --- | --- | --- | --- |
${table}

## GitHub traffic

${trafficTable}

## Reading these numbers

- **Docker pulls** count every pull, including upgrades and automated scanners, so real deployments are fewer.
- **Desktop update checks** are the closest thing to active desktop installs: each installed Windows or Linux app checks on launch and every 6 hours. Newer macOS apps check GitHub's API instead and aren't counted.
- **Clones** include every CI run, so they overstate interest; unique visitors are the better signal.

History: \`history.json\` (one snapshot per day), \`traffic.json\` (daily views and clones).
`;
}

async function main() {
    mkdirSync(DIR, { recursive: true });
    const historyFile = join(DIR, 'history.json');
    const trafficFile = join(DIR, 'traffic.json');

    const [dockerPulls, desk, gh, tr] = await Promise.all([
        docker(),
        desktop(),
        repoStats(),
        traffic(),
    ]);

    const history = readJson(historyFile, []).filter((s) => s.date !== today);
    history.push({ date: today, docker: dockerPulls, desktop: desk, github: gh });
    history.sort((a, b) => a.date.localeCompare(b.date));

    const trafficData = readJson(trafficFile, { views: {}, clones: {} });
    if (tr) {
        Object.assign(trafficData.views, tr.views);
        Object.assign(trafficData.clones, tr.clones);
    }

    writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n');
    writeFileSync(trafficFile, JSON.stringify(trafficData, null, 2) + '\n');
    writeFileSync(
        join(DIR, 'README.md'),
        summary(history, existsSync(trafficFile) ? trafficData : null),
    );
    console.log(`Recorded ${today}: ${JSON.stringify(history[history.length - 1])}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
