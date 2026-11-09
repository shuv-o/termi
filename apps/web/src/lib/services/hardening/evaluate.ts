/**
 * Turns the raw output of the security scan (scan-script.ts) into a report:
 * a list of checks, each with a status, a plain-language explanation and the
 * fix, plus a 0–100 score.
 *
 * Pure: no I/O, so every rule here is unit-tested against real scan output.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';
export type Severity = 'high' | 'medium' | 'low';
export type CheckCategory = 'login' | 'ssh' | 'network' | 'updates' | 'accounts';

export interface SecurityCheck {
    id: string;
    category: CheckCategory;
    title: string;
    status: CheckStatus;
    severity: Severity;
    /** What was found, in plain words. */
    detail: string;
    /** What fixing it means. Shown for warn/fail. */
    fix?: string;
}

export interface ListeningPort {
    address: string;
    port: number;
    process: string | null;
    /** Bound to every interface, so reachable from outside unless firewalled. */
    public: boolean;
}

export interface SecurityReport {
    scannedAt: string;
    os: { id: string; name: string; family: 'debian' | 'rhel' | 'alpine' | 'other' };
    loginUser: string;
    privilege: 'root' | 'sudo' | 'none';
    /** 'effective' = sshd -T; 'files' = parsed config files (approximate). */
    sshConfigSource: 'effective' | 'files' | 'none';
    /** Some checks could not run without root or passwordless sudo. */
    limited: boolean;
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    checks: SecurityCheck[];
    ports: ListeningPort[];
    /** The port sshd listens on. */
    sshPort: number;
    /** The firewall the scan found active, if any. */
    firewall: 'ufw' | 'firewalld' | 'nftables' | 'iptables' | 'none' | 'unknown';
}

/** What Termi itself knows about how it logs in, from the stored server record. */
export interface ScanContext {
    authMethod: 'password' | 'key';
    now?: Date;
}

export class ScanOutputError extends Error {}

export interface RawScan {
    values: Map<string, string>;
    listen: string[];
}

export function parseScanOutput(output: string): RawScan {
    const values = new Map<string, string>();
    const listen: string[] = [];
    let started = false;
    let ended = false;

    for (const line of output.split(/\r?\n/)) {
        const i = line.indexOf('=');
        if (i <= 0) continue;
        const key = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim();
        if (key === 'TERMI_SCAN') started = true;
        else if (key === 'TERMI_SCAN_END') ended = true;
        else if (!started) continue;
        else if (key === 'listen') listen.push(value);
        else if (/^[a-z0-9_]+$/.test(key) && !values.has(key)) values.set(key, value);
    }

    if (!started) throw new ScanOutputError('The server did not return a scan result');
    if (!ended) throw new ScanOutputError('The scan did not finish');
    return { values, listen };
}

const WILDCARDS = new Set(['0.0.0.0', '*', '::', '[::]']);

