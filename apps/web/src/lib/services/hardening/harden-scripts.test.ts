import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { utils } from 'ssh2';
import {
    assertPublicKey,
    assertUsername,
    buildAccessScript,
    buildCancelScript,
    buildClosePortScript,
    buildExtrasScript,
    buildRollbackNowScript,
    generatePassword,
    HardeningInputError,
} from './harden-scripts';

const dir = mkdtempSync(join(tmpdir(), 'termi-harden-'));
function shSyntaxOk(script: string) {
    const file = join(dir, `s${Math.random().toString(36).slice(2)}.sh`);
    writeFileSync(file, script);
    execFileSync('sh', ['-n', file]);
}

const key = utils.generateKeyPairSync('ed25519', { comment: 'termi' }).public.trim();
const base = {
    runId: 'abc123def456abc123def456',
    targetUser: 'termi-admin',
    createUser: true,
    newPassword: generatePassword(randomBytes),
    publicKeys: [key],
    disablePasswordLogin: true,
    permitRootLogin: 'no' as const,
    sshPort: 22,
    newPort: null as number | null,
    firewall: null as Parameters<typeof buildAccessScript>[0]['firewall'],
};

describe('input validation', () => {
    it('accepts ordinary usernames and refuses root and anything shell-ish', () => {
        expect(assertUsername('termi-admin')).toBe('termi-admin');
        for (const bad of [
            'root',
            'Admin',
            '1user',
            'a b',
            "x';rm -rf /;'",
            '$(id)',
            'a'.repeat(33),
            '',
        ]) {
            expect(() => assertUsername(bad)).toThrow(HardeningInputError);
        }
    });

    it('accepts real OpenSSH public keys and rejects injection attempts', () => {
        expect(assertPublicKey(`  ${key}  `)).toBe(key);
        expect(assertPublicKey('ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB user@laptop')).toContain(
            'user@laptop',
        );
        for (const bad of [
            'not a key',
            `${key} '; touch /tmp/pwned; '`,
            `${key} $(id)`,
            `${key}\nssh-ed25519 AAAA evil`,
            'command="rm -rf /" ssh-ed25519 AAAAC3Nza',
        ]) {
            expect(() => assertPublicKey(bad)).toThrow(HardeningInputError);
        }
    });

    it('generates strong passwords from a quote-free alphabet', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const pw = generatePassword(randomBytes);
            expect(pw).toMatch(/^[A-Za-z0-9]{28}$/);
            seen.add(pw);
        }
        expect(seen.size).toBe(200);
    });

    it('refuses to build a script from unvalidated values', () => {
        expect(() => buildAccessScript({ ...base, runId: '../../etc' })).toThrow(
            HardeningInputError,
        );
        expect(() => buildAccessScript({ ...base, newPassword: "pa'ss" })).toThrow(
            HardeningInputError,
        );
        expect(() => buildAccessScript({ ...base, publicKeys: [] })).toThrow(HardeningInputError);
        expect(() => buildCancelScript('x; reboot')).toThrow(HardeningInputError);
    });
});

