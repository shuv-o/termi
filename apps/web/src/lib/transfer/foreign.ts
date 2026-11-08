/**
 * Importers for other tools' connection files: OpenSSH `~/.ssh/config`,
 * PuTTY / KiTTY sessions (`reg export` .reg files) and MobaXterm sessions
 * (.mxtsessions / .moba / MobaXterm.ini).
 *
 * Each turns its file into the same `ExportPayload` a Termi export produces,
 * so the import route's checks (SSRF on every host, limits, ownership) apply
 * unchanged, plus a list of notes for whatever could not be carried over —
 * key files on the user's disk, unsupported session types, proxy commands.
 * None of these formats contain usable passwords: PuTTY never stores them,
 * MobaXterm encrypts them with a machine key, and ssh_config has none.
 *
 * Like `import.ts`, everything here treats its input as hostile and is free
 * of I/O.
 */

import { Protocol } from '@/app/generated/prisma/client';
import { exportPayloadSchema, MAX_IMPORT_SERVERS, type ExportPayload } from './format';
import { InvalidFileError } from './import';

import type { ForeignFormat } from './detect';

export type { ForeignFormat };
export { detectFormat } from './detect';

export interface ForeignImport {
    payload: ExportPayload;
    /** Plain-language notes on what was skipped or needs attention. */
    notes: string[];
    /** Servers whose username was not in the file (filled with "root"). */
    defaultedUsername: string[];
}

interface Draft {
    name: string;
    host: string;
    port: number;
    protocol: Protocol;
    username?: string;
    groupName?: string;
    description?: string;
    /** The bastion, by reference: names may still change while deduplicating. */
    jump?: Draft;
}

const DEFAULT_USER = 'root';
const MAX_LINES = 50_000;

// ── Shared ──────────────────────────────────────────────────────────────────

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Validate drafts into a payload, with unique names and derived groups. */
function finish(drafts: Draft[], notes: string[]): ForeignImport {
    if (drafts.length === 0) {
        throw new InvalidFileError(
            notes.length
                ? `No servers could be imported. ${notes[0]}`
                : 'No servers found in the file.',
        );
    }
    if (drafts.length > MAX_IMPORT_SERVERS) {
        throw new InvalidFileError(`An import is limited to ${MAX_IMPORT_SERVERS} servers.`);
    }

    // Names must be unique within the file: jump references resolve by name.
    const used = new Set<string>();
    for (const d of drafts) {
        const base = clip(d.name.trim() || d.host, 100);
        let name = base;
        for (let n = 2; used.has(name); n++) name = clip(`${base} (${n})`, 100);
        used.add(name);
        d.name = name;
    }

    const defaultedUsername = drafts.filter((d) => !d.username).map((d) => d.name);
    if (defaultedUsername.length) {
        notes.push(
            `${count(defaultedUsername.length, 'server')} had no username in the file and will use "${DEFAULT_USER}" unless you pick a keychain login below.`,
        );
    }

    const parsed = exportPayloadSchema.safeParse({
        servers: drafts.map((d) => ({
            name: d.name,
            host: clip(d.host, 255),
            port: d.port,
            protocol: d.protocol,
            username: clip(d.username || DEFAULT_USER, 255),
            groupName: d.groupName ? clip(d.groupName, 100) : null,
            description: d.description ? clip(d.description, 500) : null,
            jumpServerName: d.jump?.name ?? null,
        })),
    });
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const row = typeof issue?.path[1] === 'number' ? drafts[issue.path[1]]?.name : undefined;
        throw new InvalidFileError(
            row
                ? `${row}: ${issue.message} (${issue.path.slice(2).join('.')})`
                : 'The file could not be read.',
        );
    }

    const groups = [...new Set(drafts.map((d) => d.groupName).filter((g): g is string => !!g))];
    return {
        payload: {
            servers: parsed.data.servers,
            groups: groups.map((name) => ({
                name: clip(name, 100),
                description: null,
                color: null,
                icon: null,
            })),
        },
        notes,
        defaultedUsername,
    };
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function validPort(value: string | number | undefined, fallback: number): number {
    const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

/** Split `[user@]host[:port]` (IPv6 in brackets). */
function splitTarget(spec: string): { user?: string; host: string; port?: number } {
    let rest = spec.trim();
    let user: string | undefined;
    const at = rest.lastIndexOf('@');
    if (at > 0) {
        user = rest.slice(0, at);
        rest = rest.slice(at + 1);
    }
    const v6 = rest.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (v6) return { user, host: v6[1], port: v6[2] ? validPort(v6[2], 22) : undefined };
    const m = rest.match(/^([^:]+):(\d+)$/);
    if (m) return { user, host: m[1], port: validPort(m[2], 22) };
    return { user, host: rest };
}

/**
 * Give `drafts` a bastion for `spec`: an existing entry with that host (or
 * alias) if there is one, otherwise a new SSH entry for it.
 */
function bastionFor(
    spec: { user?: string; host: string; port?: number },
    drafts: Draft[],
    aliases: Map<string, Draft>,
): Draft {
    const byAlias = aliases.get(spec.host);
    if (byAlias) return byAlias;
    const port = spec.port ?? 22;
    const existing = drafts.find(
        (d) =>
            d.protocol === 'SSH' &&
            d.host === spec.host &&
            d.port === port &&
            (!spec.user || d.username === spec.user),
    );
    if (existing) return existing;
    const created: Draft = {
        name: spec.host,
        host: spec.host,
        port,
        protocol: 'SSH',
        username: spec.user,
        description: 'Jump host (added by import)',
    };
    drafts.push(created);
    return created;
}

// ── OpenSSH config ──────────────────────────────────────────────────────────

/** Tokenise an ssh_config argument list, honouring double quotes. */
function sshArgs(s: string): string[] {
    const out: string[] = [];
    const re = /"([^"]*)"|(\S+)/g;
    let m;
    while ((m = re.exec(s))) out.push(m[1] ?? m[2]);
    return out;
}

