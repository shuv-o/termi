/**
 * SSH host key pinning — Termi's `known_hosts`.
 *
 * Every SSH connection (web services and the gateway) verifies the server's
 * host key against the fingerprint pinned on its `Server` row. The first key
 * seen is pinned (trust on first use); a different key afterwards is refused
 * until the owner reviews and trusts it. Mirrored by
 * `apps/gateway/src/auth/host-key.ts` — keep the two in step.
 *
 * Both sides must offer the SAME host-key algorithm list in the same order:
 * the negotiated key type depends on it, and a server with an ed25519 and an
 * ECDSA key would otherwise show a different fingerprint to each side.
 */

import { createHash } from 'crypto';
import type { Client, ConnectConfig, ServerHostKeyAlgorithm } from 'ssh2';

export const HOST_KEY_ALGORITHMS: ServerHostKeyAlgorithm[] = [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
    'ssh-rsa',
    'ssh-dss',
];

export const HOST_KEY_MISMATCH = 'HOST_KEY_MISMATCH';

/** OpenSSH-style fingerprint of a raw host key blob: `SHA256:<base64, no padding>`. */
export function fingerprintOf(key: Buffer): string {
    return 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
}

/** The key type named inside a host key blob (`ssh-ed25519`, `ecdsa-sha2-nistp256`, …). */
export function keyTypeOf(key: Buffer): string {
    if (key.length < 4) return 'unknown';
    const len = key.readUInt32BE(0);
    if (len < 1 || len > 64 || key.length < 4 + len) return 'unknown';
    return key.subarray(4, 4 + len).toString('ascii');
}

/** A server's pinned key, as handed to `connectSSH`. */
export interface HostKeyPin {
    serverId: string;
    /** `null` until the first connection pins it. */
    fingerprint: string | null;
}

export const pinOf = (server: { id: string; hostKeyFingerprint?: string | null }): HostKeyPin => ({
    serverId: server.id,
    fingerprint: server.hostKeyFingerprint ?? null,
});

export class HostKeyMismatchError extends Error {
    readonly code = HOST_KEY_MISMATCH;
    constructor(
        readonly label: string,
        readonly expected: string,
        readonly actual: string,
    ) {
        super(
            `The host key of ${label} has changed (expected ${expected}, got ${actual}). ` +
                'Someone may be intercepting the connection, so Termi refused to connect. ' +
                "If the server was reinstalled or its keys were regenerated, review the new key in the server's settings and trust it.",
        );
        this.name = 'HostKeyMismatchError';
    }
}

/** What a verifier does when there is no pin yet. */
export type PinFirstKey = (
    serverId: string,
    fingerprint: string,
    keyType: string,
) => Promise<string>; // resolves to the fingerprint now stored

/**
 * Configure `cc` to verify the host key against `pin`, and make the handshake
 * failure that follows a refusal surface as a `HostKeyMismatchError` message
 * (ssh2 itself only says "Host denied (verification failed)").
 */
export function applyHostKeyCheck(
    client: Client,
    cc: ConnectConfig,
    pin: HostKeyPin,
    label: string,
    pinFirst: PinFirstKey,
    onMismatch?: (err: HostKeyMismatchError) => void,
): void {
    let mismatch: HostKeyMismatchError | null = null;
    let failure: Error | null = null;

    cc.algorithms = { ...cc.algorithms, serverHostKey: HOST_KEY_ALGORITHMS };
    cc.hostVerifier = (key: Buffer, verify: (ok: boolean) => void) => {
        const actual = fingerprintOf(key);
        const refuse = (expected: string) => {
            mismatch = new HostKeyMismatchError(label, expected, actual);
            onMismatch?.(mismatch);
            verify(false);
        };
        if (pin.fingerprint) {
            if (actual === pin.fingerprint) verify(true);
            else refuse(pin.fingerprint);
            return;
        }
        pinFirst(pin.serverId, actual, keyTypeOf(key)).then(
            (stored) => {
                if (stored === actual) {
                    pin.fingerprint = actual;
                    verify(true);
                } else refuse(stored);
            },
            (err: Error) => {
                failure = new Error(`Could not record the host key of ${label}: ${err.message}`);
                verify(false);
            },
        );
    };

    client.prependListener('error', (err: Error & { code?: unknown }) => {
        const replacement = mismatch ?? failure;
        if (!replacement || err === replacement) return;
        err.message = replacement.message;
        if (mismatch) err.code = HOST_KEY_MISMATCH;
    });
}
