/**
 * FIDO2 security keys as SSH keys: turning a browser WebAuthn assertion into
 * the `webauthn-sk-ecdsa-sha2-nistp256@openssh.com` signature OpenSSH checks
 * (see OpenSSH PROTOCOL.u2f, "webauthn signatures"):
 *
 *   string  "webauthn-sk-ecdsa-sha2-nistp256@openssh.com"
 *   string  ecdsa_signature (mpint r, mpint s)
 *   byte    flags            (from the authenticator data)
 *   uint32  counter          (from the authenticator data)
 *   string  origin           (from the client data)
 *   string  clientData       (the client data JSON as signed)
 *   string  extensions       (empty)
 *
 * The browser's challenge is the SSH data to sign, so the client data carries
 * it (base64url) — sshd checks that, the type and the origin, and verifies
 * the signature over authenticatorData ‖ SHA-256(clientData), using
 * SHA-256(the key's application) as the rpIdHash.
 */

export const SK_SIGNATURE_ALGORITHM = 'webauthn-sk-ecdsa-sha2-nistp256@openssh.com';

export interface WebAuthnAssertion {
    authenticatorData: string; // base64url
    clientDataJSON: string; // base64url
    signature: string; // base64url, DER-encoded ECDSA
}

const sshString = (b: Buffer | string) => {
    const buf = typeof b === 'string' ? Buffer.from(b) : b;
    const len = Buffer.alloc(4);
    len.writeUInt32BE(buf.length);
    return Buffer.concat([len, buf]);
};

/** An SSH mpint (positive): minimal big-endian, with a 0x00 if the top bit is set. */
function mpint(raw: Buffer): Buffer {
    let i = 0;
    while (i < raw.length - 1 && raw[i] === 0) i++;
    let v = raw.subarray(i);
    if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
    return sshString(v);
}

/** r and s from a DER ECDSA signature: SEQUENCE { INTEGER r, INTEGER s }. */
export function derToRS(der: Buffer): { r: Buffer; s: Buffer } {
    let p = 0;
    const expect = (tag: number) => {
        if (der[p++] !== tag) throw new Error('Bad ECDSA signature');
    };
    const len = () => {
        let n = der[p++];
        if (n & 0x80) {
            const bytes = n & 0x7f;
            n = 0;
            for (let k = 0; k < bytes; k++) n = (n << 8) | der[p++];
        }
        return n;
    };
    expect(0x30);
    len();
    expect(0x02);
    const rl = len();
    const r = der.subarray(p, (p += rl));
    expect(0x02);
    const sl = len();
    const s = der.subarray(p, (p += sl));
    if (r.length === 0 || s.length === 0 || p > der.length) throw new Error('Bad ECDSA signature');
    return { r, s };
}

/** The OpenSSH webauthn-sk signature blob for a browser assertion. */
export function webauthnSignatureBlob(a: WebAuthnAssertion): Buffer {
    const authData = Buffer.from(a.authenticatorData, 'base64url');
    if (authData.length < 37) throw new Error('Bad authenticator data');
    const clientData = Buffer.from(a.clientDataJSON, 'base64url');
    const origin = String(JSON.parse(clientData.toString('utf8')).origin ?? '');
    const { r, s } = derToRS(Buffer.from(a.signature, 'base64url'));
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(authData.readUInt32BE(33));
    return Buffer.concat([
        sshString(SK_SIGNATURE_ALGORITHM),
        sshString(Buffer.concat([mpint(r), mpint(s)])),
        Buffer.from([authData[32]]),
        counter,
        sshString(origin),
        sshString(clientData),
        sshString(''),
    ]);
}
