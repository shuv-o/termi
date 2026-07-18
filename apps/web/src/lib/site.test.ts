import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('getSiteUrl', () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
        else process.env.NEXT_PUBLIC_APP_URL = original;
    });

    it('uses the deployment-configured URL — critical for self-hosted instances', async () => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://my-server.example.com';
        const { getSiteUrl } = await import('./site');
        expect(getSiteUrl()).toBe('https://my-server.example.com');
    });

    it('strips a trailing slash so callers can safely append a path', async () => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://my-server.example.com/';
        const { getSiteUrl } = await import('./site');
        expect(getSiteUrl()).toBe('https://my-server.example.com');
    });

    it('falls back to the project domain, not a broken/foreign URL, when unset', async () => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        const { getSiteUrl } = await import('./site');
        expect(getSiteUrl()).toBe('https://termi.shuvoo.com');
    });

    it('treats a whitespace-only value as unset', async () => {
        process.env.NEXT_PUBLIC_APP_URL = '   ';
        const { getSiteUrl } = await import('./site');
        expect(getSiteUrl()).toBe('https://termi.shuvoo.com');
    });
});
