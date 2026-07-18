import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { revalidate, mutateCache, clearCache, getCachedData } from './useCachedFetch';

/** Build a fake `{success,data}` JSON response like the app's API returns. */
function ok(data: unknown) {
    return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
}
function fail(status: number, error = 'nope') {
    return { ok: false, status, json: async () => ({ success: false, error }) } as Response;
}

describe('useCachedFetch cache', () => {
    beforeEach(() => {
        clearCache();
        vi.restoreAllMocks();
    });
    afterEach(() => {
        clearCache();
    });

    it('populates the cache with the unwrapped payload', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ servers: [1, 2] })));

        await revalidate('/api/servers', '/api/servers');

        expect(getCachedData('/api/servers')).toEqual({ servers: [1, 2] });
    });

    it('de-duplicates concurrent requests for the same key', async () => {
        const fetchMock = vi.fn().mockResolvedValue(ok({ v: 1 }));
        vi.stubGlobal('fetch', fetchMock);

        // Fire three at once — only one network request should happen.
        await Promise.all([
            revalidate('/api/x', '/api/x'),
            revalidate('/api/x', '/api/x'),
            revalidate('/api/x', '/api/x'),
        ]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps previously cached data when a refresh fails', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(ok({ user: 'a' }))
            .mockResolvedValueOnce(fail(500));
        vi.stubGlobal('fetch', fetchMock);

        await revalidate('/api/auth/me', '/api/auth/me');
        expect(getCachedData('/api/auth/me')).toEqual({ user: 'a' });

        // A later failure must not wipe the usable data.
        await revalidate('/api/auth/me', '/api/auth/me');
        expect(getCachedData('/api/auth/me')).toEqual({ user: 'a' });
    });

    it('treats success:false as an error without caching a payload', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(400, 'bad')));

        await revalidate('/api/thing', '/api/thing');

        expect(getCachedData('/api/thing')).toBeUndefined();
    });

    it('mutateCache updates the value synchronously', () => {
        mutateCache('/api/list', { items: [1] });
        expect(getCachedData<{ items: number[] }>('/api/list')).toEqual({ items: [1] });

        mutateCache<{ items: number[] }>('/api/list', (prev) => ({
            items: [...(prev?.items ?? []), 2],
        }));
        expect(getCachedData<{ items: number[] }>('/api/list')).toEqual({ items: [1, 2] });
    });

    it('clearCache removes an entry', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ a: 1 })));
        await revalidate('/api/gone', '/api/gone');
        expect(getCachedData('/api/gone')).toEqual({ a: 1 });

        clearCache('/api/gone');
        expect(getCachedData('/api/gone')).toBeUndefined();
    });
});
