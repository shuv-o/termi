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
};

describe('input validation', () => {
    it('accepts ordinary usernames and refuses root and anything shell-ish', () => {
        expect(assertUsername('termi-admin')).toBe('termi-admin');
        for (const bad of ['root', 'Admin', '1user', 'a b', "x';rm -rf /;'", '$(id)', 'a'.repeat(33), '']) {
            expect(() => assertUsername(bad)).toThrow(HardeningInputError);
        }
    });

    it('accepts real OpenSSH public keys and rejects injection attempts', () => {
        expect(assertPublicKey(`  ${key}  `)).toBe(key);
        expect(assertPublicKey('ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB user@laptop')).toContain('user@laptop');
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
        expect(() => buildAccessScript({ ...base, runId: '../../etc' })).toThrow(HardeningInputError);
        expect(() => buildAccessScript({ ...base, newPassword: "pa'ss" })).toThrow(HardeningInputError);
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
        expect(buildAccessScript({ ...base, targetUser: 'root', createUser: false, permitRootLogin: 'prohibit-password' })).toContain(
            'PermitRootLogin prohibit-password',
        );
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
});
