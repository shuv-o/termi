/**
 * FIDO2 security keys as SSH keys.
 *
 * A key is enrolled with WebAuthn (relying party = Termi's own hostname) and
 * becomes an OpenSSH `sk-ecdsa-sha2-nistp256@openssh.com` public key whose
 * "application" is that hostname. Logging in, the gateway asks the browser for
 * a WebAuthn assertion over the SSH authentication data and sends it to the
 * server as a `webauthn-sk-ecdsa-sha2-nistp256@openssh.com` signature, which
 * OpenSSH (8.4+) verifies when sshd_config allows that algorithm:
 *
 *   PubkeyAcceptedAlgorithms +webauthn-sk-ecdsa-sha2-nistp256@openssh.com
 */

import { randomBytes } from 'crypto';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { convertCOSEtoPKCS } from '@simplewebauthn/server/helpers';

export const SK_KEY_TYPE = 'sk-ecdsa-sha2-nistp256@openssh.com';
export const SK_SIGNATURE_ALGORITHM = 'webauthn-sk-ecdsa-sha2-nistp256@openssh.com';
export const SSHD_CONFIG_LINE = `PubkeyAcceptedAlgorithms +${SK_SIGNATURE_ALGORITHM}`;

/** The relying party: Termi's own hostname and origin. */
export function skRelyingParty() {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:22080');
    return { rpID: url.hostname, origin: url.origin };
}

const sshString = (b: Buffer | string) => {
    const buf = typeof b === 'string' ? Buffer.from(b) : b;
    const len = Buffer.alloc(4);
    len.writeUInt32BE(buf.length);
    return Buffer.concat([len, buf]);
};

/** OpenSSH sk-ecdsa key blob for an uncompressed P-256 point. */
export function skPublicKeyBlob(point: Buffer, application: string): Buffer {
    if (point.length !== 65 || point[0] !== 0x04) throw new Error('Not an uncompressed P-256 key');
    return Buffer.concat([
        sshString(SK_KEY_TYPE),
        sshString('nistp256'),
        sshString(point),
        sshString(application),
    ]);
}

/** The line to put in authorized_keys. */
export function authorizedKeysLine(blobBase64: string, label: string): string {
    const comment = `termi-${label.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 40)}`;
    return `${SK_KEY_TYPE} ${blobBase64} ${comment}`;
}

export function creationOptions(user: { id: string; email: string }, existing: string[]) {
    const { rpID } = skRelyingParty();
    const challenge = randomBytes(32).toString('base64url');
    return {
        challenge,
        options: {
            challenge,
            rp: { id: rpID, name: 'Termi SSH' },
            user: {
                id: Buffer.from(`ssh:${user.id}`).toString('base64url'),
                name: user.email,
                displayName: `${user.email} (SSH)`,
            },
            // OpenSSH's webauthn signatures are ECDSA P-256 only.
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: { residentKey: 'discouraged', userVerification: 'discouraged' },
            excludeCredentials: existing.map((id) => ({ type: 'public-key', id })),
            attestation: 'none',
            timeout: 60_000,
        },
    };
}

/** Check a registration and return the key's id and OpenSSH blob. */
export async function verifyEnrollment(
    response: RegistrationResponseJSON,
    expectedChallenge: string,
) {
    const { rpID, origin } = skRelyingParty();
    const v = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        supportedAlgorithmIDs: [-7],
    });
    if (!v.verified || !v.registrationInfo)
        throw new Error('The security key could not be verified');
    const { credential } = v.registrationInfo;
    const point = Buffer.from(convertCOSEtoPKCS(credential.publicKey));
    return {
        credentialId: credential.id,
        publicKey: skPublicKeyBlob(point, rpID).toString('base64'),
        rpId: rpID,
    };
}