describe('generated scripts', () => {
    it('are valid POSIX sh in every combination of options', () => {
        for (const createUser of [true, false])
            for (const disablePasswordLogin of [true, false])
                for (const newPassword of [base.newPassword, null])
                    shSyntaxOk(
                        buildAccessScript({
                            ...base,
                            createUser,
                            disablePasswordLogin,
                            newPassword,
                            targetUser: createUser ? 'termi-admin' : 'root',
                            permitRootLogin: createUser ? 'no' : 'prohibit-password',
                        }),
                    );
        shSyntaxOk(buildCancelScript(base.runId));
        shSyntaxOk(buildRollbackNowScript(base.runId));
        for (const family of ['debian', 'rhel', 'alpine', 'other'] as const)
            shSyntaxOk(
                buildExtrasScript({
                    runId: base.runId,
                    family,
                    fail2ban: true,
                    autoUpdates: true,
                    sshPort: 22,
                    ignoreIps: ['203.0.113.7', 'not-an-ip; rm'],
                }),
            );
    });

    it('arms the rollback before changing any account or sshd setting', () => {
        // Ignore the rollback script's own text (a heredoc written out, not run).
        const full = buildAccessScript(base);
        const s = full.replace(/<<'TERMI_ROLLBACK'[\s\S]*?\nTERMI_ROLLBACK\n/, '');
        const armed = s.indexOf('step rollback');
        expect(armed).toBeGreaterThan(0);
        for (const change of ['useradd', 'chpasswd', 'touch "$AK"', '> "$DROPIN"']) {
            expect(s.indexOf(change)).toBeGreaterThan(armed);
        }
        // sshd's config is validated before sshd is told to reload it.
        expect(s.indexOf('"$SSHD" -t')).toBeLessThan(s.lastIndexOf('kill -HUP'));
    });

    it('writes the settings the user chose', () => {
        expect(buildAccessScript(base)).toContain('PasswordAuthentication no');
        const keep = buildAccessScript({ ...base, disablePasswordLogin: false });
        expect(keep).toContain('PasswordAuthentication yes');
        expect(keep).not.toContain('KbdInteractiveAuthentication no');
        expect(
            buildAccessScript({ ...base, disablePasswordLogin: false, permitRootLogin: 'yes' }),
        ).toContain('PermitRootLogin yes');
        expect(
            buildAccessScript({
                ...base,
                targetUser: 'root',
                createUser: false,
                permitRootLogin: 'prohibit-password',
            }),
        ).toContain('PermitRootLogin prohibit-password');
    });

    it('only adds a sudoers entry for a user it creates', () => {
        const s = buildAccessScript(base);
        const createBlock = s.slice(s.indexOf('if [ "$CREATE" = "1" ]'), s.indexOf('step user'));
        expect(createBlock).toContain('/etc/sudoers.d/90-termi-');
    });

    it('never lets an unvalidated address into the fail2ban ignore list', () => {
        const s = buildExtrasScript({
            runId: base.runId,
            family: 'debian',
            fail2ban: true,
            autoUpdates: false,
            sshPort: 22,
            ignoreIps: ['203.0.113.7', 'x; rm -rf /'],
        });
        expect(s).toContain('ignoreip = 127.0.0.1/8 ::1 203.0.113.7');
        expect(s).not.toContain('rm -rf');
    });

    it('covers every firewall tool, mode and port combination as valid sh', () => {
        for (const tool of ['ufw', 'firewalld'] as const)
            for (const mode of ['enable', 'open-only'] as const)
                for (const newPort of [null, 2201])
                    shSyntaxOk(
                        buildAccessScript({
                            ...base,
                            newPort,
                            firewall: { mode, tool, allowPorts: [80, 443] },
                        }),
                    );
        for (const firewallTool of ['ufw', 'firewalld', null] as const)
            for (const oldPort of [22, 2200])
                shSyntaxOk(
                    buildClosePortScript({
                        runId: base.runId,
                        oldPort,
                        newPort: 2201,
                        firewallTool,
                    }),
                );
    });

    it('writes each undo hook before the change it undoes, and opens ports before enabling ufw', () => {
        const s = buildAccessScript({
            ...base,
            newPort: 2201,
            firewall: { mode: 'enable', tool: 'ufw', allowPorts: [80] },
        }).replace(/<<'TERMI_ROLLBACK'[\s\S]*?\nTERMI_ROLLBACK\n/, '');
        expect(s.indexOf('undo-20-firewall.sh')).toBeLessThan(s.indexOf('ufw allow'));
        // (The undo hook's text also mentions enable — the real command is the last one.)
        expect(s.indexOf('ufw allow')).toBeLessThan(s.lastIndexOf('ufw --force enable'));
        expect(s.indexOf('undo-10-selinux.sh')).toBeLessThan(s.indexOf('semanage port -a'));
        // Both ports while moving; every one of them allowed through the firewall.
        expect(s).toContain('Port 22\\nPort 2201');
        expect(s).toContain('for p in 22 2201 80;');
    });

    it('rejects ports that are out of range, privileged, or unchanged', () => {
        expect(() => buildAccessScript({ ...base, newPort: 80 })).toThrow(/1024 or higher/);
        expect(() => buildAccessScript({ ...base, sshPort: 2200, newPort: 2200 })).toThrow(
            /already the SSH port/,
        );
        expect(() => buildAccessScript({ ...base, newPort: 70000 })).toThrow(HardeningInputError);
        expect(() =>
            buildAccessScript({
                ...base,
                firewall: { mode: 'enable', tool: 'ufw', allowPorts: [0] },
            }),
        ).toThrow(HardeningInputError);
    });

    it('an explicit undo runs even after the timer was disarmed', () => {
        const s = buildRollbackNowScript(base.runId);
        expect(s.indexOf('rm -f "$B/CANCELLED"')).toBeGreaterThan(-1);
        expect(s.indexOf('rm -f "$B/CANCELLED"')).toBeLessThan(s.indexOf('sh "$B/rollback.sh"'));
    });

    it('matches systemd Listen output literally in the boot check (escaping survives the template)', () => {
        const access = buildAccessScript({ ...base, sshPort: 2200, newPort: 2201 });
        const close = buildClosePortScript({
            runId: base.runId,
            oldPort: 2200,
            newPort: 2201,
            firewallTool: null,
        });
        for (const script of [access, close]) {
            expect(script).toContain('\\(Stream\\)');
            expect(script).not.toMatch(/[^\\]\(Stream\)"/);
        }
        // And the pattern really matches what systemd prints.
        const listen = '0.0.0.0:2201 (Stream)\n[::]:2201 (Stream)';
        const out = execFileSync(
            'sh',
            ['-c', `printf '%s\\n' "$1" | grep -cE "(^|[]: ])2201 \\(Stream\\)"`, 'sh', listen],
            { encoding: 'utf8' },
        );
        expect(out.trim()).toBe('2');
    });

    it("opens only the new port in the server's own nftables/iptables firewall, and keeps it across reboots", () => {
        for (const tool of ['nftables', 'iptables'] as const) {
            const script = buildAccessScript({
                ...base,
                sshPort: 22,
                newPort: 2201,
                firewall: { mode: 'open-only', tool, allowPorts: [] },
            });
            shSyntaxOk(script);
            expect(script).toContain("FWP='2201'");
            // Persisted through the service that loads the rules at boot, never by editing them.
            expect(script).toContain('ExecStartPost=/bin/sh /etc/termi/ssh-port-');
            expect(script).not.toMatch(
                />\s*\/etc\/(nftables\.conf|iptables\/rules|sysconfig\/iptables)/,
            );
            // Undo hook written before the first rule is added.
            expect(script.indexOf('undo-20-firewall.sh')).toBeLessThan(
                script.indexOf('sh /etc/termi/ssh-port-'),
            );
        }
        // The nft comment keeps its escaped quotes through the template.
        const nft = buildAccessScript({
            ...base,
            newPort: 2201,
            firewall: { mode: 'open-only', tool: 'nftables', allowPorts: [] },
        });
        expect(nft).toContain('comment "\\"termi_ssh_$p\\""');
    });

    it('never turns on or replaces a hand-made firewall', () => {
        expect(() =>
            buildAccessScript({
                ...base,
                firewall: { mode: 'enable', tool: 'nftables', allowPorts: [80] },
            }),
        ).toThrow(/does not turn on or replace/);
    });
});
