import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { certificateField } from './certificate-field';

describe('ssh-cert', () => {
    it('is the same file the gateway uses', () => {
        const here = readFileSync(path.resolve(__dirname, 'ssh-cert.ts'), 'utf8');
        const gateway = readFileSync(
            path.resolve(__dirname, '../../../../gateway/src/auth/ssh-cert.ts'),
            'utf8',
        );
        expect(here).toBe(gateway);
    });

    it('accepts a certificate line, empty or null, and rejects anything else', () => {
        expect(certificateField.parse('')).toBeNull();
        expect(certificateField.parse(null)).toBeNull();
        expect(certificateField.parse(undefined)).toBeUndefined();
        expect(certificateField.safeParse('ssh-ed25519 AAAAC3Nz').success).toBe(false);
        expect(certificateField.safeParse('ssh-rsa-cert-v01@openssh.com AAAA').success).toBe(false);
    });
});
