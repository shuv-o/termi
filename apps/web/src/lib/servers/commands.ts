/**
 * Commands people paste into their own terminal to reach a server without
 * Termi: `ssh`, `sftp` and an `~/.ssh/config` entry, with the jump host when
 * there is one. Pure, so the server details page and tests share them.
 *
 * Hosts, usernames and names are user data (and someone else's for a shared
 * server), so every value is either validated or shell-quoted: a pasted
 * command must never run anything but ssh/sftp.
 */

export interface SshTarget {
    host: string;
    port: number;
    username?: string | null;
    jump?: { host: string; port: number; username?: string | null } | null;
}

const DEFAULT_PORT = 22;

/** POSIX single-quoting, only when needed. */
export function shellQuote(value: string): string {
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

const isIPv6 = (host: string) => host.includes(':');
const bracket = (host: string) => (isIPv6(host) && !host.startsWith('[') ? `[${host}]` : host);

/** `user@host`, with the user left out when there is none. */
export function userAtHost(username: string | null | undefined, host: string): string {
    return username ? `${username}@${host}` : host;
}

/** `host:port`, bracketing IPv6 addresses. */
export function hostPort(host: string, port: number): string {
    return `${bracket(host)}:${port}`;
}

/** The `-J` / ProxyJump value: `user@host[:port]`. */
function jumpSpec(jump: NonNullable<SshTarget['jump']>): string {
    const host = jump.port === DEFAULT_PORT ? jump.host : hostPort(jump.host, jump.port);
    return userAtHost(jump.username, host);
}

export function sshCommand(t: SshTarget): string {
    const parts = ['ssh'];
    if (t.jump) parts.push('-J', shellQuote(jumpSpec(t.jump)));
    if (t.port !== DEFAULT_PORT) parts.push('-p', String(t.port));
    parts.push(shellQuote(userAtHost(t.username, t.host)));
    return parts.join(' ');
}

export function sftpCommand(t: SshTarget): string {
    const parts = ['sftp'];
    if (t.jump) parts.push('-J', shellQuote(jumpSpec(t.jump)));
    if (t.port !== DEFAULT_PORT) parts.push('-P', String(t.port));
    // sftp reads `host:path`, so an IPv6 address needs its brackets here.
    parts.push(shellQuote(userAtHost(t.username, bracket(t.host))));
    return parts.join(' ');
}

/** A `Host` alias ssh accepts: the server's name with anything unusual dropped. */
export function sshAlias(name: string): string {
    const alias = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63);
    return alias || 'server';
}

/** ssh_config values can't hold whitespace, quotes or `#` safely; leave those lines out. */
const configSafe = (v: string | null | undefined): v is string => !!v && /^[^\s"'#\\]+$/.test(v);

export function sshConfigEntry(name: string, t: SshTarget): string {
    const lines = [`Host ${sshAlias(name)}`];
    if (configSafe(t.host)) lines.push(`    HostName ${t.host}`);
    if (configSafe(t.username)) lines.push(`    User ${t.username}`);
    if (t.port !== DEFAULT_PORT) lines.push(`    Port ${t.port}`);
    if (t.jump && configSafe(t.jump.host) && (!t.jump.username || configSafe(t.jump.username))) {
        lines.push(`    ProxyJump ${jumpSpec(t.jump)}`);
    }
    return lines.join('\n') + '\n';
}
