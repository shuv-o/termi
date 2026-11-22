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

    it('allows private and loopback addresses when allowPrivateNetworks is true', async () => {
        expect((await validateHost('127.0.0.1', true)).valid).toBe(true);
        expect((await validateHost('localhost', true)).valid).toBe(true);
        expect((await validateHost('192.168.1.1', true)).valid).toBe(true);
    });

    it('still resolves hostnames in that mode, refusing ones that point at metadata', async () => {
        lookupMock.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
        expect((await validateHost('sneaky.example', true)).valid).toBe(false);
    });
});

import { validateJumpTargetHost } from './ssrf';

describe('validateJumpTargetHost', () => {
    it('accepts private addresses, since the bastion dials them', () => {
        expect(validateJumpTargetHost('10.0.2.4').valid).toBe(true);
        expect(validateJumpTargetHost('192.168.1.40').valid).toBe(true);
        expect(validateJumpTargetHost('db.internal').valid).toBe(true);
        expect(validateJumpTargetHost('[fd00::1]').valid).toBe(true);
    });

    it('rejects empty, oversized and malformed hosts', () => {
        expect(validateJumpTargetHost('').valid).toBe(false);
        expect(validateJumpTargetHost('   ').valid).toBe(false);
        expect(validateJumpTargetHost('a'.repeat(254)).valid).toBe(false);
        expect(validateJumpTargetHost('host name').valid).toBe(false);
        expect(validateJumpTargetHost('evil.com/path').valid).toBe(false);
        expect(validateJumpTargetHost('user@host').valid).toBe(false);
    });
});

describe('cloud metadata is always blocked', () => {
    it('refuses metadata even with private networks allowed', async () => {
        for (const host of [
            '169.254.169.254',
            '169.254.170.2',
            '[fd00:ec2::254]',
            '168.63.129.16',
            '100.100.100.200',
            'metadata.google.internal',
            '::ffff:169.254.169.254',
        ]) {
            expect((await validateHost(host, true)).valid).toBe(false);
            expect((await validateHost(host, false)).valid).toBe(false);
        }
    });

    it('still allows ordinary private addresses when private networks are allowed', async () => {
        for (const host of ['10.0.0.5', '192.168.1.10', '172.16.0.2']) {
            expect((await validateHost(host, true)).valid).toBe(true);
        }
    });
});

describe('the address to dial (DNS rebinding)', () => {
    beforeEach(() => {
        lookupMock.mockReset();
    });

    it('returns the address it checked for a name', async () => {
        lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
        expect(await validateHost('example.com')).toEqual({
            valid: true,
            address: '93.184.216.34',
        });
    });

    it('returns a literal IP as is, without brackets', async () => {
        expect((await validateHost('8.8.8.8')).address).toBe('8.8.8.8');
        expect((await validateHost('[2001:4860:4860::8888]')).address).toBe('2001:4860:4860::8888');
    });

    it('refuses a name that resolves to nothing', async () => {
        lookupMock.mockResolvedValueOnce([]);
        expect((await validateHost('empty.example')).valid).toBe(false);
    });

    it('with private networks allowed, still pins the checked address', async () => {
        lookupMock.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
        expect(await validateHost('db.internal', true)).toEqual({
            valid: true,
            address: '10.0.0.5',
        });
    });

    it('checkedDialAddress dials the checked address and refuses what fails', async () => {
        const { checkedDialAddress } = await import('./ssrf');
        lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
        expect(await checkedDialAddress('example.com')).toEqual({
            ok: true,
            address: '93.184.216.34',
        });
        lookupMock.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
        const refused = await checkedDialAddress('rebind.example');
        expect(refused.ok).toBe(false);
    });
});

describe('which checked address is dialed', () => {
    beforeEach(() => {
        lookupMock.mockReset();
    });

    it('prefers IPv4 when a name has both', async () => {
        lookupMock.mockResolvedValueOnce([
            { address: '2606:4700::6810:84e5', family: 6 },
            { address: '104.16.132.229', family: 4 },
        ]);
        expect((await validateHost('dual.example')).address).toBe('104.16.132.229');
    });

    it('uses IPv6 when that is all there is', async () => {
        lookupMock.mockResolvedValueOnce([{ address: '2606:4700::6810:84e5', family: 6 }]);
        expect((await validateHost('v6.example')).address).toBe('2606:4700::6810:84e5');
    });
});
