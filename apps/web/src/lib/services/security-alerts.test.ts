import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/auth/email-otp', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/lib/db', () => ({
    prisma: { user: { findUnique: vi.fn().mockResolvedValue({ email: 'owner@example.com' }) } },
}));

import { deviceFingerprint, notifySecurityEvent } from './security-alerts.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('security alerts', () => {
    beforeEach(() => sendEmail.mockClear());

    it('emails the account owner with the event and context', async () => {
        notifySecurityEvent('u1', 'new_device', {
            ipAddress: '203.0.113.5',
            deviceInfo: 'Firefox <b>x</b>',
        });
        await flush();
        expect(sendEmail).toHaveBeenCalledTimes(1);
        const [to, subject, html] = sendEmail.mock.calls[0] as [string, string, string];
        expect(to).toBe('owner@example.com');
        expect(subject).toMatch(/New sign-in/);
        expect(html).toContain('203.0.113.5');
        // User-agent text is escaped, never injected as HTML.
        expect(html).not.toContain('<b>x</b>');
        expect(html).toContain('&#60;b&#62;');
    });

    it('never throws when sending fails', async () => {
        sendEmail.mockRejectedValueOnce(new Error('smtp down'));
        expect(() => notifySecurityEvent('u1', 'password_changed')).not.toThrow();
        await flush();
    });

    it('treats a browser update as the same device', () => {
        const a = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.1.2 Safari/537.36';
        const b = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0.9.9 Safari/537.36';
        const other = 'Mozilla/5.0 (Windows NT 10.0) Firefox/131.0';
        expect(deviceFingerprint(a)).toBe(deviceFingerprint(b));
        expect(deviceFingerprint(a)).not.toBe(deviceFingerprint(other));
    });
});
