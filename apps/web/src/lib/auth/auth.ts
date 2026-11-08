/**
 * Authentication Service
 */

import { notifySecurityEvent } from '@/lib/services/security-alerts.service';
import { SSO_REQUIRED_MESSAGE, ssoRequiredFor } from './oidc';
import { prisma } from '@/lib/db';
import {
    hashPassword,
    verifyPassword,
    passwordNeedsRehash,
    sealField,
    openField,
    generateSecureToken,
    hashToken,
} from '@/lib/crypto';
import { createSession, getSession, validateSession } from './session';
import { verifyTOTP, generateRecoveryCodes, normalizeRecoveryCode } from './totp';
import { sendEmailOTP, verifyEmailOTP } from './email-otp';
import { verify2FAAccountRateLimit } from '@/lib/rate-limit';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

// TYPES

export interface RegisterInput {
    email: string;
    password: string;
    name?: string;
}

export interface LoginInput {
    email: string;
    password: string;
    deviceInfo: string;
    ipAddress: string;
}

export interface AuthResult {
    /** Registration only: the email already has an account (never sent to the client). */
    duplicate?: boolean;
    success: boolean;
    error?: string;
    requires2FA?: boolean;
    twoFactorMethod?: 'TOTP' | 'EMAIL';
    userId?: string;
    email?: string;
    sessionToken?: string;
    suggestPasskeySetup?: boolean; // True when user has no passkeys yet
}

// HELPERS

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/** Hash a recovery code with scrypt for storage */
function hashRecoveryCode(code: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(normalizeRecoveryCode(code), salt, 32);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Verify a recovery code against a stored hash (constant-time) */
function verifyRecoveryCodeHash(code: string, stored: string): boolean {
    try {
        const [saltHex, hashHex] = stored.split(':');
        const salt = Buffer.from(saltHex, 'hex');
        const storedHash = Buffer.from(hashHex, 'hex');
        const computedHash = scryptSync(normalizeRecoveryCode(code), salt, 32);
        return timingSafeEqual(computedHash, storedHash);
    } catch {
        return false;
    }
}

// REGISTRATION

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
    const { email, password, name } = input;
    if (ssoRequiredFor(email)) return { success: false, error: SSO_REQUIRED_MESSAGE };

    const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
    });

    if (existing) {
        return { success: false, error: 'Email already registered', duplicate: true };
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
        data: {
            email: email.toLowerCase(),
            name: name?.trim() || null,
            passwordHash,
        },
    });

    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'USER_REGISTER',
            details: { authMethod: 'email' },
        },
    });

    return { success: true, userId: user.id, email: user.email };
}

// LOGIN

export async function loginUser(input: LoginInput): Promise<AuthResult> {
    const { email, password, deviceInfo, ipAddress } = input;
    // Domain policy, not account state: the same answer for every address there.
    if (ssoRequiredFor(email)) return { success: false, error: SSO_REQUIRED_MESSAGE };

    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
            id: true,
            email: true,
            passwordHash: true,
            passwordLoginDisabled: true,
            isActive: true,
            lockoutUntil: true,
            failedLoginCount: true,
            twoFactorMethod: true,
        },
    });

    if (!user) {
        await prisma.auditLog.create({
            data: {
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'User not found' },
            },
        });
        return { success: false, error: 'Invalid email or password' };
    }

    if (!user.isActive) {
        return { success: false, error: 'Account is disabled' };
    }

    // "Passkey only" accounts never accept a password. Checked before the
    // password itself, so this can't be used to test whether a guess is right.
    if (user.passwordLoginDisabled) {
        return {
            success: false,
            error: 'Password sign-in is turned off for this account. Sign in with your passkey.',
        };
    }

    // Google-only users have no password
    if (!user.passwordHash) {
        return {
            success: false,
            error: 'This account uses Google Sign-In. Please sign in with Google.',
        };
    }

    // Lockout check
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
        const remaining = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
        return {
            success: false,
            error: `Account temporarily locked. Try again in ${remaining} minute(s).`,
        };
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
        const newCount = user.failedLoginCount + 1;
        const lockout =
            newCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

        await prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginCount: newCount,
                ...(lockout ? { lockoutUntil: lockout } : {}),
            },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'Invalid password', attempt: newCount },
            },
        });

        return { success: false, error: 'Invalid email or password' };
    }

    // Upgrade hashes made with older, weaker scrypt parameters while the
    // plaintext is at hand (it never is otherwise).
    if (passwordNeedsRehash(user.passwordHash)) {
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: await hashPassword(password) },
        });
    }

    // Reset failed count on success
    if (user.failedLoginCount > 0 || user.lockoutUntil) {
        await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: 0, lockoutUntil: null },
        });
    }

    // Check if 2FA is required
    if (user.twoFactorMethod !== 'NONE') {
        const session = await getSession();
        session.requires2FA = true;
        session.tempUserId = user.id;
        await session.save();

        if (user.twoFactorMethod === 'EMAIL') {
            await sendEmailOTP(user.id, user.email, ipAddress);
        }

        return {
            success: true,
            requires2FA: true,
            twoFactorMethod: user.twoFactorMethod as 'TOTP' | 'EMAIL',
            userId: user.id,
        };
    }

    const sessionToken = await createSession(user.id, user.email, deviceInfo, ipAddress);

    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    await session.save();

    const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });

    return {
        success: true,
        userId: user.id,
        email: user.email,
        sessionToken,
        suggestPasskeySetup: passkeyCount === 0,
    };
}

