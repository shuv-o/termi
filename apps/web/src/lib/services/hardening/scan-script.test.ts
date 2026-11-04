import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SCAN_SCRIPT } from './scan-script';

describe('SCAN_SCRIPT', () => {
    it('is valid POSIX sh', () => {
        const dir = mkdtempSync(join(tmpdir(), 'termi-scan-'));
        const file = join(dir, 'scan.sh');
        writeFileSync(file, SCAN_SCRIPT);
        expect(() => execFileSync('sh', ['-n', file])).not.toThrow();
    });

    it('is read-only: no writes, installs, service changes or reboots', () => {
        const code = SCAN_SCRIPT.split('\n')
            .filter((l) => !l.trim().startsWith('#'))
            .join('\n');
        // Output redirection only ever goes to /dev/null.
        // (`>=` is an awk comparison, `>&` a descriptor duplication.)
        expect(code.match(/>(?![=&])\s*(?!\/dev\/null)\S+/g) ?? []).toEqual([]);
        for (const verb of [
            /\bapt(-get)?\s+(install|remove|upgrade(?!.*-s))/,
            /\bdnf\s+(install|remove|upgrade)/,
            /\bsystemctl\s+(start|stop|restart|enable|disable|reload)/,
            /\bufw\s+(enable|disable|allow|deny)/,
            // As commands — not as parts of paths like /etc/passwd or reboot-required.
            /(?<![\w/.-])(rm|mv|cp|tee|chmod|chown|useradd|passwd|reboot|shutdown)(?![\w/.-])/,
            /\bsed\s+-i/,
        ]) {
            expect(code).not.toMatch(verb);
        }
    });

    it('brackets its output with start/end markers', () => {
        expect(SCAN_SCRIPT).toContain('echo "TERMI_SCAN=1"');
        expect(SCAN_SCRIPT).toContain('echo "TERMI_SCAN_END=1"');
    });

    // A fake 'nft' that prints a captured ruleset, ahead of the real PATH.
    function firewallFor(fixture: string): string {
        const dir = mkdtempSync(join(tmpdir(), 'termi-nft-'));
        const ruleset = readFileSync(join(__dirname, '__fixtures__', `nft-${fixture}.txt`), 'utf8');
        writeFileSync(join(dir, 'ruleset'), ruleset);
        writeFileSync(join(dir, 'nft'), `#!/bin/sh\ncat '${join(dir, 'ruleset')}'\n`);
        chmodSync(join(dir, 'nft'), 0o755);
        const script = join(dir, 'scan.sh');
        writeFileSync(script, SCAN_SCRIPT);
        const out = execFileSync('sh', [script], {
            env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
            encoding: 'utf8',
        });
        return out.match(/^firewall=(.*)$/m)?.[1] ?? '';
    }

    it('does not mistake Docker/libvirt forward-chain drops for a firewall', () => {
        expect(firewallFor('docker')).not.toBe('nftables');
        expect(firewallFor('debian-default')).not.toBe('nftables');
    });

    it('recognises a real nftables firewall, including rules in a jumped-to chain', () => {
        expect(firewallFor('real-policy')).toBe('nftables');
        expect(firewallFor('real-jump')).toBe('nftables');
    });
});
