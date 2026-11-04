import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
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
});
