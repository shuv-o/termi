import { describe, it, expect } from 'vitest';
import {
    computeScore,
    evaluateScan,
    parseListen,
    parseScanOutput,
    ScanOutputError,
} from './evaluate';

// Captured from a stock Ubuntu 24.04 container (openssh-server, ufw, fail2ban
// installed) scanned as a user with passwordless sudo.
const UBUNTU_SUDO = `
noise from a login banner
TERMI_SCAN=1
uid=1001
user=deploy
priv=sudo
os_id=ubuntu
os_like=debian
os_name=Ubuntu 24.04.5 LTS
sshd_source=effective
sshd_port=22
sshd_permitrootlogin=without-password
sshd_passwordauthentication=yes
sshd_kbdinteractiveauthentication=no
sshd_permitemptypasswords=no
sshd_usepam=yes
sshd_maxauthtries=6
sshd_logingracetime=120
sshd_x11forwarding=yes
fail2ban=installed
firewall=ufw
updates_pending=1
updates_security=1
autoupdates=enabled
listen=0.0.0.0:22 sshd
listen=0.0.0.0:8080 python3
listen=[::]:22 sshd
listen_tool=ss
uid0_extra=
empty_passwords=
authorized_keys=no
TERMI_SCAN_END=1
`;

// A freshly provisioned box: root with a password, nothing hardened, Redis open.
const FRESH_ROOT = `TERMI_SCAN=1
uid=0
user=root
priv=root
os_id=debian
os_name=Debian GNU/Linux 12 (bookworm)
sshd_source=effective
sshd_port=22
sshd_permitrootlogin=yes
sshd_passwordauthentication=yes
sshd_permitemptypasswords=no
sshd_maxauthtries=6
sshd_logingracetime=2m
fail2ban=absent
firewall=none
autoupdates=disabled
listen=0.0.0.0:22 sshd
listen=0.0.0.0:6379 redis-server
listen=127.0.0.1:5432 postgres
listen_tool=ss
uid0_extra=toor
empty_passwords=
TERMI_SCAN_END=1
`;

// A well-hardened server, scanned without root.
const HARDENED_USER = `TERMI_SCAN=1
uid=1000
user=ops
priv=none
os_id=rocky
os_like=rhel centos fedora
sshd_source=files
sshd_port=2222
sshd_permitrootlogin=no
sshd_passwordauthentication=no
sshd_kbdinteractiveauthentication=no
sshd_maxauthtries=3
sshd_logingracetime=30
sshd_x11forwarding=no
fail2ban=active
firewall=unknown
autoupdates=enabled
updates_pending=0
listen_tool=ss
listen=0.0.0.0:2222 
TERMI_SCAN_END=1
`;

const byId = (r: ReturnType<typeof evaluateScan>, id: string) => r.checks.find((c) => c.id === id);

describe('parseScanOutput', () => {
    it('ignores anything printed before the scan marker (login banners, motd)', () => {
        const raw = parseScanOutput(UBUNTU_SUDO);
        expect(raw.values.get('user')).toBe('deploy');
        expect(raw.values.has('noise from a login banner')).toBe(false);
        expect(raw.listen).toHaveLength(3);
    });

    it('rejects output that never started or never finished', () => {
        expect(() => parseScanOutput('sh: not found')).toThrow(ScanOutputError);
        expect(() => parseScanOutput('TERMI_SCAN=1\nuser=x\n')).toThrow(/did not finish/);
    });
});

describe('parseListen', () => {
    it('collapses IPv4/IPv6 twins and marks wildcard binds as public', () => {
        const ports = parseListen(['0.0.0.0:22 sshd', '[::]:22 sshd', '127.0.0.1:5432 postgres']);
        expect(ports).toEqual([
            { address: '0.0.0.0', port: 22, process: 'sshd', public: true },
            { address: '127.0.0.1', port: 5432, process: 'postgres', public: false },
        ]);
    });
});

