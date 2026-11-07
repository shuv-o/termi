/**
 * Termi Cryptography Module
 *
 * Security Architecture:
 * - All credentials are encrypted using AES-256-GCM before storage
 * - Passwords are hashed using scrypt with secure parameters (N=16384, r=8, p=1)
 * - Optional master key encryption using PBKDF2 key derivation (600,000 iterations, SHA-256)
 * - All cryptographic operations use Node.js crypto module (FIPS-compliant)
 *
 * SECURITY WARNING: Never log or expose encryption keys or plaintext credentials
 */

import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    pbkdf2Sync,
    createHash,
    scrypt,
    timingSafeEqual,
} from 'crypto';

// CONSTANTS

// AES-256-GCM parameters
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits auth tag
const KEY_LENGTH = 32; // 256 bits

// Scrypt parameters (used as Argon2 alternative for better compatibility)
// OWASP's scrypt guidance lists N=2^17,r=8,p=1 and the equal-cost
// N=2^15,r=8,p=3; the latter needs ~32 MiB per hash instead of ~128 MiB, so a
// burst of concurrent logins can't exhaust the server's memory.
const SCRYPT_OPTIONS = {
    N: 32768, // CPU/memory cost parameter (2^15)
    r: 8, // Block size
    p: 3, // Parallelization
    maxmem: 64 * 1024 * 1024, // 64 MB
};

// PBKDF2 parameters for master key derivation
const PBKDF2_ITERATIONS = 600000; // OWASP 2023 recommendation
const PBKDF2_DIGEST = 'sha256';
const SALT_LENGTH = 32;

// ENCRYPTION KEY MANAGEMENT

/**
 * System encryption key derived from environment variable
 * This key is used for encrypting data at rest when no master key is set
 */
let warnedPlaceholderKey = false;

function getSystemKey(): Buffer {
    const envKey = process.env.ENCRYPTION_KEY;

    if (!envKey) {
        throw new Error(
            'ENCRYPTION_KEY environment variable is required. ' +
                'Generate one with: openssl rand -base64 32',
        );
    }

    // The .env.example placeholder is public. Refusing to start would lock an
    // instance that already encrypted its data with it out of that data, so
    // warn loudly instead (once per process).
    if (/^change-me/i.test(envKey) && !warnedPlaceholderKey) {
        warnedPlaceholderKey = true;
        console.error(
            '[security] ENCRYPTION_KEY is the public example placeholder. Anyone with a ' +
                'database dump can decrypt every stored credential. Set a random key ' +
                '(openssl rand -base64 32) and re-enter your server credentials.',
        );
    }

    // Hash the env key to ensure consistent 32-byte length
    return createHash('sha256').update(envKey).digest();
}

/**
 * Derive an encryption key from user's master password
 * Uses PBKDF2 with high iteration count for slow key derivation
 *
 * @param iterations - Override the iteration count. Only for reading data that
 *                     recorded its own cost parameters (export files); stored
 *                     credentials always use the current default.
 */
export function deriveMasterKey(
    masterPassword: string,
    salt: Buffer,
    iterations: number = PBKDF2_ITERATIONS,
): Buffer {
    return pbkdf2Sync(masterPassword, salt, iterations, KEY_LENGTH, PBKDF2_DIGEST);
}

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): Buffer {
    return randomBytes(SALT_LENGTH);
}

/**
 * Hash a derived key for storage (to verify master key on login)
 */
export function hashDerivedKey(derivedKey: Buffer): string {
    return createHash('sha256').update(derivedKey).digest('hex');
}

// AES-256-GCM ENCRYPTION

export interface EncryptedData {
    iv: string; // Base64 encoded IV
    data: string; // Base64 encoded ciphertext
    tag: string; // Base64 encoded auth tag
}

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * @param plaintext - The data to encrypt
 * @param key - Optional encryption key (uses system key if not provided)
 * @param aad - Optional additional authenticated data the ciphertext is bound to
 * @returns Encrypted data structure with IV, ciphertext, and auth tag
 */
export function encrypt(plaintext: string, key?: Buffer, aad?: string): EncryptedData {
    const encryptionKey = key || getSystemKey();

    // Generate random IV for each encryption (NEVER reuse IVs with GCM)
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
    if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));

    // Encrypt
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    // Get authentication tag
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString('base64'),
        data: encrypted.toString('base64'),
        tag: tag.toString('base64'),
    };
}

/**
 * Decrypt AES-256-GCM encrypted data
 *
 * @param encryptedData - The encrypted data structure
 * @param key - Optional decryption key (uses system key if not provided)
 * @param aad - The additional authenticated data used at encryption, if any
 * @returns Decrypted plaintext
 * @throws Error if decryption or authentication fails (including an AAD mismatch)
 */
