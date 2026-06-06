import { describe, it, expect } from 'vitest';
import { secureCompare } from './crypto';

describe('secureCompare', () => {
    it('returns true for equal strings', () => {
        expect(secureCompare('hello', 'hello')).toBe(true);
    });

    it('returns false for strings that differ by content only', () => {
        expect(secureCompare('hello', 'world')).toBe(false);
    });

    it('returns false for strings that differ by length only', () => {
        // This would return false quickly (timing leak) before the fix
        expect(secureCompare('abc', 'abcd')).toBe(false);
    });

    it('returns false when empty vs non-empty', () => {
        expect(secureCompare('', 'a')).toBe(false);
    });

    it('returns true for empty strings', () => {
        expect(secureCompare('', '')).toBe(true);
    });

    it('handles unicode strings', () => {
        expect(secureCompare('héllo', 'héllo')).toBe(true);
        expect(secureCompare('héllo', 'hello')).toBe(false);
    });
});