/** ssh_config pattern match: `*` and `?` wildcards, case-insensitive. */
function globMatch(pattern: string, value: string): boolean {
    const re = new RegExp(
        '^' +
            pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.') +
            '$',
        'i',
    );
    return re.test(value);
}

interface SshBlock {
    patterns: string[]; // empty for a Match block: never applied
    options: [string, string[]][];
}

export function parseSshConfig(text: string): ForeignImport {
    const notes: string[] = [];
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines.length > MAX_LINES) throw new InvalidFileError('The file is too long.');

    // Options before the first Host line apply to every host.
    const blocks: SshBlock[] = [{ patterns: ['*'], options: [] }];
    let sawMatch = false;
    let sawInclude = false;

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const m = line.match(/^(\S+?)(?:\s*=\s*|\s+)(.*)$/);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const args = sshArgs(m[2]);
        if (key === 'host') {
            blocks.push({ patterns: args, options: [] });
        } else if (key === 'match') {
            sawMatch = true;
            blocks.push({ patterns: [], options: [] });
        } else if (key === 'include') {
            sawInclude = true;
        } else {
            blocks[blocks.length - 1].options.push([key, args]);
        }
    }

    const matches = (block: SshBlock, alias: string) => {
        const positive = block.patterns.filter((p) => !p.startsWith('!'));
        const negative = block.patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1));
        return (
            positive.some((p) => globMatch(p, alias)) && !negative.some((p) => globMatch(p, alias))
        );
    };

    // Each Host line names one server: its first pattern without wildcards.
    const concrete = blocks
        .slice(1)
        .map((b) => b.patterns.find((p) => !/[*?!]/.test(p)))
        .filter((a): a is string => !!a);
    const aliasesSeen = new Set<string>();

    const drafts: Draft[] = [];
    const aliases = new Map<string, Draft>();
    const jumps = new Map<Draft, string>();
    const keyFiles = new Set<string>();
    let proxyCommands = 0;
    let multiHop = 0;

    for (const alias of concrete) {
        if (aliasesSeen.has(alias)) continue;
        aliasesSeen.add(alias);

        // First value wins, as in ssh(1).
        const opts = new Map<string, string[]>();
        for (const block of blocks) {
            if (!matches(block, alias)) continue;
            for (const [k, v] of block.options) {
                if (k === 'identityfile') keyFiles.add(v.join(' '));
                else if (!opts.has(k)) opts.set(k, v);
            }
        }
        const hostName = (opts.get('hostname')?.[0] ?? alias).replace(/%h/g, alias);
        const draft: Draft = {
            name: alias,
            host: hostName,
            port: validPort(opts.get('port')?.[0], 22),
            protocol: 'SSH',
            username: opts.get('user')?.[0],
        };
        drafts.push(draft);
        aliases.set(alias, draft);

        const jump = opts.get('proxyjump')?.[0];
        if (jump && jump.toLowerCase() !== 'none') {
            const hops = jump.split(',');
            if (hops.length > 1) multiHop++;
            else jumps.set(draft, hops[0]);
        } else if (opts.has('proxycommand')) {
            proxyCommands++;
        }
    }

    for (const [draft, hop] of jumps) {
        draft.jump = bastionFor(splitTarget(hop), drafts, aliases);
    }

    if (keyFiles.size) {
        notes.push(
            `Key files can't be read from your computer (${[...keyFiles].slice(0, 3).join(', ')}${keyFiles.size > 3 ? ', …' : ''}). Pick a keychain login below or add the key to each server.`,
        );
    }
    if (proxyCommands) {
        notes.push(
            `${count(proxyCommands, 'server')} used ProxyCommand, which isn't supported; they will connect directly.`,
        );
    }
    if (multiHop) {
        notes.push(
            `${count(multiHop, 'server')} used a multi-hop ProxyJump; Termi supports one jump host, so they will connect directly.`,
        );
    }
    if (sawMatch) notes.push('"Match" blocks were ignored.');
    if (sawInclude)
        notes.push('"Include" lines were ignored: import each included file separately.');

    return finish(drafts, notes);
}