export function decrypt(encryptedData: EncryptedData, key?: Buffer, aad?: string): string {
    const decryptionKey = key || getSystemKey();

    // Decode from base64
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const encrypted = Buffer.from(encryptedData.data, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');

    // Validate IV length
    if (iv.length !== IV_LENGTH) {
        throw new Error('Invalid IV length');
    }

    // Validate tag length
    if (tag.length !== TAG_LENGTH) {
        throw new Error('Invalid authentication tag length');
    }

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, decryptionKey, iv);
    decipher.setAuthTag(tag);
    if (aad !== undefined) decipher.setAAD(Buffer.from(aad, 'utf8'));

    // Decrypt (will throw if authentication fails)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
}

/**
 * Encrypt a JSON object
 */
export function encryptJson<T>(data: T, key?: Buffer): EncryptedData {
    return encrypt(JSON.stringify(data), key);
}

/**
 * Decrypt to a JSON object
 */
export function decryptJson<T>(encryptedData: EncryptedData, key?: Buffer): T {
    const json = decrypt(encryptedData, key);
    return JSON.parse(json) as T;
}

// PASSWORD HASHING (using scrypt as cross-platform alternative to Argon2)

/**
 * Hash a password using scrypt
 *
 * @param password - The plaintext password to hash
 * @returns The password hash string (includes algorithm params and salt)
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const hash = await scryptAsync(password, salt, 64, SCRYPT_OPTIONS);

    // Format: $scrypt$N$r$p$salt$hash
    return `$scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Verify a password against a scrypt hash
 *
 * @param hash - The stored password hash
 * @param password - The plaintext password to verify
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
        const parts = hash.split('$');
        if (parts.length !== 7 || parts[1] !== 'scrypt') {
            return false;
        }

        const N = parseInt(parts[2], 10);
        const r = parseInt(parts[3], 10);
        const p = parseInt(parts[4], 10);
        const salt = Buffer.from(parts[5], 'base64');
        const storedHash = Buffer.from(parts[6], 'base64');

        // Bound the parameters a stored hash may ask for, so a tampered row
        // can't make verification allocate unbounded memory.
        if (!(N > 1 && N <= 2 ** 17 && r >= 1 && r <= 16 && p >= 1 && p <= 16)) return false;
        const computedHash = await scryptAsync(password, salt, 64, {
            N,
            r,
            p,
            maxmem: 256 * 1024 * 1024,
        });

        // Constant-time comparison to prevent timing attacks
        return (
            computedHash.length === storedHash.length && timingSafeEqual(computedHash, storedHash)
        );
    } catch {
        return false;
    }
}

/**
 * True when a stored hash uses weaker parameters than the current ones, so it
 * should be replaced with a fresh hash after a successful sign-in.
 */
export function passwordNeedsRehash(hash: string): boolean {
    const parts = hash.split('$');
    if (parts.length !== 7 || parts[1] !== 'scrypt') return true;
    return (
        parseInt(parts[2], 10) !== SCRYPT_OPTIONS.N ||
        parseInt(parts[3], 10) !== SCRYPT_OPTIONS.r ||
        parseInt(parts[4], 10) !== SCRYPT_OPTIONS.p
    );
}

/** scrypt off the event loop (scryptSync blocked every other request while hashing). */
function scryptAsync(
    password: string,
    salt: Buffer,
    keylen: number,
    options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
    return new Promise((resolve, reject) =>
        scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
    );
}

// UTILITY FUNCTIONS

/**
 * Generate a secure random token (for session tokens, CSRF, etc.)
 */
export function generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('base64url');
}

/**
 * Hash a token for storage (don't store raw tokens)
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Pads both inputs to equal length before calling timingSafeEqual,
 * so execution time does not reveal string length.
 */
export function secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    const len = Math.max(bufA.length, bufB.length);
    // Pad shorter buffer so timingSafeEqual always runs full length
    const padA = Buffer.concat([bufA, Buffer.alloc(len - bufA.length)]);
    const padB = Buffer.concat([bufB, Buffer.alloc(len - bufB.length)]);
    // Evaluate length equality AFTER the constant-time comparison so length
    // information is not leaked through early-exit timing
    return timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

/**
 * Securely wipe a buffer from memory
 * Note: Not 100% guaranteed in JavaScript due to GC,
 * but helps reduce exposure window
 */
export function wipeBuffer(buffer: Buffer): void {
    buffer.fill(0);
}

/**
 * Serialize encrypted data to a single string for storage
 */
export function serializeEncrypted(data: EncryptedData): string {
    return `${data.iv}:${data.data}:${data.tag}`;
}

/**
 * Deserialize encrypted data string back to components
 */
export function deserializeEncrypted(serialized: string): EncryptedData {
    const parts = serialized.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }

    return {
        iv: parts[0],
        data: parts[1],
        tag: parts[2],
    };
}

// Stored secrets go through sealField/openField (credentials.ts), which bind
// each value to its field and owner.
