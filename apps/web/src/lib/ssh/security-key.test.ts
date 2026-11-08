import { execFileSync } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { authorizedKeysLine, skPublicKeyBlob, SK_KEY_TYPE } from './security-key';

const hasKeygen = (() => {
    try {
        execFileSync('ssh-keygen', ['-?'], { stdio: 'ignore' });
        return true;
    } catch (e) {
        return (e as NodeJS.ErrnoException).code !== 'ENOENT';
    }
})();

function p256Point() {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    return Buffer.concat([
        Buffer.from([4]),
        Buffer.from(jwk.x!, 'base64url'),
        Buffer.from(jwk.y!, 'base64url'),
    ]);
}

describe('SSH security key public keys', () => {
    it('refuses anything but an uncompressed P-256 point', () => {
        expect(() => skPublicKeyBlob(Buffer.alloc(33), 'termi.run')).toThrow();
    });

    it.skipIf(!hasKeygen)('produce an authorized_keys line OpenSSH accepts', () => {
        const blob = skPublicKeyBlob(p256Point(), 'termi.example').toString('base64');
        const line = authorizedKeysLine(blob, 'My YubiKey #1');
        expect(line.startsWith(`${SK_KEY_TYPE} `)).toBe(true);
        expect(line.endsWith(' termi-My-YubiKey-1')).toBe(true);
        const file = path.join(mkdtempSync(path.join(tmpdir(), 'termi-sk-')), 'key.pub');
        writeFileSync(file, line + '\n');
        const out = execFileSync('ssh-keygen', ['-l', '-f', file]).toString();
        expect(out).toMatch(/^256 SHA256:\S+ termi-My-YubiKey-1 \(ECDSA-SK\)/);
    });
});