// ── PuTTY / KiTTY (.reg) ────────────────────────────────────────────────────

/** PuTTY escapes session names byte-wise as %XX. */
function decodePuttyName(name: string): string {
    try {
        return decodeURIComponent(name);
    } catch {
        return name.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
}

function regString(value: string): string | number | null {
    const s = value.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (s) return s[1].replace(/\\(.)/g, '$1');
    const d = value.match(/^dword:([0-9a-fA-F]{1,8})$/);
    if (d) return parseInt(d[1], 16);
    return null;
}

export function parsePuttyReg(text: string): ForeignImport {
    const notes: string[] = [];
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines.length > MAX_LINES) throw new InvalidFileError('The file is too long.');

    const sessions = new Map<string, Map<string, string | number>>();
    let current: Map<string, string | number> | null = null;
    for (const raw of lines) {
        const line = raw.trim();
        const section = line.match(/^\[HKEY_[^\]]*\\Sessions\\([^\]\\]+)\]$/i);
        if (section) {
            const name = decodePuttyName(section[1]);
            current = new Map();
            sessions.set(name, current);
            continue;
        }
        if (line.startsWith('[')) {
            current = null;
            continue;
        }
        const kv = current && line.match(/^"([^"]+)"=(.*)$/);
        if (kv && current) {
            const v = regString(kv[2]);
            if (v !== null) current.set(kv[1], v);
        }
    }
    if (sessions.size === 0) {
        throw new InvalidFileError(
            'No PuTTY sessions found. Export them on Windows with: reg export HKCU\\Software\\SimonTatham\\PuTTY\\Sessions putty.reg',
        );
    }

    const drafts: Draft[] = [];
    const skipped: string[] = [];
    let keys = 0;
    let proxies = 0;
    for (const [name, v] of sessions) {
        if (name === 'Default Settings') continue;
        const proto = String(v.get('Protocol') ?? 'ssh').toLowerCase();
        const protocol: Protocol | null =
            proto === 'ssh' ? 'SSH' : proto === 'telnet' ? 'TELNET' : null;
        const target = splitTarget(String(v.get('HostName') ?? ''));
        if (!protocol || !target.host) {
            skipped.push(`${name} (${protocol ? 'no host' : proto})`);
            continue;
        }
        const user = String(v.get('UserName') ?? '') || target.user;
        drafts.push({
            name,
            host: target.host,
            port: validPort(v.get('PortNumber'), protocol === 'SSH' ? 22 : 23),
            protocol,
            username: user || undefined,
        });
        if (v.get('PublicKeyFile')) keys++;
        if (Number(v.get('ProxyMethod') ?? 0) !== 0) proxies++;
    }

    if (skipped.length) {
        notes.push(
            `Skipped ${count(skipped.length, 'session')} Termi can't open: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ', …' : ''}.`,
        );
    }
    if (keys) {
        notes.push(
            `${count(keys, 'session')} used a .ppk key file, which can't be read from your computer. Pick a keychain login below or add the key to each server (convert .ppk with PuTTYgen → Export OpenSSH key).`,
        );
    }
    if (proxies) notes.push(`${count(proxies, 'session')} used a proxy, which isn't imported.`);
    return finish(drafts, notes);
}

// ── MobaXterm (.mxtsessions / .moba / MobaXterm.ini) ───────────────────────