describe('evaluateScan', () => {
    it('flags a fresh root/password box as failing, and scores it low', () => {
        const r = evaluateScan(parseScanOutput(FRESH_ROOT), { authMethod: 'password' });
        expect(byId(r, 'password-login')?.status).toBe('fail');
        expect(byId(r, 'root-login')?.status).toBe('fail');
        expect(byId(r, 'bruteforce-protection')).toMatchObject({
            status: 'fail',
            severity: 'high',
        });
        expect(byId(r, 'firewall')?.status).toBe('fail');
        expect(byId(r, 'auto-updates')?.status).toBe('fail');
        expect(byId(r, 'uid0-accounts')?.detail).toContain('toor');
        expect(byId(r, 'login-as-root')?.status).toBe('warn');
        expect(byId(r, 'termi-auth')?.status).toBe('warn');
        // Redis on every interface with no firewall; Postgres on loopback is fine.
        const exposed = byId(r, 'exposed-services');
        expect(exposed?.status).toBe('fail');
        expect(exposed?.detail).toContain('Redis (6379)');
        expect(exposed?.detail).not.toContain('PostgreSQL');
        // "2m" is parsed as 120 seconds.
        expect(byId(r, 'login-grace')?.detail).toContain('120 seconds');
        expect(r.grade).toBe('F');
        expect(r.limited).toBe(false);
    });

    it('reads real Ubuntu output: key-only root is a warning, an idle fail2ban is a warning', () => {
        const r = evaluateScan(parseScanOutput(UBUNTU_SUDO), { authMethod: 'key' });
        expect(byId(r, 'root-login')?.status).toBe('warn'); // without-password
        expect(byId(r, 'password-login')?.status).toBe('fail');
        expect(byId(r, 'bruteforce-protection')?.status).toBe('warn');
        expect(byId(r, 'firewall')?.status).toBe('pass');
        expect(byId(r, 'pending-updates')?.detail).toContain('1 of them security');
        expect(byId(r, 'termi-auth')).toBeUndefined();
        expect(r.os.family).toBe('debian');
        expect(r.privilege).toBe('sudo');
    });

    it('scores a hardened server highly, and is honest about what it could not see', () => {
        const r = evaluateScan(parseScanOutput(HARDENED_USER), { authMethod: 'key' });
        expect(r.checks.filter((c) => c.status === 'fail')).toEqual([]);
        expect(byId(r, 'firewall')?.status).toBe('unknown');
        expect(byId(r, 'ssh-port')?.status).toBe('pass');
        expect(byId(r, 'empty-password-accounts')).toBeUndefined(); // needs root
        expect(r.limited).toBe(true);
        expect(r.os.family).toBe('rhel');
        expect(r.grade).toBe('A');
    });

    it('treats keyboard-interactive via PAM as a password path', () => {
        const out = FRESH_ROOT.replace(
            'sshd_passwordauthentication=yes',
            'sshd_passwordauthentication=no',
        );
        // No kbd setting given: OpenSSH's default is yes, and UsePAM defaults on.
        const r = evaluateScan(parseScanOutput(out), { authMethod: 'key' });
        expect(byId(r, 'password-login')?.status).toBe('warn');
    });

    it('reports the SSH checks as unknown when no config could be read', () => {
        const out = `TERMI_SCAN=1\npriv=none\nsshd_source=none\nfirewall=unknown\nlisten_tool=none\nTERMI_SCAN_END=1\n`;
        const r = evaluateScan(parseScanOutput(out), { authMethod: 'key' });
        expect(byId(r, 'password-login')?.status).toBe('unknown');
        expect(byId(r, 'exposed-services')?.status).toBe('unknown');
    });
});

describe('computeScore', () => {
    const check = {
        id: 'x',
        category: 'login' as const,
        title: '',
        detail: '',
        severity: 'high' as const,
    };

    it('stays within 0–100 and ignores unknowns', () => {
        expect(computeScore([])).toBe(100);
        expect(computeScore([{ ...check, status: 'unknown' }])).toBe(100);
        const many = computeScore(Array(20).fill({ ...check, status: 'fail' }));
        expect(many).toBeGreaterThanOrEqual(0);
        expect(many).toBeLessThan(5);
    });

    it('keeps telling bad servers apart instead of bottoming out', () => {
        const fresh = evaluateScan(parseScanOutput(FRESH_ROOT), { authMethod: 'password' });
        const withoutRedis = evaluateScan(
            parseScanOutput(FRESH_ROOT.replace('listen=0.0.0.0:6379 redis-server\n', '')),
            { authMethod: 'password' },
        );
        expect(fresh.score).toBeGreaterThan(0);
        expect(withoutRedis.score).toBeGreaterThan(fresh.score);
    });
});
