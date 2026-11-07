#!/usr/bin/env node
// Dependency audit gate for CI.
//
// Runs `npm audit --omit=dev --json` and fails (exit 1) if any HIGH or
// CRITICAL advisory affects a production dependency, unless its GHSA id is in
// ALLOWLIST below. Moderate/low advisories and devDependencies are ignored here
// (Dependabot surfaces those).
//
// Every allowlist entry must name the GHSA id and say WHY it is safe to ship
// with — i.e. why the vulnerable code path is not reachable in production.
// Remove entries as soon as an upstream fix lands; stale entries are reported.
//
// No dependencies: Node built-ins only. Usage: node scripts/audit-gate.mjs

import { spawnSync } from 'node:child_process';

/** @type {Record<string, string>} GHSA id -> one-line justification */
const ALLOWLIST = {
  // deepmerge-ts (stack exhaustion when merging recursive object graphs).
  // Reached only via prisma -> @prisma/config, i.e. the Prisma CLI's config
  // loader, which merges our own static apps/web/prisma.config.ts at
  // generate/migrate time — never untrusted input, not on the request path.
  'GHSA-ggr8-5vv4-36mx': 'deepmerge-ts via Prisma CLI config loader only (prisma, @prisma/config); no untrusted input',
};

const BLOCKING = new Set(['high', 'critical']);

const res = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === 'win32',
});

let report;
try {
  report = JSON.parse(res.stdout);
} catch {
  console.error('audit-gate: could not parse `npm audit` output.');
  console.error(res.stderr || res.stdout);
  process.exit(2);
}
if (report.error) {
  console.error('audit-gate: npm audit failed:', JSON.stringify(report.error));
  process.exit(2);
}

const ghsaOf = (url) => (url && url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i)?.[0]) || null;

/** @type {Map<string, {severity: string, title: string, url: string, packages: Set<string>}>} */
const findings = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via === 'string') continue; // transitive pointer; the source entry is listed separately
    if (!BLOCKING.has(via.severity)) continue;
    const id = ghsaOf(via.url) ?? `npm-advisory-${via.source}`;
    const entry = findings.get(id) ?? { severity: via.severity, title: via.title, url: via.url, packages: new Set() };
    entry.packages.add(via.name ?? pkg);
    findings.set(id, entry);
  }
}

const blocking = [];
const allowed = [];
for (const [id, f] of findings) (ALLOWLIST[id] ? allowed : blocking).push([id, f]);

const fmt = ([id, f]) => `  ${f.severity.toUpperCase().padEnd(8)} ${id}  ${[...f.packages].join(', ')} — ${f.title}\n           ${f.url}`;

if (allowed.length) {
  console.log(`Allowlisted high/critical advisories (${allowed.length}):`);
  for (const a of allowed) console.log(fmt(a) + `\n           reason: ${ALLOWLIST[a[0]]}`);
}
const stale = Object.keys(ALLOWLIST).filter((id) => !findings.has(id));
if (stale.length) {
  console.log(`\nNote: allowlist entries no longer reported by npm audit (consider removing): ${stale.join(', ')}`);
}

if (blocking.length) {
  console.error(`\n::error::${blocking.length} unreviewed high/critical advisor${blocking.length === 1 ? 'y' : 'ies'} in production dependencies:`);
  for (const b of blocking) console.error(fmt(b));
  console.error('\nFix by upgrading/overriding the dependency, or — after review — add the GHSA id to ALLOWLIST in scripts/audit-gate.mjs with a justification.');
  process.exit(1);
}

console.log('\naudit-gate: OK — no unreviewed high/critical advisories in production dependencies.');