export function parseListen(entries: string[]): ListeningPort[] {
    const seen = new Set<string>();
    const ports: ListeningPort[] = [];
    for (const entry of entries) {
        const [addrPort, process] = entry.split(/\s+/, 2);
        const at = addrPort.lastIndexOf(':');
        if (at < 0) continue;
        const address = addrPort.slice(0, at).replace(/%.*$/, '');
        const port = Number(addrPort.slice(at + 1));
        if (!Number.isInteger(port) || port <= 0) continue;
        const isPublic = WILDCARDS.has(address);
        // IPv4 and IPv6 listeners for the same service collapse into one row.
        const key = `${port}:${isPublic ? '*' : address}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ports.push({ address, port, process: process || null, public: isPublic });
    }
    return ports.sort((a, b) => a.port - b.port);
}

/** Services that should almost never face the internet directly. */
export const RISKY_PORTS: Record<number, string> = {
    21: 'FTP',
    23: 'Telnet',
    2375: 'Docker API (unencrypted)',
    3306: 'MySQL',
    5432: 'PostgreSQL',
    5984: 'CouchDB',
    6379: 'Redis',
    9200: 'Elasticsearch',
    11211: 'Memcached',
    27017: 'MongoDB',
};

/** OpenSSH defaults, used when the config files leave a setting unset. */
const SSHD_DEFAULTS: Record<string, string> = {
    port: '22',
    permitrootlogin: 'prohibit-password',
    passwordauthentication: 'yes',
    kbdinteractiveauthentication: 'yes',
    permitemptypasswords: 'no',
    maxauthtries: '6',
    logingracetime: '120',
    x11forwarding: 'no',
};

function sshd(raw: RawScan, key: string): string {
    const v = (raw.values.get(`sshd_${key}`) ?? '').toLowerCase().split(/\s+/)[0];
    if (v) return v;
    if (key === 'kbdinteractiveauthentication') {
        // Older configs spell it ChallengeResponseAuthentication.
        const legacy = (raw.values.get('sshd_challengeresponseauthentication') ?? '').toLowerCase();
        if (legacy) return legacy;
    }
    return SSHD_DEFAULTS[key] ?? '';
}

/** `LoginGraceTime` accepts 120, 2m, 1m30s … — normalise to seconds. */
function seconds(value: string): number {
    if (/^\d+$/.test(value)) return Number(value);
    let total = 0;
    for (const [, n, unit] of value.matchAll(/(\d+)([smhdw]?)/g)) {
        const mult = { '': 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[unit] ?? 1;
        total += Number(n) * mult;
    }
    return total;
}

export function evaluateScan(raw: RawScan, ctx: ScanContext): SecurityReport {
    const v = (k: string) => raw.values.get(k) ?? '';
    const privilege = (['root', 'sudo'].includes(v('priv')) ? v('priv') : 'none') as
        'root' | 'sudo' | 'none';
    const elevated = privilege !== 'none';
    const source = (
        ['effective', 'files'].includes(v('sshd_source')) ? v('sshd_source') : 'none'
    ) as 'effective' | 'files' | 'none';
    const haveSsh = source !== 'none';
    const checks: SecurityCheck[] = [];
    const add = (c: SecurityCheck) => checks.push(c);

    const osId = v('os_id').toLowerCase();
    const like = v('os_like').toLowerCase();
    const family: SecurityReport['os']['family'] =
        osId === 'alpine'
            ? 'alpine'
            : /debian|ubuntu/.test(`${osId} ${like}`)
              ? 'debian'
              : /rhel|fedora|centos|rocky|alma|amzn/.test(`${osId} ${like}`)
                ? 'rhel'
                : 'other';

    const passwordAuth = sshd(raw, 'passwordauthentication') === 'yes';
    const kbdAuth =
        sshd(raw, 'kbdinteractiveauthentication') === 'yes' && sshd(raw, 'usepam') !== 'no';
    add({
        id: 'password-login',
        category: 'login',
        title: 'Password logins',
        severity: 'high',
        status: !haveSsh ? 'unknown' : passwordAuth ? 'fail' : kbdAuth ? 'warn' : 'pass',
        detail: !haveSsh
            ? 'The SSH configuration could not be read.'
            : passwordAuth
              ? 'SSH accepts passwords, so bots can try to guess them around the clock.'
              : kbdAuth
                ? 'Plain password logins are off, but keyboard-interactive login is on and can still accept passwords through PAM.'
                : 'SSH only accepts keys, so passwords cannot be guessed over SSH.',
        fix: 'Switch to key-based login and turn off PasswordAuthentication and KbdInteractiveAuthentication.',
    });

    const rootLogin = sshd(raw, 'permitrootlogin');
    const rootKeyOnly = ['prohibit-password', 'without-password', 'forced-commands-only'].includes(
        rootLogin,
    );
    add({
        id: 'root-login',
        category: 'login',
        title: 'Root login over SSH',
        severity: 'high',
        status: !haveSsh ? 'unknown' : rootLogin === 'yes' ? 'fail' : rootKeyOnly ? 'warn' : 'pass',
        detail: !haveSsh
            ? 'The SSH configuration could not be read.'
            : rootLogin === 'yes'
              ? 'root can log in with a password. root is the first account every attacker tries.'
              : rootKeyOnly
                ? 'root can log in with a key, but not with a password.'
                : 'root cannot log in over SSH.',
        fix: 'Log in as a regular user with sudo, and set PermitRootLogin to no.',
    });

    add({
        id: 'empty-passwords',
        category: 'login',
        title: 'Empty passwords',
        severity: 'high',
        status: !haveSsh
            ? 'unknown'
            : sshd(raw, 'permitemptypasswords') === 'yes'
              ? 'fail'
              : 'pass',
        detail:
            sshd(raw, 'permitemptypasswords') === 'yes'
                ? 'SSH lets accounts with no password log in.'
                : 'Accounts without a password cannot log in over SSH.',
        fix: 'Set PermitEmptyPasswords to no.',
    });

    const f2b = v('fail2ban');
    const guard = v('sshguard') === 'active' || v('crowdsec') === 'active';
    const f2bActive = f2b === 'active' && v('fail2ban_sshd') !== 'no';
    add({
        id: 'bruteforce-protection',
        category: 'login',
        title: 'Brute-force protection',
        // Matters most while passwords are still accepted.
        severity: passwordAuth || kbdAuth ? 'high' : 'medium',
        status:
            f2bActive || guard ? 'pass' : f2b === 'active' || f2b === 'installed' ? 'warn' : 'fail',
        detail:
            f2bActive || guard
                ? `${guard && !f2bActive ? 'sshguard/CrowdSec' : 'fail2ban'} is blocking addresses that keep failing to log in.`
                : f2b === 'active'
                  ? 'fail2ban is running, but no jail is protecting SSH.'
                  : f2b === 'installed'
                    ? 'fail2ban is installed but not running.'
                    : 'Nothing bans addresses that keep failing to log in.',
        fix: 'Install and enable fail2ban with an sshd jail.',
    });

    if (ctx.authMethod === 'password') {
        add({
            id: 'termi-auth',
            category: 'login',
            title: 'How Termi logs in',
            severity: 'medium',
            status: 'warn',
            detail: 'Termi connects to this server with a password.',
            fix: 'Give Termi an SSH key for this server, so password logins can be turned off.',
        });
    }

    const loginUser = v('user');
    if (loginUser === 'root') {
        add({
            id: 'login-as-root',
            category: 'login',
            title: 'Logging in as root',
            severity: 'medium',
            status: 'warn',
            detail: 'Termi logs in as root, so any mistake in a session runs with full rights.',
            fix: 'Create a regular user with sudo and have Termi log in as that user.',
        });
    }

    const maxTries = Number(sshd(raw, 'maxauthtries')) || 6;
    add({
        id: 'max-auth-tries',
        category: 'ssh',
        title: 'Login attempts per connection',
        severity: 'low',
        status: !haveSsh ? 'unknown' : maxTries > 4 ? 'warn' : 'pass',
        detail: `Each connection gets ${maxTries} tries before it is dropped.`,
        fix: 'Set MaxAuthTries to 3.',
    });

    const grace = seconds(sshd(raw, 'logingracetime'));
    add({
        id: 'login-grace',
        category: 'ssh',
        title: 'Login timeout',
        severity: 'low',
        status: !haveSsh ? 'unknown' : grace === 0 || grace > 60 ? 'warn' : 'pass',
        detail:
            grace === 0
                ? 'Unauthenticated connections are never timed out.'
                : `Unauthenticated connections are kept open for ${grace} seconds.`,
        fix: 'Set LoginGraceTime to 30 seconds.',
    });

    const x11 = sshd(raw, 'x11forwarding') === 'yes';
    add({
        id: 'x11-forwarding',
        category: 'ssh',
        title: 'X11 forwarding',
        severity: 'low',
        status: !haveSsh ? 'unknown' : x11 ? 'warn' : 'pass',
        detail: x11
            ? 'X11 forwarding is on. Servers rarely need it, and it widens what a session can reach.'
            : 'X11 forwarding is off.',
        fix: 'Set X11Forwarding to no.',
    });

    const fw = v('firewall');
    add({
        id: 'firewall',
        category: 'network',
        title: 'Firewall',
        severity: 'medium',
        status: ['ufw', 'firewalld', 'nftables', 'iptables'].includes(fw)
            ? 'pass'
            : fw === 'none'
              ? 'fail'
              : 'unknown',
        detail: ['ufw', 'firewalld', 'nftables', 'iptables'].includes(fw)
            ? `${fw} is filtering incoming connections.`
            : fw === 'none'
              ? 'No firewall is filtering incoming connections, so every listening service is reachable.'
              : 'The firewall could not be checked without root or passwordless sudo.',
        fix: 'Enable ufw or firewalld, deny incoming by default, and allow only the ports you use.',
    });

    const ports = parseListen(raw.listen);
    const listenTool = v('listen_tool');
    const exposedRisky = ports.filter((p) => p.public && RISKY_PORTS[p.port]);
    const firewalled = ['ufw', 'firewalld', 'nftables', 'iptables'].includes(fw);
    add({
        id: 'exposed-services',
        category: 'network',
        title: 'Exposed services',
        severity: 'high',
        status:
            listenTool === 'none' || (!listenTool && ports.length === 0)
                ? 'unknown'
                : exposedRisky.length === 0
                  ? 'pass'
                  : firewalled
                    ? 'warn'
                    : 'fail',
        detail:
            listenTool === 'none' || (!listenTool && ports.length === 0)
                ? 'Listening ports could not be listed (neither ss nor netstat is installed).'
                : exposedRisky.length === 0
                  ? 'No databases or other sensitive services listen on public interfaces.'
                  : `${exposedRisky.map((p) => `${RISKY_PORTS[p.port]} (${p.port})`).join(', ')} ${exposedRisky.length === 1 ? 'listens' : 'listen'} on every interface${firewalled ? '. The firewall may block it — check its rules.' : ', with no firewall in front.'}`,
        fix: 'Bind these services to 127.0.0.1 or a private address, or block their ports in the firewall.',
    });

    const sshPort = Number(sshd(raw, 'port')) || 22;
    add({
        id: 'ssh-port',
        category: 'network',
        title: 'SSH port',
        severity: 'low',
        status: sshPort === 22 ? 'warn' : 'pass',
        detail:
            sshPort === 22
                ? 'SSH is on the default port 22, where automated scans hit first. Moving it cuts noise, but is not protection on its own.'
                : `SSH listens on port ${sshPort}.`,
        fix: 'Optionally move SSH to another port. Opt-in, because it can lock you out if a cloud firewall is not updated too.',
    });

    const au = v('autoupdates');
    add({
        id: 'auto-updates',
        category: 'updates',
        title: 'Automatic security updates',
        severity: 'medium',
        status: au === 'enabled' ? 'pass' : au === 'disabled' ? 'fail' : 'unknown',
        detail:
            au === 'enabled'
                ? 'Security updates install automatically.'
                : au === 'disabled'
                  ? 'Security updates only install when someone runs them by hand.'
                  : 'Could not tell how updates are installed on this system.',
        fix:
            family === 'rhel'
                ? 'Enable dnf-automatic for security updates.'
                : 'Enable unattended-upgrades for security updates.',
    });

    if (raw.values.has('updates_pending')) {
        const pending = Number(v('updates_pending')) || 0;
        const security = Number(v('updates_security')) || 0;
        add({
            id: 'pending-updates',
            category: 'updates',
            title: 'Pending updates',
            severity: security > 0 ? 'medium' : 'low',
            status: pending === 0 ? 'pass' : 'warn',
            detail:
                pending === 0
                    ? 'No updates are waiting, as of the last package list refresh.'
                    : `${pending} update${pending === 1 ? '' : 's'} waiting${security > 0 ? `, ${security} of them security fixes` : ''}.`,
            fix: 'Install pending updates.',
        });
    }

    if (v('reboot_required') === 'yes') {
        add({
            id: 'reboot-required',
            category: 'updates',
            title: 'Restart pending',
            severity: 'low',
            status: 'warn',
            detail: 'Updates are installed but only take effect after a restart.',
            fix: 'Restart the server at a convenient time.',
        });
    }

    const uid0 = v('uid0_extra').split(/\s+/).filter(Boolean);
    add({
        id: 'uid0-accounts',
        category: 'accounts',
        title: 'Accounts with root rights',
        severity: 'high',
        status: uid0.length > 0 ? 'fail' : 'pass',
        detail:
            uid0.length > 0
                ? `Besides root, ${uid0.join(', ')} ${uid0.length === 1 ? 'has' : 'have'} user ID 0 — full root rights under another name.`
                : 'Only root has root rights.',
        fix: 'Remove or re-number these accounts unless you know why they exist.',
    });

    if (elevated) {
        const empty = v('empty_passwords').split(/\s+/).filter(Boolean);
        add({
            id: 'empty-password-accounts',
            category: 'accounts',
            title: 'Accounts with no password',
            severity: 'high',
            status: empty.length > 0 ? 'fail' : 'pass',
            detail:
                empty.length > 0
                    ? `${empty.join(', ')} ${empty.length === 1 ? 'has' : 'have'} an empty password.`
                    : 'Every account has a password or is locked.',
            fix: 'Lock these accounts or give them a password.',
        });
    }

    const score = computeScore(checks);
    return {
        scannedAt: (ctx.now ?? new Date()).toISOString(),
        os: { id: osId, name: v('os_name') || v('kernel') || 'Unknown', family },
        loginUser,
        privilege,
        sshConfigSource: source,
        limited: !elevated,
        score,
        grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
        checks,
        ports,
        sshPort,
        firewall: (['ufw', 'firewalld', 'nftables', 'iptables', 'none'].includes(fw)
            ? fw
            : 'unknown') as SecurityReport['firewall'],
    };
}

/** Share of the remaining score each finding removes. */
const PENALTY: Record<CheckStatus, Record<Severity, number>> = {
    fail: { high: 0.3, medium: 0.15, low: 0.05 },
    warn: { high: 0.12, medium: 0.06, low: 0.02 },
    pass: { high: 0, medium: 0, low: 0 },
    unknown: { high: 0, medium: 0, low: 0 },
};

/**
 * 0–100. Penalties compound (each finding removes a share of what is left)
 * rather than subtract, so a fresh VPS does not simply bottom out at 0: one
 * with Redis exposed still scores visibly worse than one without. Unknowns
 * cost nothing, but are listed in the report.
 */
export function computeScore(checks: SecurityCheck[]): number {
    const kept = checks.reduce((acc, c) => acc * (1 - PENALTY[c.status][c.severity]), 1);
    return Math.round(100 * kept);
}
