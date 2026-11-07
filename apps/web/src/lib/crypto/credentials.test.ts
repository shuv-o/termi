import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, serializeEncrypted } from './crypto';
import {
    sealField,
    openField,
    isLegacySealed,
    needsReseal,
    encryptCredentials,
    decryptCredentials,
} from './credentials';

beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test-key-for-credentials-binding-0123456789';
});

describe('field binding (AAD)', () => {
    it('round-trips a value for its own field and owner', () => {
        const sealed = sealField('s3cret', 'Server', 'password', 'user-a');
        expect(sealed.startsWith('v2:')).toBe(true);
        expect(isLegacySealed(sealed)).toBe(false);
        expect(openField(sealed, 'Server', 'password', 'user-a')).toBe('s3cret');
    });

    it('refuses a value moved into another field (privateKey → notes)', () => {
        const sealed = sealField('PRIVATE KEY', 'Server', 'privateKey', 'user-a');
        expect(() => openField(sealed, 'Server', 'notes', 'user-a')).toThrow();
    });

    it("refuses a value moved into another user's record", () => {
        const sealed = sealField('PRIVATE KEY', 'Server', 'privateKey', 'victim');
        expect(() => openField(sealed, 'Server', 'privateKey', 'attacker')).toThrow();
    });

    it('refuses a value moved between models', () => {
        const sealed = sealField('pw', 'KeychainCredential', 'password', 'user-a');
        expect(() => openField(sealed, 'Server', 'password', 'user-a')).toThrow();
    });

    it('still reads values written before binding existed', () => {
        const legacy = serializeEncrypted(encrypt('old-secret'));
        expect(isLegacySealed(legacy)).toBe(true);
        expect(openField(legacy, 'Server', 'password', 'anyone')).toBe('old-secret');
    });

    it('requires an owner', () => {
        expect(() => sealField('x', 'Server', 'password', '')).toThrow();
    });
});

describe('key rotation', () => {
    const ORIGINAL = 'test-key-for-credentials-binding-0123456789';

    it('opens values sealed under a retired key listed in ENCRYPTION_KEY_PREVIOUS', () => {
        process.env.ENCRYPTION_KEY = ORIGINAL;
        const old = sealField('rotate-me', 'Server', 'password', 'u1');
        const legacy = serializeEncrypted(encrypt('legacy-old-key'));

        process.env.ENCRYPTION_KEY = 'a-brand-new-key-after-rotation-9876543210';
        // Without the old key: a clear error, not garbage.
        delete process.env.ENCRYPTION_KEY_PREVIOUS;
        expect(() => openField(old, 'Server', 'password', 'u1')).toThrow(/unknown key/);

        process.env.ENCRYPTION_KEY_PREVIOUS = ORIGINAL;
        expect(openField(old, 'Server', 'password', 'u1')).toBe('rotate-me');
        expect(openField(legacy, 'Server', 'password', 'u1')).toBe('legacy-old-key');
        expect(needsReseal(old)).toBe(true);
        expect(needsReseal(legacy)).toBe(true);

        const fresh = sealField('rotate-me', 'Server', 'password', 'u1');
        expect(needsReseal(fresh)).toBe(false);
        expect(fresh.split(':')[1]).not.toBe(old.split(':')[1]); // different key id

        process.env.ENCRYPTION_KEY = ORIGINAL;
        delete process.env.ENCRYPTION_KEY_PREVIOUS;
    });
});

describe('encryptCredentials / decryptCredentials', () => {
    it('binds every credential field to the owner and skips empty ones', () => {
        const enc = encryptCredentials(
            { host: 'h', username: 'u', password: 'p', notes: 'n' },
            'owner-1',
        );
        expect(enc.privateKey).toBeUndefined();
        expect(decryptCredentials(enc, 'owner-1')).toEqual({
            host: 'h',
            username: 'u',
            password: 'p',
            notes: 'n',
        });
        expect(() => decryptCredentials(enc, 'owner-2')).toThrow();
        // Swapping columns within the same record fails too.
        expect(() => decryptCredentials({ ...enc, notes: enc.password }, 'owner-1')).toThrow();
    });
});

describe('password hashing', () => {
    it('verifies current hashes and flags old-parameter ones for upgrade', async () => {
        const { hashPassword, verifyPassword, passwordNeedsRehash } = await import('./crypto');
        const { scryptSync, randomBytes } = await import('crypto');

        const current = await hashPassword('correct horse');
        expect(await verifyPassword(current, 'correct horse')).toBe(true);
        expect(await verifyPassword(current, 'wrong')).toBe(false);
        expect(passwordNeedsRehash(current)).toBe(false);

        // A hash in the pre-1.2 format (N=16384, r=8, p=1) still verifies.
        const salt = randomBytes(32);
        const oldHash = scryptSync('correct horse', salt, 64, { N: 16384, r: 8, p: 1 });
        const legacy = [
            '',
            'scrypt',
            '16384',
            '8',
            '1',
            salt.toString('base64'),
            oldHash.toString('base64'),
        ].join('$');
        expect(await verifyPassword(legacy, 'correct horse')).toBe(true);
        expect(passwordNeedsRehash(legacy)).toBe(true);
    });

    it('refuses stored hashes asking for unbounded work', async () => {
        const { verifyPassword } = await import('./crypto');
        const huge = ['', 'scrypt', '4194304', '8', '1', 'AAAA', 'AAAA'].join('$');
        expect(await verifyPassword(huge, 'x')).toBe(false);
    });
});
