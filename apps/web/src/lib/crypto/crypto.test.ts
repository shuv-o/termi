import { describe, it, expect } from 'vitest';
import { secureCompare } from './crypto';
import { assertDatabaseSslInProduction } from '../db/prisma';

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

describe('assertDatabaseSslInProduction', () => {
    it('does nothing in development', () => {
        const original = process.env.NODE_ENV;
        // @ts-ignore
        process.env.NODE_ENV = 'development';
        expect(() =>
            assertDatabaseSslInProduction('postgresql://user:pass@host/db')
        ).not.toThrow();
        // @ts-ignore
        process.env.NODE_ENV = original;
    });

    it('throws in production when sslmode is absent', () => {
        const original = process.env.NODE_ENV;
        // @ts-ignore
        process.env.NODE_ENV = 'production';
        expect(() =>
            assertDatabaseSslInProduction('postgresql://user:pass@host/db')
        ).toThrow('sslmode=require');
        // @ts-ignore
        process.env.NODE_ENV = original;
    });

    it('does not throw in production with sslmode=require', () => {
        const original = process.env.NODE_ENV;
        // @ts-ignore
        process.env.NODE_ENV = 'production';
        expect(() =>
            assertDatabaseSslInProduction('postgresql://user:pass@host/db?sslmode=require')
        ).not.toThrow();
        // @ts-ignore
        process.env.NODE_ENV = original;
    });

    it('does not throw in production with ssl=true', () => {
        const original = process.env.NODE_ENV;
        // @ts-ignore
        process.env.NODE_ENV = 'production';
        expect(() =>
            assertDatabaseSslInProduction('postgresql://user:pass@host/db?ssl=true')
        ).not.toThrow();
        // @ts-ignore
        process.env.NODE_ENV = original;
    });

    it('throws with a clear actionable message', () => {
        const original = process.env.NODE_ENV;
        // @ts-ignore
        process.env.NODE_ENV = 'production';
        expect(() =>
            assertDatabaseSslInProduction('postgresql://user:pass@host/db')
        ).toThrow(/DATABASE_URL.*sslmode=require/);
        // @ts-ignore
        process.env.NODE_ENV = original;
    });
});
