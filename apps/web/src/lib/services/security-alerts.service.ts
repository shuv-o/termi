/**
 * Security notifications: an email to the account owner whenever something
 * security-relevant happens to their account, so a takeover or misuse is
 * noticed by the one person who can tell it wasn't them.
 *
 * Fire-and-forget — a mail failure never blocks the action itself.
 */

import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/auth/email-otp';

export type SecurityEvent =
    | 'new_device'
    | 'password_changed'
    | 'password_reset'
    | '2fa_enabled'
    | '2fa_disabled'
    | 'passkey_added'
    | 'passkey_removed'
    | 'servers_exported';

const MESSAGES: Record<SecurityEvent, { subject: string; body: string }> = {
    new_device: {
        subject: 'New sign-in to your Termi account',
        body: 'Your account was just signed in to from a device or browser it has not used before.',
    },
    password_changed: {
        subject: 'Your Termi password was changed',
        body: 'The password for your account was just changed. All other sessions were signed out.',
    },
    password_reset: {
        subject: 'Your Termi password was reset',
        body: 'The password for your account was just reset with an emailed link. All sessions were signed out.',
    },
    '2fa_enabled': {
        subject: 'Two-factor authentication turned on',
        body: 'Two-factor authentication was just turned on for your account.',
    },
    '2fa_disabled': {
        subject: 'Two-factor authentication turned off',
        body: 'Two-factor authentication was just turned OFF for your account.',
    },
    passkey_added: {
        subject: 'A passkey was added to your Termi account',
        body: 'A new passkey was just registered on your account. It can sign in without your password.',
    },
    passkey_removed: {
        subject: 'A passkey was removed from your Termi account',
        body: 'A passkey was just removed from your account.',
    },
    servers_exported: {
        subject: 'Your Termi servers were exported',
        body: 'Your server list was just exported from your account.',
    },
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function notifySecurityEvent(
    userId: string,
    event: SecurityEvent,
    context: { ipAddress?: string; deviceInfo?: string } = {},
): void {
    void (async () => {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
        });
        if (!user) return;
        const { subject, body } = MESSAGES[event];
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
        const details = [
            ['When', new Date().toUTCString()],
            ['Device', context.deviceInfo],
            [
                'IP address',
                context.ipAddress && context.ipAddress !== 'unknown'
                    ? context.ipAddress
                    : undefined,
            ],
        ]
            .filter(([, v]) => v)
            .map(([k, v]) => `<li><strong>${k}:</strong> ${escapeHtml(String(v))}</li>`)
            .join('');
        await sendEmail(
            user.email,
            subject,
            `<p>${body}</p><ul>${details}</ul>
<p>If this was you, you can ignore this email. If it wasn't, <a href="${appUrl}/forgot-password">reset your password</a> now and review your <a href="${appUrl}/panel/settings">active sessions</a>.</p>`,
        );
    })().catch((err) => console.error(`[security-alert] ${event} email failed:`, err));
}

/** Reduce a user agent to browser + OS, ignoring version numbers. */
export function deviceFingerprint(userAgent: string): string {
    return userAgent
        .replace(/[\d._]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}
