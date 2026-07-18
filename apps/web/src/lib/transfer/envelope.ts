/**
 * Passphrase encryption for export files.
 *
 * The export passphrase is deliberately *not* the user's login password or
 * master key: an export file outlives the account it came from, gets copied to
 * backup drives and chat threads, and should not be openable by anything the
 * server already knows. The key exists only for the lifetime of the request.
 *
 * PBKDF2-SHA256 at 600k iterations (matching the master-key derivation) then
 * AES-256-GCM. GCM's auth tag is what makes a wrong passphrase a clean failure
 * rather than a silent garbage decrypt.
 */

import { deriveMasterKey, encryptJson, decryptJson, generateSalt, wipeBuffer } from '@/lib/crypto';

import { exportPayloadSchema, type ExportPayload, type ExportKdf } from './format';

/** Must match `PBKDF2_ITERATIONS` in `lib/crypto/crypto.ts`. */
const KDF_ITERATIONS = 600_000;

export class WrongPassphraseError extends Error {
    constructor() {
        super('Incorrect passphrase, or the file has been modified.');
        this.name = 'WrongPassphraseError';
    }
}

/**
 * Encrypt a payload under a passphrase.
 *
 * @returns the ciphertext plus the KDF parameters needed to reverse it
 */
export function sealPayload(payload: ExportPayload, passphrase: string) {
    const salt = generateSalt();
    const key = deriveMasterKey(passphrase, salt);

    try {
        return {
            kdf: {
                algorithm: 'pbkdf2',
                digest: 'sha256',
                iterations: KDF_ITERATIONS,
                salt: salt.toString('base64'),
            } satisfies ExportKdf,
            payload: encryptJson(payload, key),
        };
    } finally {
        // The derived key has no reason to linger in the heap after the response
        // is built; zero it rather than waiting on GC.
        wipeBuffer(key);
    }
}

/**
 * Decrypt a payload sealed by {@link sealPayload}.
 *
 * @throws {WrongPassphraseError} if the passphrase is wrong or the file was tampered with
 */
export function openPayload(
    encrypted: { iv: string; data: string; tag: string },
    kdf: ExportKdf,
    passphrase: string,
): ExportPayload {
    const salt = Buffer.from(kdf.salt, 'base64');
    const key = deriveMasterKey(passphrase, salt, kdf.iterations);

    let decoded: unknown;
    try {
        decoded = decryptJson(encrypted, key);
    } catch {
        // A GCM tag mismatch and a corrupt file are indistinguishable here, and
        // the distinction would not help the user act differently.
        throw new WrongPassphraseError();
    } finally {
        wipeBuffer(key);
    }

    // The passphrase was right, but the plaintext still came from a file the
    // user could have hand-edited — validate before trusting any of it.
    const parsed = exportPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
        throw new Error('The file decrypted successfully but its contents are not a valid export.');
    }

    return parsed.data;
}
