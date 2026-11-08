import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CertificateError, certifiedKey, parseCertificate } from '../ssh-cert.js';

const hasKeygen = (() => {
    try {
        execFileSync('ssh-keygen', ['-?'], { stdio: 'ignore' });
        return true;
    } catch (e) {
        // ssh-keygen -? exits non-zero but exists; ENOENT means it's missing.
        return (e as NodeJS.ErrnoException).code !== 'ENOENT';
    }
})();

function makeCert(type: 'ed25519' | 'rsa') {
    const dir = mkdtempSync(path.join(tmpdir(), 'termi-cert-'));
    const keygen = (...args: string[]) => execFileSync('ssh-keygen', ['-q', ...args], { cwd: dir });
    keygen('-t', 'ed25519', '-N', '', '-f', 'ca');
    keygen('-t', type, '-N', '', '-f', 'user');
    keygen('-s', 'ca', '-I', 'test-user', '-n', 'root', 'user.pub');
    return {
        key: readFileSync(path.join(dir, 'user'), 'utf8'),
        cert: readFileSync(path.join(dir, 'user-cert.pub'), 'utf8'),
    };
}

describe.skipIf(!hasKeygen)('OpenSSH user certificates', () => {
    it('wraps a key with its certificate', () => {
        const { key, cert } = makeCert('ed25519');
        const k = certifiedKey(key, undefined, cert);
        expect(k.type).toBe('ssh-ed25519-cert-v01@openssh.com');
        expect(k.getPublicSSH().equals(parseCertificate(cert).blob)).toBe(true);
        expect(k.isPrivateKey()).toBe(true);
        expect(k.sign(Buffer.from('x'))).toBeInstanceOf(Buffer);
    });

    it('logs in with SHA-512 for RSA certificates', () => {
        const { key, cert } = makeCert('rsa');
        expect(certifiedKey(key, undefined, cert).type).toBe('rsa-sha2-512-cert-v01@openssh.com');
    });

    it('refuses a certificate issued for another key', () => {
        const a = makeCert('ed25519');
        const b = makeCert('ed25519');
        expect(() => certifiedKey(a.key, undefined, b.cert)).toThrow(
            /not issued for this private key/,
        );
    });

    it('refuses things that are not certificates', () => {
        const { key } = makeCert('ed25519');
        expect(() => certifiedKey(key, undefined, 'ssh-ed25519 AAAAC3Nz')).toThrow(
            CertificateError,
        );
        expect(() => parseCertificate('ssh-ed25519-cert-v01@openssh.com AAAA')).toThrow(
            CertificateError,
        );
    });
});
