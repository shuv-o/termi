import { describe, it, expect } from 'vitest';
import { filterForwardHeaders, scopeCookiePath, injectBaseTag } from './route';

describe('filterForwardHeaders', () => {
    it('drops the session cookie — this route is same-origin, so the browser attaches it automatically', () => {
        const headers = new Headers({ cookie: 'termix_session=secret', 'x-custom': 'keep-me' });
        const result = filterForwardHeaders(headers);
        expect(result.cookie).toBeUndefined();
        expect(result['x-custom']).toBe('keep-me');
    });

    it('drops the Authorization header for the same reason', () => {
        const headers = new Headers({ authorization: 'Bearer secret-token' });
        expect(filterForwardHeaders(headers).authorization).toBeUndefined();
    });

    it('drops hop-by-hop headers that must never be forwarded by a proxy', () => {
        const headers = new Headers({
            connection: 'keep-alive',
            'transfer-encoding': 'chunked',
            upgrade: 'websocket',
            host: 'termix.example.com',
        });
        const result = filterForwardHeaders(headers);
        expect(Object.keys(result)).toHaveLength(0);
    });

    it('is case-insensitive when matching header names to drop', () => {
        const headers = new Headers({ Cookie: 'termix_session=secret' });
        expect(filterForwardHeaders(headers).Cookie).toBeUndefined();
    });

    it('passes through ordinary headers untouched', () => {
        const headers = new Headers({ 'content-type': 'application/json', accept: '*/*' });
        const result = filterForwardHeaders(headers);
        expect(result['content-type']).toBe('application/json');
        expect(result.accept).toBe('*/*');
    });
});

describe('scopeCookiePath', () => {
    it('adds a Path attribute when the cookie has none', () => {
        expect(scopeCookiePath('session=abc', '/tunnel/srv1/8080/')).toBe(
            'session=abc; Path=/tunnel/srv1/8080/',
        );
    });

    it('replaces an existing Path so the cookie stays scoped to this tunnel', () => {
        expect(scopeCookiePath('session=abc; Path=/', '/tunnel/srv1/8080/')).toBe(
            'session=abc; Path=/tunnel/srv1/8080/',
        );
    });

    it('preserves other cookie attributes untouched', () => {
        expect(
            scopeCookiePath('session=abc; Path=/app; HttpOnly; Secure', '/tunnel/srv1/8080/'),
        ).toBe('session=abc; Path=/tunnel/srv1/8080/; HttpOnly; Secure');
    });
});

describe('injectBaseTag', () => {
    it('inserts a <base> tag right after <head>', () => {
        const html = '<html><head><title>x</title></head><body></body></html>';
        expect(injectBaseTag(html, '/tunnel/srv1/80/')).toBe(
            '<html><head><base href="/tunnel/srv1/80/"><title>x</title></head><body></body></html>',
        );
    });

    it('preserves attributes on the <head> tag', () => {
        const html = '<head data-x="1"></head>';
        expect(injectBaseTag(html, '/p/')).toBe('<head data-x="1"><base href="/p/"></head>');
    });

    it('is a no-op when the page already has a <base> tag', () => {
        const html = '<head><base href="/other/"></head>';
        expect(injectBaseTag(html, '/p/')).toBe(html);
    });

    it('is a no-op when there is no detectable <head>', () => {
        const html = '<div>no head here</div>';
        expect(injectBaseTag(html, '/p/')).toBe(html);
    });
});
