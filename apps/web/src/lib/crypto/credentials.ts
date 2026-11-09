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

import { encrypt, decrypt, serializeEncrypted, deserializeEncrypted, getKeyring } from './crypto';

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

/**
 * Encrypt one value with the current key, bound to its field and owner.
 * Stored as "v2:<key id>:<iv>:<data>:<tag>".
 */
export function sealField(
    value: string,
    model: SealedModel,
    field: string,
    ownerId: string,
): string {
    const { current } = getKeyring();
    const sealed = encrypt(value, current.key, fieldAad(model, field, ownerId));
    return `${BOUND_PREFIX}${current.kid}:${serializeEncrypted(sealed)}`;
}

/** Decrypt one value; throws if it belongs to another field or owner, or its key is unknown. */
export function openField(
    stored: string,
    model: SealedModel,
    field: string,
    ownerId: string,
): string {
    const { current, all } = getKeyring();
    if (stored.startsWith(BOUND_PREFIX)) {
        const rest = stored.slice(BOUND_PREFIX.length);
        const sep = rest.indexOf(':');
        const kid = rest.slice(0, sep);
        const entry = all.get(kid);
        if (!entry) {
            throw new Error(
                `Encrypted with an unknown key (${kid}); add it to ENCRYPTION_KEY_PREVIOUS`,
            );
        }
        return decrypt(
            deserializeEncrypted(rest.slice(sep + 1)),
            entry.key,
            fieldAad(model, field, ownerId),
        );
    }
    // Written before field binding (and key ids): try the current key, then
    // any previous ones. Re-sealed on the next save or by `npm run db:reseal`.
    const legacy = deserializeEncrypted(stored);
    let lastError: unknown;
    for (const entry of [current, ...[...all.values()].filter((e) => e !== current)]) {
        try {
            return decrypt(legacy, entry.key);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError;
}

/** True when a stored value should be re-sealed: unbound, or under a retired key. */
export function needsReseal(stored: string): boolean {
    if (!stored.startsWith(BOUND_PREFIX)) return true;
    const kid = stored.slice(BOUND_PREFIX.length).split(':', 1)[0];
    return kid !== getKeyring().current.kid;
}

/** True when a stored value still uses the unbound pre-v2 format. */
export function isLegacySealed(stored: string): boolean {
    return !stored.startsWith(BOUND_PREFIX);
}

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
