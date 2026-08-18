import { describe, it, expect, vi, beforeEach } from 'vitest';

const lookupMock = vi.fn();

vi.mock('dns/promises', () => ({
    default: { lookup: (...args: unknown[]) => lookupMock(...args) },
    lookup: (...args: unknown[]) => lookupMock(...args),
}));

import { validateHost } from './ssrf';

describe('validateHost', () => {
    beforeEach(() => {
        lookupMock.mockReset();
    });

    it('blocks localhost variants', async () => {
        expect((await validateHost('localhost')).valid).toBe(false);
        expect((await validateHost('LOCALHOST')).valid).toBe(false);
        expect((await validateHost('localhost.')).valid).toBe(false);
    });

    it.each([
        '10.0.0.1',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.1',
        '127.0.0.1',
        '169.254.169.254', // cloud metadata endpoint
        '100.64.0.1', // CGNAT
        '0.0.0.1',
    ])('blocks private/reserved IPv4 address %s', async (ip) => {
        const result = await validateHost(ip);
        expect(result.valid).toBe(false);
    });

    it('allows a public IPv4 address', async () => {
        const result = await validateHost('8.8.8.8');
        expect(result.valid).toBe(true);
    });

    it.each(['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1'])(
        'blocks private/reserved IPv6 address %s',
        async (ip) => {
            const result = await validateHost(ip);
            expect(result.valid).toBe(false);
        },
    );

    it('allows a public IPv6 address', async () => {
        const result = await validateHost('2001:4860:4860::8888');
        expect(result.valid).toBe(true);
    });

    it('blocks a hostname that resolves to a private address', async () => {
        lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
        const result = await validateHost('internal.example.com');
        expect(result.valid).toBe(false);
        expect(lookupMock).toHaveBeenCalledWith('internal.example.com', { all: true });
    });

    it('allows a hostname that resolves to a public address', async () => {
        lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
        const result = await validateHost('example.com');
        expect(result.valid).toBe(true);
    });

    it('fails closed when DNS resolution errors', async () => {
        lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
        const result = await validateHost('does-not-resolve.invalid');
        expect(result.valid).toBe(false);
    });

    it('bypasses every check when allowPrivateNetworks is true', async () => {
        expect((await validateHost('127.0.0.1', true)).valid).toBe(true);
        expect((await validateHost('localhost', true)).valid).toBe(true);
        expect((await validateHost('192.168.1.1', true)).valid).toBe(true);
        expect(lookupMock).not.toHaveBeenCalled();
    });
});
