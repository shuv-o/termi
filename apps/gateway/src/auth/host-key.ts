/**
 * SSH host key verification for the gateway. Mirrors
 * `apps/web/src/lib/security/host-key.ts` — keep the algorithm list, the
 * fingerprint format and the messages in step with it.
 *
 * The gateway never pins a key itself (it has no database access): the web app
 * pins on first contact before minting a token, and the token carries the
 * expected fingerprint. A token without one is refused for SSH, rather than
 * silently connecting unverified.
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

/**
 * No key recorded yet, and this gateway may record it: accept the first key
 * the server presents and hand it to `onFirstUse`. Only the desktop app's own
 * gateway (local/device.ts) ever builds one, for servers its user owns.
 */
export interface FirstUse {
    onFirstUse: (fingerprint: string, keyType: string) => void;
}

export type HostKeyExpectation = string | null | undefined | FirstUse;

/** The key type named at the start of an SSH public-key blob. */
export function keyTypeOf(key: Buffer): string {
    try {
        const len = key.readUInt32BE(0);
        return key.subarray(4, 4 + len).toString('ascii');
    } catch {
        return 'unknown';
    }
}

export function fingerprintOf(key: Buffer): string {
    return 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
}

export function hostKeyMismatchMessage(label: string, expected: string, actual: string): string {
    return (
        `The host key of ${label} has changed (expected ${expected}, got ${actual}). ` +
        'Someone may be intercepting the connection, so Termi refused to connect. ' +
        "If the server was reinstalled or its keys were regenerated, review the new key in the server's settings and trust it."
    );
}

/**
 * Verify `cc`'s host key against `expected`. The refusal surfaces on `client`
 * as an error carrying the explanation (and `code: HOST_KEY_MISMATCH` for a
 * changed key) instead of ssh2's bare "Host denied (verification failed)".
 */
export function applyHostKeyCheck(
    client: Client,
    cc: ConnectConfig,
    expected: HostKeyExpectation,
    label: string,
): void {
    let refusal: { message: string; code?: string } | null = null;

    cc.algorithms = { ...cc.algorithms, serverHostKey: HOST_KEY_ALGORITHMS };
    cc.hostVerifier = (key: Buffer) => {
        const actual = fingerprintOf(key);
        if (expected && typeof expected === 'object') {
            expected.onFirstUse(actual, keyTypeOf(key));
            return true;
        }
        if (!expected) {
            refusal = {
                message: `${label} has no recorded host key yet. Reconnect from Termi to record it.`,
            };
            return false;
        }
        if (actual === expected) return true;
        refusal = {
            message: hostKeyMismatchMessage(label, expected, actual),
            code: HOST_KEY_MISMATCH,
        };
        return false;
    };

    client.prependListener('error', (err: Error & { code?: unknown }) => {
        if (!refusal) return;
        err.message = refusal.message;
        if (refusal.code) err.code = refusal.code;
    });
}
