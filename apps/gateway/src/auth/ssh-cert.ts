/**
 * OpenSSH user certificates for ssh2, which doesn't support them.
 *
 * A certificate login is a normal public-key login in which the server is
 * shown the certificate (`ssh-ed25519-cert-v01@openssh.com` …) instead of the
 * bare public key, while the signature is made by — and named after — the
 * underlying key (`ssh-ed25519`). ssh2 writes one algorithm name in both
 * places, so `certifiedKey` returns a key wrapper and `Protocol#authPK` is
 * overridden for those wrappers only; every other login is untouched.
 *
 * This file is identical in apps/gateway/src/auth/ssh-cert.ts and
 * apps/web/src/lib/security/ssh-cert.ts (a web test fails on drift). It
 * reaches into ssh2's protocol internals, pinned by package-lock.json; the
 * security e2e suite logs in with real certificates against OpenSSH.
 */

import Protocol from 'ssh2/lib/protocol/Protocol.js';
import protocolUtils from 'ssh2/lib/protocol/utils.js';
import protocolConstants from 'ssh2/lib/protocol/constants.js';
import ssh2, { type ParsedKey } from 'ssh2';

// Default import: ssh2 is CommonJS, and Node's ESM loader can't see `utils`
// as a named export.
const { utils } = ssh2;

const CERT = Symbol('termi.sshCertificate');

interface CertInfo {
    blob: Buffer;
    /** Algorithm named in the login request. */
    outerAlgo: string;
    /** Algorithm named inside the signature. */
    sigName: string;
    /** Key type, for ssh2's signature encoding. */
    baseType: string;
    /**
     * Keys whose signature is produced elsewhere (a FIDO2 security key, via
     * the browser): resolves to the complete signature blob for `data`.
     */
    signBlob?: (data: Buffer) => Promise<Buffer>;
}

const SUPPORTED: Record<
    string,
    { baseType: string; outerAlgo?: string; sigName?: string; hash?: string }
> = {
    'ssh-ed25519-cert-v01@openssh.com': { baseType: 'ssh-ed25519' },
    'ecdsa-sha2-nistp256-cert-v01@openssh.com': { baseType: 'ecdsa-sha2-nistp256' },
    'ecdsa-sha2-nistp384-cert-v01@openssh.com': { baseType: 'ecdsa-sha2-nistp384' },
    'ecdsa-sha2-nistp521-cert-v01@openssh.com': { baseType: 'ecdsa-sha2-nistp521' },
    // RSA always signs with SHA-512 (OpenSSH 7.8+); SHA-1 signatures are refused.
    'ssh-rsa-cert-v01@openssh.com': {
        baseType: 'ssh-rsa',
        outerAlgo: 'rsa-sha2-512-cert-v01@openssh.com',
        sigName: 'rsa-sha2-512',
        hash: 'sha512',
    },
};

export class CertificateError extends Error {}

function readString(buf: Buffer, offset: number): [Buffer, number] {
    if (offset + 4 > buf.length) throw new CertificateError('The certificate is truncated');
    const len = buf.readUInt32BE(offset);
    const end = offset + 4 + len;
    if (end > buf.length) throw new CertificateError('The certificate is truncated');
    return [buf.subarray(offset + 4, end), end];
}

/** Check a certificate line; returns its type. Throws CertificateError. */
export function parseCertificate(line: string): { type: string; blob: Buffer } {
    const [type, b64] = line.trim().split(/\s+/);
    if (!type || !b64 || !SUPPORTED[type]) {
        throw new CertificateError(
            'Not an OpenSSH user certificate (expected a line like "ssh-ed25519-cert-v01@openssh.com AAAA…")',
        );
    }
    const blob = Buffer.from(b64, 'base64');
    const [embedded] = readString(blob, 0);
    if (embedded.toString() !== type) throw new CertificateError('The certificate is malformed');
    return { type, blob };
}

/**
 * A private key that logs in with `certificate`. Throws CertificateError when
 * the certificate is unsupported or wasn't issued for this key.
 */
