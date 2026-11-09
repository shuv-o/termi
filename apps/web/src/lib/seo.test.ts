import { afterEach, describe, expect, it } from 'vitest';
import { isPrivatePath, searchIndexingAllowed } from './seo';

describe('isPrivatePath', () => {
    it('keeps the signed-in app, one-time links, API and tunnels out', () => {
        for (const p of [
            '/panel',
            '/panel/servers/x',
            '/api/health',
            '/tunnel/a/80',
            '/teams/join/t',
            '/invitations/t',
            '/login',
            '/register',
            '/reset-password',
            '/forgot-password',
        ]) {
            expect(isPrivatePath(p)).toBe(true);
        }
    });

    it('leaves the public pages indexable', () => {
        for (const p of ['/', '/privacy', '/security', '/panelists', '/llms.txt']) {
            expect(isPrivatePath(p)).toBe(false);
        }
    });
});

describe('searchIndexingAllowed', () => {
    const original = process.env.SEARCH_INDEXING;
    afterEach(() => {
        process.env.SEARCH_INDEXING = original;
    });

    it('is on unless set to off', () => {
        delete process.env.SEARCH_INDEXING;
        expect(searchIndexingAllowed()).toBe(true);
        process.env.SEARCH_INDEXING = 'on';
        expect(searchIndexingAllowed()).toBe(true);
        process.env.SEARCH_INDEXING = ' OFF ';
        expect(searchIndexingAllowed()).toBe(false);
    });
});