/** Session types (first field of a session record) Termi can open. */
const MOBA_TYPES: Record<string, Protocol> = { '0': 'SSH', '4': 'RDP', '5': 'VNC', '7': 'SCP' };
/** MobaXterm's default icon per session kind — only used to name skipped sessions. */
const MOBA_ICONS: Record<string, string> = {
    '98': 'Telnet',
    '100': 'Rsh',
    '88': 'XDMCP',
    '130': 'FTP',
    '131': 'Serial',
    '84': 'File',
    '97': 'Shell',
    '313': 'Browser',
    '145': 'Mosh',
    '343': 'S3',
    '151': 'WSL',
};
const MOBA_DEFAULT_PORT: Record<Protocol, number> = {
    SSH: 22,
    SCP: 22,
    RDP: 3389,
    VNC: 5900,
    TELNET: 23,
};

const unMoba = (s: string) =>
    s
        .replace(/__DIEZE__/g, '#')
        .replace(/__PTVIRG__/g, ';')
        .replace(/__DBLQUO__/g, '"')
        .replace(/__PERCENT__/g, '%');

export function parseMobaXterm(text: string): ForeignImport {
    const notes: string[] = [];
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines.length > MAX_LINES) throw new InvalidFileError('The file is too long.');

    const drafts: Draft[] = [];
    const aliases = new Map<string, Draft>();
    const jumps = new Map<Draft, { user?: string; host: string; port?: number }>();
    const skipped = new Map<string, number>();
    let inBookmarks = false;
    let folder = '';
    let sawSection = false;

    for (const raw of lines) {
        const line = raw.trim();
        const section = line.match(/^\[(.+)\]$/);
        if (section) {
            sawSection = true;
            inBookmarks = /^Bookmarks(_\d+)?$/i.test(section[1]);
            folder = '';
            continue;
        }
        // A single-session .moba file has no section header.
        if (!inBookmarks && sawSection) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1);
        if (key === 'SubRep') {
            folder = value
                .split('\\')
                .map((s) => s.trim())
                .filter(Boolean)
                .join(' / ');
            continue;
        }
        if (key === 'ImgNum') continue;

        // value: [prefix]#<icon>#<fields>#<font fields>#<start>#<comment>#<color>
        const parts = value.split('#');
        if (parts.length < 3 || !/^\d+$/.test(parts[1] ?? '')) continue;
        const fields = parts[2].split('%');
        const type = fields[0];
        const protocol = MOBA_TYPES[type];
        if (!protocol) {
            const label = MOBA_ICONS[parts[1]] ?? 'other';
            skipped.set(label, (skipped.get(label) ?? 0) + 1);
            continue;
        }
        const host = (fields[1] ?? '').trim();
        if (!host) continue;
        const user = (fields[3] ?? '').trim();
        const draft: Draft = {
            name: key,
            host,
            port: validPort(fields[2], MOBA_DEFAULT_PORT[protocol]),
            protocol,
            username: protocol !== 'VNC' && user && user !== '<default>' ? user : undefined,
            groupName: folder || undefined,
            description: parts[5]?.trim() ? unMoba(parts[5].trim()) : undefined,
        };
        drafts.push(draft);
        aliases.set(key, draft);

        // SSH gateway (jump host) lists: fields 8/9/10, hops joined by __PIPE__.
        if (protocol === 'SSH' && fields[8]?.trim()) {
            const hosts = fields[8].split('__PIPE__');
            if (hosts.length === 1) {
                jumps.set(draft, {
                    host: hosts[0].trim(),
                    port: validPort(fields[9]?.split('__PIPE__')[0], 22),
                    user: fields[10]?.split('__PIPE__')[0]?.trim() || undefined,
                });
            } else {
                notes.push(
                    `${draft.name}: multi-hop SSH gateways aren't supported; it will connect directly.`,
                );
            }
        }
    }

    for (const [draft, spec] of jumps) draft.jump = bastionFor(spec, drafts, aliases);

    if (skipped.size) {
        notes.push(
            `Skipped sessions Termi can't open: ${[...skipped].map(([l, n]) => `${n} ${l}`).join(', ')}.`,
        );
    }
    notes.push(
        "MobaXterm encrypts saved passwords with a key on your PC, so they aren't imported. Pick a keychain login below or add credentials afterwards.",
    );
    return finish(drafts, notes);
}

export function parseForeign(format: ForeignFormat, text: string): ForeignImport {
    switch (format) {
        case 'ssh-config':
            return parseSshConfig(text);
        case 'putty':
            return parsePuttyReg(text);
        case 'mobaxterm':
            return parseMobaXterm(text);
    }
}