// 2FA VERIFICATION (TOTP + Recovery + Email OTP)

export async function verify2FA(
    code: string,
    deviceInfo: string,
    ipAddress: string,
): Promise<AuthResult> {
    const session = await getSession();

    if (!session.requires2FA || !session.tempUserId) {
        return { success: false, error: '2FA not required or session expired' };
    }

    // Per account, not just per IP: rotating addresses must not buy more guesses.
    if (!(await verify2FAAccountRateLimit(session.tempUserId)).allowed) {
        return { success: false, error: 'Too many attempts. Please wait and try again.' };
    }

    const user = await prisma.user.findUnique({
        where: { id: session.tempUserId },
        select: {
            id: true,
            email: true,
            totpSecret: true,
            totpEnabled: true,
            twoFactorMethod: true,
        },
    });

    if (!user) {
        return { success: false, error: 'Invalid user or 2FA not configured' };
    }

    let isValid = false;
    let usedRecoveryCode = false;

    if (user.twoFactorMethod === 'EMAIL') {
        // Verify email OTP
        isValid = await verifyEmailOTP(user.id, code);
    } else if (user.twoFactorMethod === 'TOTP') {
        // Check if code looks like a recovery code (XXXX-XXXX or 8 chars)
        const normalized = normalizeRecoveryCode(code);
        if (normalized.length === 8) {
            // Try recovery codes
            const recoveryCodes = await prisma.recoveryCode.findMany({
                where: { userId: user.id, usedAt: null },
            });

            for (const rc of recoveryCodes) {
                if (verifyRecoveryCodeHash(code, rc.codeHash)) {
                    await prisma.recoveryCode.update({
                        where: { id: rc.id },
                        data: { usedAt: new Date() },
                    });
                    isValid = true;
                    usedRecoveryCode = true;
                    break;
                }
            }
        } else if (user.totpSecret && user.totpEnabled) {
            const totpSecret = openField(user.totpSecret, 'User', 'totpSecret', user.id);
            isValid = verifyTOTP(totpSecret, code);
        }
    }

    if (!isValid) {
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'Invalid 2FA code', method: user.twoFactorMethod },
            },
        });
        return { success: false, error: 'Invalid verification code' };
    }

    if (usedRecoveryCode) {
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_RECOVERY_CODE_USED',
                ipAddress,
                userAgent: deviceInfo,
            },
        });
    }

    const sessionToken = await createSession(user.id, user.email, deviceInfo, ipAddress);

    session.userId = user.id;
    session.email = user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    session.requires2FA = undefined;
    session.tempUserId = undefined;
    await session.save();

    const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });

    return {
        success: true,
        userId: user.id,
        email: user.email,
        sessionToken,
        suggestPasskeySetup: passkeyCount === 0,
    };
}

