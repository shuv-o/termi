/**
 * Encryption of stored secrets (server credentials, keychain entries, TOTP
 * secrets, recordings, webhook URLs, pending hardening credentials).
 *
 * Every value is AES-256-GCM encrypted with the system key (ENCRYPTION_KEY)
 * and bound, through the GCM additional authenticated data, to the field it
 * belongs to and the user who owns it. A ciphertext copied into another column
 * (e.g. a private key into `notes`) or into another user's record no longer
 * decrypts, so database write access does not turn into reading credentials
 * through a less-protected path or someone else's account.
 *
 * Stored format: "v2:<iv>:<data>:<tag>". Values written before the binding
 * existed ("<iv>:<data>:<tag>") are still readable, and every write produces
 * the bound format, so data upgrades as it is saved.
 */

import { encrypt, decrypt, serializeEncrypted, deserializeEncrypted } from './crypto';

const BOUND_PREFIX = 'v2:';

/** Records whose encrypted fields are bound, and the fields of each. */
export type SealedModel =
    | 'Server'
    | 'KeychainCredential'
    | 'User'
    | 'Recording'
    | 'ServerMonitorConfig'
    | 'ServerHardeningRun';

export function fieldAad(model: SealedModel, field: string, ownerId: string): string {
    if (!ownerId) throw new Error(`Missing owner for ${model}.${field}`);
    return `termi:v2:${model}.${field}:${ownerId}`;
}

/** Encrypt one value, bound to its field and owner. */
export function sealField(
    value: string,
    model: SealedModel,
    field: string,
    ownerId: string,
): string {
    return (
        BOUND_PREFIX +
        serializeEncrypted(encrypt(value, undefined, fieldAad(model, field, ownerId)))
    );
}

/** Decrypt one value; throws if it belongs to another field or owner. */
export function openField(
    stored: string,
    model: SealedModel,
    field: string,
    ownerId: string,
): string {
    if (stored.startsWith(BOUND_PREFIX)) {
        return decrypt(
            deserializeEncrypted(stored.slice(BOUND_PREFIX.length)),
            undefined,
            fieldAad(model, field, ownerId),
        );
    }
    // Written before field binding: readable, re-sealed on the next save.
    return decrypt(deserializeEncrypted(stored));
}

/** True when a stored value still uses the unbound pre-v2 format. */
export function isLegacySealed(stored: string): boolean {
    return !stored.startsWith(BOUND_PREFIX);
}

// TYPES

export interface ServerCredentials {
    host: string;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    notes?: string;
}

export interface EncryptedCredentials {
    host: string; // Encrypted + serialized
    username: string; // Encrypted + serialized
    password?: string; // Encrypted + serialized, if present
    privateKey?: string;
    passphrase?: string;
    notes?: string;
}

const CREDENTIAL_FIELDS = [
    'host',
    'username',
    'password',
    'privateKey',
    'passphrase',
    'notes',
] as const;

/** Encrypt server credentials for storage, bound to the server's owner. */
export function encryptCredentials(
    credentials: ServerCredentials,
    ownerId: string,
): EncryptedCredentials {
    const out: Partial<Record<(typeof CREDENTIAL_FIELDS)[number], string>> = {};
    for (const field of CREDENTIAL_FIELDS) {
        const value = credentials[field];
        if (value) out[field] = sealField(value, 'Server', field, ownerId);
    }
    return out as EncryptedCredentials;
}

/** Decrypt server credentials of a server owned by `ownerId`. */
export function decryptCredentials(
    encrypted: EncryptedCredentials,
    ownerId: string,
): ServerCredentials {
    const out: Partial<Record<(typeof CREDENTIAL_FIELDS)[number], string>> = {};
    for (const field of CREDENTIAL_FIELDS) {
        const value = encrypted[field];
        if (value) out[field] = openField(value, 'Server', field, ownerId);
    }
    return out as ServerCredentials;
}
