import { describe, it, expect } from 'vitest';
import { generateRecoveryCodes, normalizeRecoveryCode } from './totp';

describe('generateRecoveryCodes', () => {
    it('generates 10 codes', () => {
        expect(generateRecoveryCodes()).toHaveLength(10);
    });

    it('produces well-formed XXXX-XXXX codes that normalize to exactly 8 chars', () => {
        // Regression: the old implementation yielded 5–6 char codes whose
        // normalized length was never 8, so the verification gate
        // (`normalized.length === 8` in auth.ts) rejected every recovery code,
        // permanently locking out users who lost their authenticator.
        for (const code of generateRecoveryCodes()) {
            expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
            expect(normalizeRecoveryCode(code)).toHaveLength(8);
        }
    });

    it('uses an unambiguous alphabet (no 0/1/I/O)', () => {
        for (const code of generateRecoveryCodes()) {
            expect(normalizeRecoveryCode(code)).not.toMatch(/[01IO]/);
        }
    });

    it('produces unique codes across a batch', () => {
        const codes = generateRecoveryCodes();
        expect(new Set(codes).size).toBe(codes.length);
    });
});

describe('normalizeRecoveryCode', () => {
    it('strips hyphens/whitespace and upper-cases', () => {
        expect(normalizeRecoveryCode('abcd-efgh')).toBe('ABCDEFGH');
        expect(normalizeRecoveryCode(' ab cd ef gh ')).toBe('ABCDEFGH');
    });
});