// 2FA SETUP — TOTP

/**
 * Enable TOTP 2FA. Returns plaintext recovery codes (shown once to user).
 */
export async function enable2FA(
    userId: string,
    totpSecret: string,
    verificationCode: string,
): Promise<{ success: boolean; error?: string; recoveryCodes?: string[] }> {
    const isValid = verifyTOTP(totpSecret, verificationCode);
    if (!isValid) {
        return { success: false, error: 'Invalid verification code' };
    }

    const encryptedSecret = sealField(totpSecret, 'User', 'totpSecret', userId);

    // Generate & store recovery codes
    const plainCodes = generateRecoveryCodes();
    const codeHashes = plainCodes.map(hashRecoveryCode);

    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: {
                totpSecret: encryptedSecret,
                totpEnabled: true,
                twoFactorMethod: 'TOTP',
            },
        }),
        prisma.recoveryCode.deleteMany({ where: { userId } }),
        ...codeHashes.map((codeHash) => prisma.recoveryCode.create({ data: { userId, codeHash } })),
        prisma.auditLog.create({
            data: { userId, action: 'USER_2FA_ENABLED', details: { method: 'TOTP' } },
        }),
    ]);
    notifySecurityEvent(userId, '2fa_enabled');

    return { success: true, recoveryCodes: plainCodes };
}

// 2FA SETUP — EMAIL OTP

/**
 * Enable Email OTP as 2FA method.
 */
export async function enableEmailOTP(
    userId: string,
): Promise<{ success: boolean; error?: string }> {
    await prisma.user.update({
        where: { id: userId },
        data: {
            emailOtpEnabled: true,
            twoFactorMethod: 'EMAIL',
        },
    });

    await prisma.auditLog.create({
        data: { userId, action: 'USER_2FA_ENABLED', details: { method: 'EMAIL' } },
    });
    notifySecurityEvent(userId, '2fa_enabled');

    return { success: true };
}

// 2FA DISABLE

export async function disable2FA(
    userId: string,
    password: string,
): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
    });

    if (!user) {
        return { success: false, error: 'User not found' };
    }

    if (!user.passwordHash) {
        return {
            success: false,
            error: 'This account uses Google Sign-In and does not have a password.',
        };
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
        return { success: false, error: 'Invalid password' };
    }

    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: {
                totpSecret: null,
                totpEnabled: false,
                emailOtpEnabled: false,
                twoFactorMethod: 'NONE',
            },
        }),
        prisma.recoveryCode.deleteMany({ where: { userId } }),
        prisma.auditLog.create({
            data: { userId, action: 'USER_2FA_DISABLED' },
        }),
    ]);
    notifySecurityEvent(userId, '2fa_disabled');

    return { success: true };
}

// AUTH UTILITIES

export async function getCurrentUser() {
    const session = await getSession();

    if (!session.isLoggedIn || !session.userId || !session.sessionToken) {
        return null;
    }

    const valid = await validateSession(session.sessionToken);
    // A locked session is signed out for everything but unlocking.
    if (!valid || valid.lockedAt) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
            id: true,
            email: true,
            name: true,
            totpEnabled: true,
            emailOtpEnabled: true,
            twoFactorMethod: true,
            passkeyEnabled: true,
            passwordLoginDisabled: true,
            isActive: true,
            isVerified: true,
            createdAt: true,
            passwordHash: true,
            lockAfterMinutes: true,
        },
    });

    if (!user || !user.isActive) return null;
    return user;
}

/**
 * The signed-in user of a *locked* session (for the lock screen and the
 * unlock route), or null when the session isn't locked or isn't valid.
 */
export async function getLockedSessionUser() {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId || !session.sessionToken) return null;
    const valid = await validateSession(session.sessionToken);
    if (!valid?.lockedAt || valid.userId !== session.userId) return null;
    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, passwordHash: true, passkeyEnabled: true, isActive: true },
    });
    if (!user?.isActive) return null;
    return { ...user, sessionToken: session.sessionToken, sessionRowId: valid.sessionId };
}