export function certifiedKey(
    privateKey: string,
    passphrase: string | null | undefined,
    certificate: string,
): ParsedKey {
    const parsed = utils.parseKey(privateKey, passphrase ?? undefined);
    if (parsed instanceof Error)
        throw new CertificateError(`Invalid private key: ${parsed.message}`);
    const key = Array.isArray(parsed) ? parsed[0] : parsed;
    const { type, blob } = parseCertificate(certificate);
    const info = SUPPORTED[type];

    // The certificate embeds the public key right after its type and nonce;
    // it must be this key's.
    const [, afterType] = readString(blob, 0);
    const [, afterNonce] = readString(blob, afterType);
    const pub = key.getPublicSSH();
    const [keyType, afterKeyType] = readString(pub, 0);
    const fields = pub.subarray(afterKeyType);
    if (
        keyType.toString() !== info.baseType ||
        !blob.subarray(afterNonce, afterNonce + fields.length).equals(fields)
    ) {
        throw new CertificateError('The certificate was not issued for this private key');
    }

    installAuthOverride();
    const outerAlgo = info.outerAlgo ?? type;
    const wrapped = Object.create(key) as ParsedKey & { [CERT]: CertInfo };
    Object.defineProperty(wrapped, 'type', { value: outerAlgo });
    wrapped.getPublicSSH = () => blob;
    wrapped.sign = (data: Buffer) => key.sign(data, info.hash);
    wrapped[CERT] = {
        blob,
        outerAlgo,
        sigName: info.sigName ?? info.baseType,
        baseType: info.baseType,
    };
    return wrapped;
}

/**
 * A login key whose signatures come from elsewhere (a FIDO2 security key via
 * the browser): `blob` is its public key, `algorithm` the login algorithm,
 * and `signBlob` returns the complete signature blob for the data to sign.
 */
export function remotelySignedKey(
    blob: Buffer,
    algorithm: string,
    signBlob: (data: Buffer) => Promise<Buffer>,
): ParsedKey {
    installAuthOverride();
    // ssh2 only accepts its own key objects; borrow one's shape.
    const base = placeholderKey();
    const wrapped = Object.create(base) as ParsedKey & { [CERT]: CertInfo };
    Object.defineProperty(wrapped, 'type', { value: algorithm });
    wrapped.getPublicSSH = () => blob;
    wrapped.sign = (() => new Error('signed remotely')) as unknown as ParsedKey['sign'];
    wrapped[CERT] = {
        blob,
        outerAlgo: algorithm,
        sigName: algorithm,
        baseType: algorithm,
        signBlob,
    };
    return wrapped;
}

let placeholder: ParsedKey | null = null;
function placeholderKey(): ParsedKey {
    if (!placeholder) {
        const pair = utils.generateKeyPairSync('ed25519');
        const parsed = utils.parseKey(pair.private);
        if (parsed instanceof Error) throw parsed;
        placeholder = Array.isArray(parsed) ? parsed[0] : parsed;
    }
    return placeholder as ParsedKey;
}

let installed = false;

function installAuthOverride(): void {
    if (installed) return;
    installed = true;
    const original = Protocol.prototype.authPK;
    Protocol.prototype.authPK = function (
        this: ProtocolInternals,
        username: string,
        pubKey: unknown,
        keyAlgo?: unknown,
        cbSign?: unknown,
    ) {
        const cert = (pubKey as { [CERT]?: CertInfo } | null)?.[CERT];
        if (!cert) return original.call(this, username, pubKey, keyAlgo, cbSign);
        const sign = (typeof keyAlgo === 'function' ? keyAlgo : cbSign) as SignCallback | undefined;
        return authPKCertificate(this, username, cert, sign);
    };
}

type SignCallback = (data: Buffer, done: (signature: Buffer) => void) => void;

interface ProtocolInternals {
    _kex: { sessionID: Buffer };
    _packetRW: {
        write: { alloc(n: number): Buffer; allocStart: number; finalize(b: Buffer): Buffer };
    };
    _authsQueue: string[];
    _debug?: (msg: string) => void;
}

