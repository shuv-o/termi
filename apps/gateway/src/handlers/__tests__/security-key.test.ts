import { createSign, createVerify, generateKeyPairSync } from 'crypto';
import { describe, expect, it } from 'vitest';
import { derToRS, SK_SIGNATURE_ALGORITHM, webauthnSignatureBlob } from '../security-key.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const readString = (b: Buffer, p: number): [Buffer, number] => {
    const n = b.readUInt32BE(p);
    return [b.subarray(p + 4, p + 4 + n), p + 4 + n];
};

describe('security key signatures', () => {
    it('extracts r and s from DER exactly (they still verify)', () => {
        for (let i = 0; i < 50; i++) {
            const data = Buffer.from(`message ${i}`);
            const der = createSign('sha256').update(data).sign(privateKey);
            const { r, s } = derToRS(der);
            const pad = (x: Buffer) => {
                const t = x[0] === 0 ? x.subarray(1) : x;
                return Buffer.concat([Buffer.alloc(32 - t.length), t]);
            };
            const p1363 = Buffer.concat([pad(r), pad(s)]);
            expect(
                createVerify('sha256')
                    .update(data)
                    .verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, p1363),
            ).toBe(true);
        }
    });

    it('builds the OpenSSH webauthn-sk signature layout', () => {
        const authData = Buffer.alloc(37);
        authData[32] = 0x01; // user present
        authData.writeUInt32BE(42, 33);
        const clientData = JSON.stringify({
            type: 'webauthn.get',
            challenge: 'abc',
            origin: 'https://termi.example',
        });
        const der = createSign('sha256').update('x').sign(privateKey);
        const blob = webauthnSignatureBlob({
            authenticatorData: authData.toString('base64url'),
            clientDataJSON: Buffer.from(clientData).toString('base64url'),
            signature: der.toString('base64url'),
        });
        let p = 0;
        let field: Buffer;
        [field, p] = readString(blob, p);
        expect(field.toString()).toBe(SK_SIGNATURE_ALGORITHM);
        [field, p] = readString(blob, p); // mpint r, mpint s
        const [r, rest] = readString(field, 0);
        const [s] = readString(field, rest);
        expect(r[0] & 0x80).toBe(0); // positive mpints
        expect(s[0] & 0x80).toBe(0);
        expect(blob[p]).toBe(0x01);
        expect(blob.readUInt32BE(p + 1)).toBe(42);
        p += 5;
        [field, p] = readString(blob, p);
        expect(field.toString()).toBe('https://termi.example');
        [field, p] = readString(blob, p);
        expect(field.toString()).toBe(clientData);
        [field, p] = readString(blob, p);
        expect(field.length).toBe(0);
        expect(p).toBe(blob.length);
    });
});