export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            passwordHash: true,
        },
    });

    if (!user) return { success: false, error: 'User not found' };
    if (!user.passwordHash)
        return { success: false, error: 'Account uses Google Sign-In — no password to change' };

    const passwordValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!passwordValid) return { success: false, error: 'Current password is incorrect' };

    const newPasswordHash = await hashPassword(newPassword);

    // Server credentials are encrypted with the server's own key, not one
    // derived from the password, so nothing needs re-encrypting.
    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: userId },
            data: { passwordHash: newPasswordHash },
        });

        await tx.session.updateMany({
            where: { userId, isRevoked: false },
            data: { isRevoked: true, revokedAt: new Date(), revokedReason: 'Password changed' },
        });

        await tx.auditLog.create({
            data: { userId, action: 'USER_PASSWORD_CHANGED' },
        });
    });
    notifySecurityEvent(userId, 'password_changed');

    return { success: true };
}

// PASSWORD RESET

async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const nodemailer = await import('nodemailer');
    const transporter = process.env.SMTP_HOST
        ? nodemailer.default.createTransport({
              host: process.env.SMTP_HOST,
              port: parseInt(process.env.SMTP_PORT || '587', 10),
              secure: process.env.SMTP_SECURE === 'true',
              auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          })
        : nodemailer.default.createTransport({ streamTransport: true, newline: 'unix' });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://termi.run';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Termi" <noreply@termi.run>',
        to: email,
        subject: 'Reset your Termi password',
        html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2>Reset your password</h2>
          <p><strong>Warning:</strong> Resetting your password will permanently delete all your stored server credentials. This is by design — credentials are encrypted with a key derived from your password.</p>
          <p>Click below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#ef4444;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
            Reset Password (Deletes Server Credentials)
          </a>
          <p style="color:#999;font-size:12px">If you didn't request a password reset, ignore this email.</p>
        </div>
        `,
    });

    // Dev fallback only: when no SMTP is configured, surface the reset link in
    // the server log so local setups can still reset. Never do this in
    // production — the URL contains a single-use reset token.
    if (!process.env.SMTP_HOST && process.env.NODE_ENV !== 'production') {
        console.log('[PasswordReset] Reset URL (dev only):', resetUrl);
    }
}

export async function forgotPassword(email: string): Promise<void> {
    // Always return without revealing if email exists (prevents enumeration)
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, passwordHash: true },
    });

    // Only email/password accounts can reset password
    if (!user || !user.passwordHash) return;

    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
        where: { id: user.id },
        data: {
            passwordResetToken: tokenHash,
            passwordResetExpiresAt: expiresAt,
        },
    });

    await prisma.auditLog.create({
        data: { userId: user.id, action: 'USER_PASSWORD_RESET_REQUESTED', details: { email } },
    });

    await sendPasswordResetEmail(user.email, token).catch((err) =>
        console.error('Failed to send password reset email:', err),
    );
}

export async function resetPassword(
    token: string,
    newPassword: string,
): Promise<{ success: boolean; error?: string }> {
    const tokenHash = hashToken(token);

    const user = await prisma.user.findFirst({
        where: {
            passwordResetToken: tokenHash,
            passwordResetExpiresAt: { gt: new Date() },
        },
        select: { id: true, email: true },
    });

    if (!user) {
        return { success: false, error: 'Reset link is invalid or has expired' };
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
        // Servers are kept: their credentials are encrypted with the server's
        // own key, not one derived from the password, so a reset loses nothing.
        // Every existing session is revoked below.
        await tx.user.update({
            where: { id: user.id },
            data: {
                passwordHash: newPasswordHash,
                // The emailed link proves ownership; let the owner back in by password.
                passwordLoginDisabled: false,
                passwordResetToken: null,
                passwordResetExpiresAt: null,
            },
        });

        // Revoke all sessions
        await tx.session.updateMany({
            where: { userId: user.id, isRevoked: false },
            data: { isRevoked: true, revokedAt: new Date(), revokedReason: 'Password reset' },
        });

        await tx.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_PASSWORD_RESET',
                details: { serversDeleted: false },
            },
        });
    });
    notifySecurityEvent(user.id, 'password_reset');

    return { success: true };
}