/** ssh2's authPK (protocol/Protocol.js), with distinct outer and signature algorithm names. */
function authPKCertificate(
    proto: ProtocolInternals,
    username: string,
    cert: CertInfo,
    cbSign?: SignCallback,
): void {
    const { writeUInt32BE, sendPacket, convertSignature } = protocolUtils;
    const { MESSAGE } = protocolConstants;
    const keyAlgo = cert.outerAlgo;
    const pubKey = cert.blob;
    const userLen = Buffer.byteLength(username);
    const algoLen = Buffer.byteLength(keyAlgo);
    const pubKeyLen = pubKey.length;
    const sessionID = proto._kex.sessionID;
    const sesLen = sessionID.length;
    const payloadLen =
        (cbSign ? 4 + sesLen : 0) +
        1 +
        4 +
        userLen +
        4 +
        14 +
        4 +
        9 +
        1 +
        4 +
        algoLen +
        4 +
        pubKeyLen;
    let packet: Buffer;
    let p: number;
    if (cbSign) {
        packet = Buffer.allocUnsafe(payloadLen);
        p = 0;
        writeUInt32BE(packet, sesLen, p);
        packet.set(sessionID, (p += 4));
        p += sesLen;
    } else {
        packet = proto._packetRW.write.alloc(payloadLen);
        p = proto._packetRW.write.allocStart;
    }

    packet[p] = MESSAGE.USERAUTH_REQUEST;
    writeUInt32BE(packet, userLen, ++p);
    packet.write(username, (p += 4), userLen, 'utf8');
    writeUInt32BE(packet, 14, (p += userLen));
    packet.write('ssh-connection', (p += 4), 14, 'utf8');
    writeUInt32BE(packet, 9, (p += 14));
    packet.write('publickey', (p += 4), 9, 'utf8');
    packet[(p += 9)] = cbSign ? 1 : 0;
    writeUInt32BE(packet, algoLen, ++p);
    packet.write(keyAlgo, (p += 4), algoLen, 'utf8');
    writeUInt32BE(packet, pubKeyLen, (p += algoLen));
    packet.set(pubKey, (p += 4));

    if (!cbSign) {
        proto._authsQueue.push('publickey');
        proto._debug?.('Outbound: Sending USERAUTH_REQUEST (publickey certificate -- check)');
        sendPacket(proto, proto._packetRW.write.finalize(packet));
        return;
    }

    const send = (sigBlob: Buffer) => {
        const sigLen = sigBlob.length;
        p = proto._packetRW.write.allocStart;
        packet = proto._packetRW.write.alloc(
            1 + 4 + userLen + 4 + 14 + 4 + 9 + 1 + 4 + algoLen + 4 + pubKeyLen + 4 + sigLen,
        );
        packet[p] = MESSAGE.USERAUTH_REQUEST;
        writeUInt32BE(packet, userLen, ++p);
        packet.write(username, (p += 4), userLen, 'utf8');
        writeUInt32BE(packet, 14, (p += userLen));
        packet.write('ssh-connection', (p += 4), 14, 'utf8');
        writeUInt32BE(packet, 9, (p += 14));
        packet.write('publickey', (p += 4), 9, 'utf8');
        packet[(p += 9)] = 1;
        writeUInt32BE(packet, algoLen, ++p);
        packet.write(keyAlgo, (p += 4), algoLen, 'utf8');
        writeUInt32BE(packet, pubKeyLen, (p += algoLen));
        packet.set(pubKey, (p += 4));
        writeUInt32BE(packet, sigLen, (p += pubKeyLen));
        packet.set(sigBlob, (p += 4));
        proto._authsQueue.push('publickey');
        proto._debug?.('Outbound: Sending USERAUTH_REQUEST (publickey)');
        sendPacket(proto, proto._packetRW.write.finalize(packet));
    };

    if (cert.signBlob) {
        // Signed elsewhere (e.g. a security key in the browser). A refusal or
        // timeout sends an empty signature, which the server rejects, so the
        // login fails cleanly instead of hanging.
        const data = packet;
        cert.signBlob(data).then(send, () => send(Buffer.alloc(0)));
        return;
    }

    cbSign(packet, (raw) => {
        const signature = convertSignature(raw, cert.baseType);
        if (signature === false) throw new Error('Error while converting handshake signature');
        send(Buffer.concat([sshString(cert.sigName), sshString(signature)]));
    });
}

function sshString(b: Buffer | string): Buffer {
    const buf = typeof b === 'string' ? Buffer.from(b) : b;
    const len = Buffer.alloc(4);
    len.writeUInt32BE(buf.length);
    return Buffer.concat([len, buf]);
}
