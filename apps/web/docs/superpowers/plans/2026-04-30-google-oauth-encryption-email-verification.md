# Google OAuth, Encryption, Email Verification & Password Reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google OAuth login, auto-derive master encryption keys from passwords, build encryption setup/unlock UI for Google users, enforce email verification banner, and implement forgot-password flow that intentionally destroys server credentials.

**Architecture:** Arctic handles the Google OAuth2 PKCE dance; the existing iron-session stores the derived masterKey (hex) for the session lifetime. Email/password users get a masterKey silently derived from their login password. Google users set an explicit passphrase stored the same way. Password reset wipes `masterKeyHash`/`masterKeySalt` and deletes all server records.

**Tech Stack:** Next.js 15 App Router, Prisma (PostgreSQL), iron-session, arctic (Google OAuth2), existing AES-256-GCM + PBKDF2 crypto utilities.

---

## File Map

| Action | File |
|--------|------|
| Modify | `apps/web/prisma/schema.prisma` |
| Modify | `apps/web/src/lib/auth/session.ts` |
| Modify | `apps/web/src/lib/rate-limit.ts` |
| Modify | `apps/web/src/lib/auth/auth.ts` |
| Modify | `apps/web/src/lib/auth/index.ts` |
| Create | `apps/web/src/lib/auth/google-oauth.ts` |
| Create | `apps/web/src/app/api/auth/google/authorize/route.ts` |
| Create | `apps/web/src/app/api/auth/google/callback/route.ts` |
| Create | `apps/web/src/app/api/auth/forgot-password/route.ts` |
| Create | `apps/web/src/app/api/auth/reset-password/route.ts` |
| Create | `apps/web/src/app/api/auth/setup-encryption/route.ts` |
| Create | `apps/web/src/app/api/auth/unlock-encryption/route.ts` |
| Create | `apps/web/src/app/api/auth/reset-encryption-key/route.ts` |
| Create | `apps/web/src/app/api/auth/send-verification/route.ts` |
| Modify | `apps/web/src/app/api/auth/register/route.ts` |
| Modify | `apps/web/src/app/api/auth/me/route.ts` |
| Create | `apps/web/src/app/setup-encryption/layout.tsx` |
| Create | `apps/web/src/app/setup-encryption/page.tsx` |
| Create | `apps/web/src/app/unlock-encryption/layout.tsx` |
| Create | `apps/web/src/app/unlock-encryption/page.tsx` |
| Create | `apps/web/src/app/forgot-password/layout.tsx` |
| Create | `apps/web/src/app/forgot-password/page.tsx` |
| Create | `apps/web/src/app/reset-password/layout.tsx` |
| Create | `apps/web/src/app/reset-password/page.tsx` |
| Modify | `apps/web/src/app/login/page.tsx` |
| Modify | `apps/web/src/app/register/page.tsx` |
| Modify | `apps/web/src/app/dashboard/layout.tsx` |
| Modify | `apps/web/src/app/dashboard/settings/page.tsx` |

---

## Task 1: Prisma Schema Changes

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Update the User model — make passwordHash nullable, add password reset fields, and add OAuthAccount relation**

In `apps/web/prisma/schema.prisma`, apply these changes to the `User` model (find the exact lines and replace):

Change `passwordHash String // scrypt hash` to:
```prisma
passwordHash String? // scrypt hash — null for OAuth-only users
```

Add after `masterKeySalt String?`:
```prisma
// Password reset (email/password users only)
passwordResetToken     String?
passwordResetExpiresAt DateTime?
```

Add to User relations (after `pushSubscriptions PushSubscription[]`):
```prisma
oauthAccounts OAuthAccount[]
```

- [ ] **Step 2: Add the OAuthAccount model at the end of the file, before the enums section**

```prisma
// ============================================================================
// OAUTH ACCOUNTS
// ============================================================================

model OAuthAccount {
  id                String   @id @default(cuid())
  userId            String
  provider          String   // e.g., "GOOGLE"
  providerAccountId String   // Provider's user ID (Google `sub`)
  email             String
  createdAt         DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

- [ ] **Step 3: Create and apply the migration**

```bash
cd /path/to/termi
npm run db:migrate
# When prompted for migration name, enter: add_oauth_accounts_and_password_reset
npm run db:generate
```

Expected: Migration created and applied, Prisma client regenerated with new `OAuthAccount` type and nullable `passwordHash`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations/
git commit -m "feat(db): add OAuthAccount model, nullable passwordHash, password reset fields"
```

---

## Task 2: Session Types & Rate Limiters

**Files:**
- Modify: `apps/web/src/lib/auth/session.ts`
- Modify: `apps/web/src/lib/rate-limit.ts`

- [ ] **Step 1: Add Google OAuth temporary fields to SessionData in `session.ts`**

Find the `SessionData` interface and add after `passkeyAuthUserId`:
```typescript
// Temporary fields used during Google OAuth dance (cleared after callback)
googleOAuthState?: string;
googleCodeVerifier?: string;
// Temporary masterKey during 2FA pending state
tempMasterKey?: string;
```

Also update `destroySession()` — add these fields to the clear block (after `session.passkeyAuthUserId = undefined`):
```typescript
session.googleOAuthState = undefined;
session.googleCodeVerifier = undefined;
session.tempMasterKey = undefined;
```

- [ ] **Step 2: Add rate limiters to `rate-limit.ts`**

Append to the end of `apps/web/src/lib/rate-limit.ts`:
```typescript
/** 3 forgot-password requests per hour per IP */
export function forgotPasswordRateLimit(ip: string): RateLimitResult {
    return rateLimit(`forgot-password:${ip}`, 3, 60 * 60 * 1000);
}

/** 3 resend-verification requests per hour per user */
export function sendVerificationRateLimit(userId: string): RateLimitResult {
    return rateLimit(`send-verification:${userId}`, 3, 60 * 60 * 1000);
}
```

- [ ] **Step 3: Run existing tests to confirm nothing is broken**

```bash
cd apps/web && npm run test -- --run
```

Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth/session.ts apps/web/src/lib/rate-limit.ts
git commit -m "feat(auth): add OAuth session fields and rate limiters for forgot-password and send-verification"
```

---

## Task 3: Core auth.ts Modifications (registerUser, loginUser, verify2FA, changePassword)

**Files:**
- Modify: `apps/web/src/lib/auth/auth.ts`

- [ ] **Step 1: Write the failing test for the new registerUser behavior**

Create `apps/web/src/lib/auth/auth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma and crypto for unit testing
vi.mock('@/lib/db', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        auditLog: { create: vi.fn() },
    },
}));

vi.mock('@/lib/crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/crypto')>();
    return {
        ...actual,
        hashPassword: vi.fn().mockResolvedValue('hashed-password'),
        generateSalt: vi.fn().mockReturnValue(Buffer.alloc(32, 1)),
        deriveMasterKey: vi.fn().mockReturnValue(Buffer.alloc(32, 2)),
        hashDerivedKey: vi.fn().mockReturnValue('hashed-derived-key'),
    };
});

import { registerUser } from './auth';
import { prisma } from '@/lib/db';

describe('registerUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'user-1',
            email: 'test@example.com',
        });
        (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    });

    it('always creates user with masterKeyHash and masterKeySalt derived from password', async () => {
        const result = await registerUser({ email: 'test@example.com', password: 'Password1' });

        expect(result.success).toBe(true);
        const createCall = (prisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(createCall.data.masterKeyHash).toBe('hashed-derived-key');
        expect(createCall.data.masterKeySalt).toBeDefined();
        expect(createCall.data.passwordHash).toBe('hashed-password');
    });

    it('normalizes email to lowercase', async () => {
        await registerUser({ email: 'TEST@Example.com', password: 'Password1' });
        const createCall = (prisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(createCall.data.email).toBe('test@example.com');
    });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/web && npm run test -- auth.test --run
```

Expected: FAIL — `registerUser` currently only derives masterKey when `masterKey` param is provided.

- [ ] **Step 3: Update `registerUser` in `auth.ts` to always auto-derive masterKey**

Replace the `RegisterInput` interface:
```typescript
export interface RegisterInput {
    email: string;
    password: string;
    // masterKey removed — now auto-derived from password
}
```

Replace the entire `registerUser` function body (the part after `const { email, password, masterKey } = input;`):
```typescript
export async function registerUser(input: RegisterInput): Promise<AuthResult> {
    const { email, password } = input;

    const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
    });

    if (existing) {
        return { success: false, error: 'Email already registered' };
    }

    const passwordHash = await hashPassword(password);

    // Always auto-derive masterKey from password (no explicit passphrase needed)
    const salt = generateSalt();
    const derived = deriveMasterKey(password, salt);
    const masterKeyHash = hashDerivedKey(derived);
    const masterKeySalt = salt.toString('base64');

    const user = await prisma.user.create({
        data: {
            email: email.toLowerCase(),
            passwordHash,
            masterKeyHash,
            masterKeySalt,
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
```

- [ ] **Step 4: Update `loginUser` to derive masterKey into session and handle null passwordHash**

Find the `loginUser` function. Replace the query and password verification section. The full updated `loginUser` function:

```typescript
export async function loginUser(input: LoginInput): Promise<AuthResult> {
    const { email, password, deviceInfo, ipAddress } = input;

    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
            id: true,
            email: true,
            passwordHash: true,
            masterKeyHash: true,
            masterKeySalt: true,
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

    // Google-only users have no password
    if (!user.passwordHash) {
        return { success: false, error: 'This account uses Google Sign-In. Please sign in with Google.' };
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
        const lockout = newCount >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : null;

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

    // Reset failed count on success
    if (user.failedLoginCount > 0 || user.lockoutUntil) {
        await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: 0, lockoutUntil: null },
        });
    }

    // Derive master key for session encryption
    let derivedMasterKey: string | undefined;
    if (user.masterKeySalt) {
        const salt = Buffer.from(user.masterKeySalt, 'base64');
        const derived = deriveMasterKey(password, salt);
        derivedMasterKey = derived.toString('hex');
    } else {
        // Migrate existing user: auto-generate masterKey from their password
        const salt = generateSalt();
        const derived = deriveMasterKey(password, salt);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                masterKeyHash: hashDerivedKey(derived),
                masterKeySalt: salt.toString('base64'),
            },
        });
        derivedMasterKey = derived.toString('hex');
    }

    // Check if 2FA is required
    if (user.twoFactorMethod !== 'NONE') {
        const session = await getSession();
        session.requires2FA = true;
        session.tempUserId = user.id;
        session.tempMasterKey = derivedMasterKey; // carry through 2FA
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
    session.masterKey = derivedMasterKey;
    await session.save();

    const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });

    return { success: true, userId: user.id, email: user.email, sessionToken, suggestPasskeySetup: passkeyCount === 0 };
}
```

- [ ] **Step 5: Update `verify2FA` to carry tempMasterKey into the final session**

Find the section in `verify2FA` where the session is finalized (after `isValid` check passes), around line 317. Replace the session save block:

```typescript
    const sessionToken = await createSession(user.id, user.email, deviceInfo, ipAddress);

    session.userId = user.id;
    session.email = user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    session.requires2FA = undefined;
    session.tempUserId = undefined;
    session.masterKey = session.tempMasterKey; // promote tempMasterKey → masterKey
    session.tempMasterKey = undefined;
    await session.save();
```

- [ ] **Step 6: Update `changePassword` to re-derive masterKey and re-encrypt all servers**

Replace the entire `changePassword` function with:

```typescript
export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            passwordHash: true,
            masterKeySalt: true,
        },
    });

    if (!user) return { success: false, error: 'User not found' };
    if (!user.passwordHash) return { success: false, error: 'Account uses Google Sign-In — no password to change' };

    const passwordValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!passwordValid) return { success: false, error: 'Current password is incorrect' };

    // Derive old master key to re-encrypt servers
    let oldMasterKey: Buffer | undefined;
    if (user.masterKeySalt) {
        oldMasterKey = deriveMasterKey(currentPassword, Buffer.from(user.masterKeySalt, 'base64'));
    }

    // Derive new master key
    const newSalt = generateSalt();
    const newMasterKey = deriveMasterKey(newPassword, newSalt);
    const newMasterKeyHash = hashDerivedKey(newMasterKey);
    const newMasterKeySalt = newSalt.toString('base64');
    const newPasswordHash = await hashPassword(newPassword);

    // Re-encrypt all server credentials with new masterKey
    const { reEncryptCredentials } = await import('@/lib/crypto/credentials');
    const servers = await prisma.server.findMany({
        where: { userId },
        select: { id: true, host: true, username: true, password: true, privateKey: true, passphrase: true, notes: true },
    });

    await prisma.$transaction(async (tx) => {
        // Update password + masterKey
        await tx.user.update({
            where: { id: userId },
            data: {
                passwordHash: newPasswordHash,
                masterKeyHash: newMasterKeyHash,
                masterKeySalt: newMasterKeySalt,
            },
        });

        // Re-encrypt each server
        for (const server of servers) {
            const reEncrypted = reEncryptCredentials(
                {
                    host: server.host,
                    username: server.username,
                    password: server.password ?? undefined,
                    privateKey: server.privateKey ?? undefined,
                    passphrase: server.passphrase ?? undefined,
                    notes: server.notes ?? undefined,
                },
                oldMasterKey ? { masterKey: oldMasterKey } : undefined,
                { masterKey: newMasterKey }
            );
            await tx.server.update({
                where: { id: server.id },
                data: reEncrypted,
            });
        }

        await tx.auditLog.create({
            data: { userId, action: 'USER_PASSWORD_CHANGED' },
        });
    });

    return { success: true };
}
```

- [ ] **Step 7: Add `forgotPassword` and `resetPassword` functions to auth.ts**

Add these imports at the top of auth.ts (after existing imports):
```typescript
import { sendVerificationEmail } from './email-verification';
```

Also add a new import for the email transporter (we'll reuse the createTransporter pattern). Actually, add a new function at the end of the file for sending the password reset email. Add these two functions to the end of `auth.ts`:

```typescript
// ============================================================================
// PASSWORD RESET
// ============================================================================

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://termi.dp.shuvoo.com';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Termi" <noreply@termi.app>',
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

    if (!process.env.SMTP_HOST) {
        console.log('[PasswordReset] Reset URL:', resetUrl);
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
        console.error('Failed to send password reset email:', err)
    );
}

export async function resetPassword(
    token: string,
    newPassword: string
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
        // Delete ALL server records — credentials are now irretrievable
        await tx.server.deleteMany({ where: { userId: user.id } });

        // Update password, wipe master key, clear reset token
        await tx.user.update({
            where: { id: user.id },
            data: {
                passwordHash: newPasswordHash,
                masterKeyHash: null,
                masterKeySalt: null,
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
                details: { serversDeleted: true },
            },
        });
    });

    return { success: true };
}
```

- [ ] **Step 8: Add `setupEncryption`, `unlockEncryption`, and `resetEncryptionKey` functions to auth.ts**

Append to the end of `auth.ts`:

```typescript
// ============================================================================
// ENCRYPTION KEY MANAGEMENT (Google OAuth users)
// ============================================================================

export async function setupEncryption(
    userId: string,
    passphrase: string
): Promise<{ success: boolean; masterKey?: string; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { masterKeyHash: true },
    });

    if (!user) return { success: false, error: 'User not found' };
    if (user.masterKeyHash) return { success: false, error: 'Encryption already configured' };

    const salt = generateSalt();
    const derived = deriveMasterKey(passphrase, salt);

    await prisma.user.update({
        where: { id: userId },
        data: {
            masterKeyHash: hashDerivedKey(derived),
            masterKeySalt: salt.toString('base64'),
        },
    });

    await prisma.auditLog.create({
        data: { userId, action: 'USER_ENCRYPTION_SETUP' },
    });

    return { success: true, masterKey: derived.toString('hex') };
}

export async function unlockEncryption(
    userId: string,
    passphrase: string
): Promise<{ success: boolean; masterKey?: string; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { masterKeyHash: true, masterKeySalt: true },
    });

    if (!user || !user.masterKeySalt || !user.masterKeyHash) {
        return { success: false, error: 'Encryption not configured' };
    }

    const salt = Buffer.from(user.masterKeySalt, 'base64');
    const derived = deriveMasterKey(passphrase, salt);
    const candidateHash = hashDerivedKey(derived);

    if (candidateHash !== user.masterKeyHash) {
        return { success: false, error: 'Incorrect passphrase' };
    }

    return { success: true, masterKey: derived.toString('hex') };
}

export async function resetEncryptionKey(
    userId: string
): Promise<{ success: boolean }> {
    // Delete all servers — credentials permanently inaccessible
    await prisma.$transaction(async (tx) => {
        await tx.server.deleteMany({ where: { userId } });
        await tx.user.update({
            where: { id: userId },
            data: { masterKeyHash: null, masterKeySalt: null },
        });
        await tx.auditLog.create({
            data: { userId, action: 'USER_ENCRYPTION_KEY_RESET', details: { serversDeleted: true } },
        });
    });

    return { success: true };
}
```

- [ ] **Step 9: Run the test to confirm it passes**

```bash
cd apps/web && npm run test -- auth.test --run
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/auth/auth.ts apps/web/src/lib/auth/auth.test.ts
git commit -m "feat(auth): auto-derive masterKey on register/login, add forgot-password, reset-password, setup/unlock-encryption"
```

---

## Task 4: Install Arctic & Create Google OAuth Library

**Files:**
- Create: `apps/web/src/lib/auth/google-oauth.ts`

- [ ] **Step 1: Install arctic**

```bash
cd apps/web && npm install arctic
```

Expected: `arctic` added to `apps/web/package.json` dependencies.

- [ ] **Step 2: Create `apps/web/src/lib/auth/google-oauth.ts`**

```typescript
/**
 * Google OAuth2 integration using Arctic library
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL (for the callback URL)
 */

import { Google } from 'arctic';
import { prisma } from '@/lib/db';
import { generateSecureToken } from '@/lib/crypto';

function getGoogleClient(): Google {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:22080';
    const redirectURI = `${appUrl}/api/auth/google/callback`;
    return new Google(clientId, clientSecret, redirectURI);
}

export interface GoogleAuthURL {
    url: string;
    state: string;
    codeVerifier: string;
}

/**
 * Generate the Google OAuth2 authorization URL with PKCE
 */
export async function createGoogleAuthURL(): Promise<GoogleAuthURL> {
    const google = getGoogleClient();
    const state = generateSecureToken(16);
    const { createCodeVerifier, createCodeChallenge } = await import('arctic');
    const codeVerifier = createCodeVerifier();
    const codeChallenge = await createCodeChallenge(codeVerifier, 'S256');

    const url = google.createAuthorizationURL(state, codeChallenge, ['openid', 'email', 'profile']);

    return { url: url.toString(), state, codeVerifier };
}

export interface GoogleUserInfo {
    sub: string;         // Google's unique user ID
    email: string;
    emailVerified: boolean;
    name: string;
    picture?: string;
}

/**
 * Exchange authorization code for tokens and fetch user info
 */
export async function exchangeGoogleCode(
    code: string,
    codeVerifier: string
): Promise<GoogleUserInfo> {
    const google = getGoogleClient();
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);

    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Google user info: ${response.statusText}`);
    }

    const data = await response.json() as {
        sub: string;
        email: string;
        email_verified: boolean;
        name: string;
        picture?: string;
    };

    return {
        sub: data.sub,
        email: data.email,
        emailVerified: data.email_verified,
        name: data.name,
        picture: data.picture,
    };
}

export interface FindOrCreateGoogleUserResult {
    userId: string;
    email: string;
    isNewUser: boolean;
    hasMasterKey: boolean;
}

/**
 * Find or create a user from Google OAuth data.
 *
 * Cases:
 * A — New user: create User + OAuthAccount
 * B — Returning Google user: OAuthAccount exists, return user
 * C — Existing email/password user: link OAuthAccount to existing user
 */
export async function findOrCreateGoogleUser(
    googleInfo: GoogleUserInfo
): Promise<FindOrCreateGoogleUserResult> {
    const { sub, email } = googleInfo;

    // Case B: existing OAuthAccount
    const existingOAuth = await prisma.oAuthAccount.findUnique({
        where: {
            provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: sub },
        },
        include: { user: { select: { id: true, email: true, masterKeyHash: true } } },
    });

    if (existingOAuth) {
        return {
            userId: existingOAuth.user.id,
            email: existingOAuth.user.email,
            isNewUser: false,
            hasMasterKey: !!existingOAuth.user.masterKeyHash,
        };
    }

    // Case C: existing user with same email
    const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true, masterKeyHash: true },
    });

    if (existingUser) {
        // Link Google account to existing user
        await prisma.oAuthAccount.create({
            data: {
                userId: existingUser.id,
                provider: 'GOOGLE',
                providerAccountId: sub,
                email: email.toLowerCase(),
            },
        });

        await prisma.auditLog.create({
            data: {
                userId: existingUser.id,
                action: 'USER_OAUTH_LINKED',
                details: { provider: 'GOOGLE' },
            },
        });

        return {
            userId: existingUser.id,
            email: existingUser.email,
            isNewUser: false,
            hasMasterKey: !!existingUser.masterKeyHash,
        };
    }

    // Case A: brand new user
    const newUser = await prisma.user.create({
        data: {
            email: email.toLowerCase(),
            passwordHash: null, // Google-only user
            isVerified: true,   // Google emails are pre-verified
            oauthAccounts: {
                create: {
                    provider: 'GOOGLE',
                    providerAccountId: sub,
                    email: email.toLowerCase(),
                },
            },
        },
        select: { id: true, email: true },
    });

    await prisma.auditLog.create({
        data: {
            userId: newUser.id,
            action: 'USER_REGISTER',
            details: { authMethod: 'google' },
        },
    });

    return {
        userId: newUser.id,
        email: newUser.email,
        isNewUser: true,
        hasMasterKey: false,
    };
}
```

- [ ] **Step 3: Update `apps/web/src/lib/auth/index.ts` to export new functions**

Add to `index.ts`:
```typescript
export * from './google-oauth';
```

Also add (these are the new auth.ts exports):
```typescript
// forgotPassword, resetPassword, setupEncryption, unlockEncryption, resetEncryptionKey
// are already covered by "export * from './auth'"
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth/google-oauth.ts apps/web/src/lib/auth/index.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat(auth): add Google OAuth library with Arctic (PKCE, findOrCreateGoogleUser)"
```

---

## Task 5: Google OAuth API Routes

**Files:**
- Create: `apps/web/src/app/api/auth/google/authorize/route.ts`
- Create: `apps/web/src/app/api/auth/google/callback/route.ts`

- [ ] **Step 1: Create `apps/web/src/app/api/auth/google/authorize/route.ts`**

```typescript
/**
 * GET /api/auth/google/authorize
 * Initiates Google OAuth2 PKCE flow
 */

import { NextResponse } from 'next/server';
import { createGoogleAuthURL } from '@/lib/auth/google-oauth';
import { getSession } from '@/lib/auth/session';

export async function GET() {
    try {
        const { url, state, codeVerifier } = await createGoogleAuthURL();

        // Store state + codeVerifier in session for validation in callback
        const session = await getSession();
        session.googleOAuthState = state;
        session.googleCodeVerifier = codeVerifier;
        await session.save();

        return NextResponse.redirect(url);
    } catch (error) {
        console.error('Google OAuth authorize error:', error);
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL || ''}/login?error=oauth_failed`
        );
    }
}
```

- [ ] **Step 2: Create `apps/web/src/app/api/auth/google/callback/route.ts`**

```typescript
/**
 * GET /api/auth/google/callback
 * Handles the Google OAuth2 callback
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { exchangeGoogleCode, findOrCreateGoogleUser } from '@/lib/auth/google-oauth';
import { createSession } from '@/lib/auth/session';

export async function GET(request: Request) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.redirect(`${appUrl}/login?error=oauth_cancelled`);
    }

    if (!code || !state) {
        return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
    }

    const session = await getSession();

    // Validate state nonce (CSRF protection)
    if (!session.googleOAuthState || session.googleOAuthState !== state) {
        session.googleOAuthState = undefined;
        session.googleCodeVerifier = undefined;
        await session.save();
        return NextResponse.redirect(`${appUrl}/login?error=oauth_state`);
    }

    const codeVerifier = session.googleCodeVerifier;
    if (!codeVerifier) {
        return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
    }

    // Clear OAuth state immediately
    session.googleOAuthState = undefined;
    session.googleCodeVerifier = undefined;
    await session.save();

    try {
        const googleUser = await exchangeGoogleCode(code, codeVerifier);
        const { userId, email, isNewUser, hasMasterKey } = await findOrCreateGoogleUser(googleUser);

        const deviceInfo = request.headers.get('user-agent') || 'Unknown';
        const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || '0.0.0.0';

        const sessionToken = await createSession(userId, email, deviceInfo, ipAddress);

        session.userId = userId;
        session.email = email;
        session.sessionToken = sessionToken;
        session.isLoggedIn = true;
        // Note: masterKey is NOT set — Google users must unlock it separately
        await session.save();

        // Determine where to redirect
        if (isNewUser || !hasMasterKey) {
            return NextResponse.redirect(`${appUrl}/setup-encryption`);
        }
        return NextResponse.redirect(`${appUrl}/unlock-encryption`);
    } catch (err) {
        console.error('Google OAuth callback error:', err);
        return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/auth/google/
git commit -m "feat(api): add Google OAuth authorize and callback routes"
```

---

## Task 6: Forgot-Password & Reset-Password API Routes + Pages

**Files:**
- Create: `apps/web/src/app/api/auth/forgot-password/route.ts`
- Create: `apps/web/src/app/api/auth/reset-password/route.ts`
- Create: `apps/web/src/app/forgot-password/layout.tsx`
- Create: `apps/web/src/app/forgot-password/page.tsx`
- Create: `apps/web/src/app/reset-password/layout.tsx`
- Create: `apps/web/src/app/reset-password/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/api/auth/forgot-password/route.ts`**

```typescript
/**
 * POST /api/auth/forgot-password
 */

import { z } from 'zod';
import { forgotPassword } from '@/lib/auth';
import { validateBody, successResponse, getClientIP } from '@/lib/api';
import { forgotPasswordRateLimit } from '@/lib/rate-limit';

const schema = z.object({
    email: z.string().email(),
});

export async function POST(request: Request) {
    const ip = getClientIP(request);
    const rl = forgotPasswordRateLimit(ip);
    if (!rl.allowed) {
        // Always return success to prevent timing-based enumeration
        return successResponse({ message: 'If that email exists, a reset link has been sent.' });
    }

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    // Fire and forget — never reveals if email exists
    forgotPassword(validation.data.email).catch((err) =>
        console.error('forgotPassword error:', err)
    );

    return successResponse({ message: 'If that email exists, a reset link has been sent.' });
}
```

- [ ] **Step 2: Create `apps/web/src/app/api/auth/reset-password/route.ts`**

```typescript
/**
 * POST /api/auth/reset-password
 */

import { z } from 'zod';
import { resetPassword } from '@/lib/auth';
import { validateBody, successResponse, errorResponse } from '@/lib/api';

const schema = z.object({
    token: z.string().min(1),
    newPassword: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain uppercase, lowercase, and a number'
        ),
});

export async function POST(request: Request) {
    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const { token, newPassword } = validation.data;

    try {
        const result = await resetPassword(token, newPassword);
        if (!result.success) {
            return errorResponse(result.error || 'Failed to reset password', 400);
        }
        return successResponse({ message: 'Password reset successfully. Please log in.' });
    } catch (error) {
        console.error('Reset password error:', error);
        return errorResponse('Failed to reset password', 500);
    }
}
```

- [ ] **Step 3: Create `apps/web/src/app/forgot-password/layout.tsx`**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Forgot Password — Termi',
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {children}
        </div>
    );
}
```

- [ ] **Step 4: Create `apps/web/src/app/forgot-password/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            // Always show sent — never reveal if email exists
            setSent(true);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md border-border bg-card">
            <CardContent className="pt-8 pb-6 px-8">
                <div className="flex flex-col items-center mb-6">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <h1 className="text-2xl font-bold">Forgot Password</h1>
                </div>

                {sent ? (
                    <div className="text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                            <Mail className="w-6 h-6 text-green-400" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            If that email address has an account, we've sent a password reset link.
                            Check your inbox.
                        </p>
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs text-yellow-300">
                            ⚠️ Resetting your password will permanently delete your stored server credentials.
                        </div>
                        <Button asChild variant="ghost" className="w-full">
                            <Link href="/login">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Sign In
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                            Enter your email address and we'll send a reset link.
                        </p>
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
                            ⚠️ Warning: Resetting your password will permanently delete all stored server credentials (passwords, private keys). This cannot be undone.
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoFocus
                            />
                        </div>
                        {error && <p className="text-sm text-red-400">{error}</p>}
                        <Button type="submit" className="w-full" disabled={loading || !email}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
                        </Button>
                        <Button asChild variant="ghost" className="w-full">
                            <Link href="/login">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Sign In
                            </Link>
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 5: Create `apps/web/src/app/reset-password/layout.tsx`**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Reset Password — Termi',
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {children}
        </div>
    );
}
```

- [ ] **Step 6: Create `apps/web/src/app/reset-password/page.tsx`**

```tsx
'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const requirements = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'Lowercase letter', met: /[a-z]/.test(password) },
        { label: 'Number', met: /\d/.test(password) },
    ];
    const allMet = requirements.every((r) => r.met);
    const passwordsMatch = password === confirm && confirm.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!allMet || !passwordsMatch) return;
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: password }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to reset password');
                return;
            }
            setSuccess(true);
            setTimeout(() => router.push('/login?reset=1'), 22080);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <p className="text-center text-sm text-red-400">
                Invalid reset link. <Link href="/forgot-password" className="underline">Request a new one</Link>.
            </p>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                <strong>Security notice:</strong> Resetting your password will permanently delete your stored server credentials. You'll need to re-add your servers after reset.
            </div>

            {success ? (
                <div className="text-center space-y-2">
                    <p className="text-green-400 font-medium">Password reset! Redirecting to login…</p>
                </div>
            ) : (
                <>
                    <div className="space-y-1">
                        <Label htmlFor="password">New Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pr-10"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <ul className="text-xs space-y-0.5 mt-1">
                            {requirements.map((r) => (
                                <li key={r.label} className={`flex items-center gap-1 ${r.met ? 'text-green-400' : 'text-muted-foreground'}`}>
                                    {r.met ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                    {r.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="confirm">Confirm Password</Label>
                        <Input
                            id="confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className={confirm.length > 0 ? (passwordsMatch ? 'border-green-500' : 'border-red-500') : ''}
                        />
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading || !allMet || !passwordsMatch}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset Password & Delete Server Credentials'}
                    </Button>
                </>
            )}
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <Card className="w-full max-w-md border-border bg-card">
            <CardContent className="pt-8 pb-6 px-8">
                <div className="flex flex-col items-center mb-6">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <h1 className="text-2xl font-bold">Reset Password</h1>
                </div>
                <Suspense fallback={<div className="h-8 bg-muted rounded animate-pulse" />}>
                    <ResetPasswordForm />
                </Suspense>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/auth/forgot-password/ apps/web/src/app/api/auth/reset-password/ apps/web/src/app/forgot-password/ apps/web/src/app/reset-password/
git commit -m "feat: add forgot-password and reset-password routes and pages"
```

---

## Task 7: Encryption Setup, Unlock & Reset-Encryption-Key API Routes + Pages

**Files:**
- Create: `apps/web/src/app/api/auth/setup-encryption/route.ts`
- Create: `apps/web/src/app/api/auth/unlock-encryption/route.ts`
- Create: `apps/web/src/app/api/auth/reset-encryption-key/route.ts`
- Create: `apps/web/src/app/setup-encryption/layout.tsx`
- Create: `apps/web/src/app/setup-encryption/page.tsx`
- Create: `apps/web/src/app/unlock-encryption/layout.tsx`
- Create: `apps/web/src/app/unlock-encryption/page.tsx`

- [ ] **Step 1: Create `apps/web/src/app/api/auth/setup-encryption/route.ts`**

```typescript
/**
 * POST /api/auth/setup-encryption
 * For Google OAuth users: set an explicit encryption passphrase for the first time
 */

import { z } from 'zod';
import { getCurrentUser, setupEncryption } from '@/lib/auth';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { getSession } from '@/lib/auth/session';

const schema = z.object({
    passphrase: z.string().min(8, 'Passphrase must be at least 8 characters').max(256),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    try {
        const result = await setupEncryption(user.id, validation.data.passphrase);
        if (!result.success) return errorResponse(result.error || 'Setup failed', 400);

        // Store masterKey in session immediately
        const session = await getSession();
        session.masterKey = result.masterKey;
        await session.save();

        return successResponse({ message: 'Encryption configured successfully' });
    } catch (err) {
        console.error('Setup encryption error:', err);
        return errorResponse('Failed to set up encryption', 500);
    }
}
```

- [ ] **Step 2: Create `apps/web/src/app/api/auth/unlock-encryption/route.ts`**

```typescript
/**
 * POST /api/auth/unlock-encryption
 * Verifies encryption passphrase and stores masterKey in session
 */

import { z } from 'zod';
import { getCurrentUser, unlockEncryption } from '@/lib/auth';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { getSession } from '@/lib/auth/session';

const schema = z.object({
    passphrase: z.string().min(1),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    try {
        const result = await unlockEncryption(user.id, validation.data.passphrase);
        if (!result.success) return errorResponse(result.error || 'Incorrect passphrase', 400);

        const session = await getSession();
        session.masterKey = result.masterKey;
        await session.save();

        return successResponse({ message: 'Encryption unlocked' });
    } catch (err) {
        console.error('Unlock encryption error:', err);
        return errorResponse('Failed to unlock encryption', 500);
    }
}
```

- [ ] **Step 3: Create `apps/web/src/app/api/auth/reset-encryption-key/route.ts`**

```typescript
/**
 * POST /api/auth/reset-encryption-key
 * Permanently deletes all server records and clears encryption key.
 * Used when a Google user forgets their encryption passphrase.
 */

import { getCurrentUser, resetEncryptionKey } from '@/lib/auth';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

export async function POST() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        await resetEncryptionKey(user.id);
        return successResponse({ message: 'Encryption key reset. All server credentials have been deleted.' });
    } catch (err) {
        console.error('Reset encryption key error:', err);
        return errorResponse('Failed to reset encryption key', 500);
    }
}
```

- [ ] **Step 4: Create `apps/web/src/app/setup-encryption/layout.tsx`**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Set Up Encryption — Termi',
};

export default function SetupEncryptionLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {children}
        </div>
    );
}
```

- [ ] **Step 5: Create `apps/web/src/app/setup-encryption/page.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';

function getStrength(p: string): { score: number; label: string; color: string } {
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 16) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[a-z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;

    if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { score, label: 'Fair', color: 'bg-yellow-500' };
    return { score, label: 'Strong', color: 'bg-green-500' };
}

export default function SetupEncryptionPage() {
    const router = useRouter();
    const [passphrase, setPassphrase] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkingUser, setCheckingUser] = useState(true);
    const [error, setError] = useState('');

    const strength = getStrength(passphrase);
    const passphraseMatch = passphrase === confirm && confirm.length > 0;

    useEffect(() => {
        // Redirect if user already has encryption set up
        fetch('/api/auth/me').then(async (res) => {
            const data = await res.json();
            if (!data.success) { router.push('/login'); return; }
            const user = data.data.user;
            if (user.hasMasterKey) {
                router.push('/dashboard');
                return;
            }
            setCheckingUser(false);
        }).catch(() => router.push('/login'));
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passphraseMatch || passphrase.length < 8) return;
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth/setup-encryption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passphrase }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Setup failed');
                return;
            }
            router.push('/dashboard');
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (checkingUser) {
        return (
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        );
    }

    return (
        <Card className="w-full max-w-md border-border bg-card">
            <CardContent className="pt-8 pb-6 px-8">
                <div className="flex flex-col items-center mb-6">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Set Up Encryption</h1>
                    <p className="text-sm text-muted-foreground text-center mt-2">
                        Your server credentials (passwords, private keys) will be encrypted with this passphrase.
                        You'll enter it each time you sign in with Google.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="passphrase">Encryption Passphrase</Label>
                        <div className="relative">
                            <Input
                                id="passphrase"
                                type={showPassphrase ? 'text' : 'password'}
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder="Choose a strong passphrase"
                                className="pr-10"
                                autoFocus
                                minLength={8}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassphrase(!showPassphrase)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            >
                                {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {passphrase && (
                            <div className="mt-1 space-y-1">
                                <div className="flex gap-1">
                                    {[1,2,3,4,5,6].map((i) => (
                                        <div
                                            key={i}
                                            className={`h-1 flex-1 rounded ${i <= strength.score ? strength.color : 'bg-muted'}`}
                                        />
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">Strength: {strength.label}</p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor="confirm">Confirm Passphrase</Label>
                        <Input
                            id="confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            placeholder="Repeat your passphrase"
                            className={confirm.length > 0 ? (passphraseMatch ? 'border-green-500' : 'border-red-500') : ''}
                        />
                        {passphraseMatch && (
                            <p className="text-xs text-green-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Passphrases match
                            </p>
                        )}
                    </div>

                    <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 text-xs text-sky-300">
                        ℹ️ This passphrase cannot be recovered. If you forget it, you'll need to reset it — which will delete all your server credentials.
                    </div>

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={loading || passphrase.length < 8 || !passphraseMatch}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set Up Encryption & Continue'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 6: Create `apps/web/src/app/unlock-encryption/layout.tsx`**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Unlock Encryption — Termi',
};

export default function UnlockEncryptionLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            {children}
        </div>
    );
}
```

- [ ] **Step 7: Create `apps/web/src/app/unlock-encryption/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';

export default function UnlockEncryptionPage() {
    const router = useRouter();
    const [passphrase, setPassphrase] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/unlock-encryption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passphrase }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Incorrect passphrase');
                return;
            }
            router.push('/dashboard');
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        setResetLoading(true);
        try {
            const res = await fetch('/api/auth/reset-encryption-key', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                router.push('/setup-encryption');
            }
        } catch {
            setError('Failed to reset encryption key.');
        } finally {
            setResetLoading(false);
        }
    };

    if (showResetConfirm) {
        return (
            <Card className="w-full max-w-md border-border bg-card">
                <CardContent className="pt-8 pb-6 px-8 space-y-4">
                    <div className="flex flex-col items-center mb-2">
                        <AlertTriangle className="w-12 h-12 text-red-400 mb-2" />
                        <h1 className="text-xl font-bold text-red-400">Delete All Server Credentials?</h1>
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                        This will permanently delete all your stored servers and credentials. This cannot be undone.
                    </p>
                    <Button
                        variant="destructive"
                        className="w-full"
                        onClick={handleReset}
                        disabled={resetLoading}
                    >
                        {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete Everything & Reset'}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setShowResetConfirm(false)}>
                        Cancel
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md border-border bg-card">
            <CardContent className="pt-8 pb-6 px-8">
                <div className="flex flex-col items-center mb-6">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Unlock Encryption</h1>
                    <p className="text-sm text-muted-foreground text-center mt-2">
                        Enter your encryption passphrase or account password to unlock your server credentials.
                    </p>
                </div>

                <form onSubmit={handleUnlock} className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="passphrase">Passphrase / Account Password</Label>
                        <div className="relative">
                            <Input
                                id="passphrase"
                                type={showPassphrase ? 'text' : 'password'}
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                className="pr-10"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassphrase(!showPassphrase)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            >
                                {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading || !passphrase}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock & Continue'}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => router.push('/dashboard')}
                    >
                        Skip for now (server connections won't work)
                    </Button>
                    <div className="text-center">
                        <button
                            type="button"
                            className="text-xs text-muted-foreground underline"
                            onClick={() => setShowResetConfirm(true)}
                        >
                            Forgot your passphrase?
                        </button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/auth/setup-encryption/ apps/web/src/app/api/auth/unlock-encryption/ apps/web/src/app/api/auth/reset-encryption-key/ apps/web/src/app/setup-encryption/ apps/web/src/app/unlock-encryption/
git commit -m "feat: add encryption setup, unlock, and reset-key routes and pages"
```

---

## Task 8: Resend Verification Email Endpoint

**Files:**
- Create: `apps/web/src/app/api/auth/send-verification/route.ts`

- [ ] **Step 1: Create `apps/web/src/app/api/auth/send-verification/route.ts`**

```typescript
/**
 * POST /api/auth/send-verification
 * Re-sends the verification email. Rate-limited to 3 per hour per user.
 */

import { getCurrentUser } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/auth/email-verification';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { sendVerificationRateLimit } from '@/lib/rate-limit';

export async function POST() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    if (user.isVerified) {
        return successResponse({ message: 'Email already verified' });
    }

    const rl = sendVerificationRateLimit(user.id);
    if (!rl.allowed) {
        return errorResponse('Too many requests. Please try again later.', 429);
    }

    try {
        await sendVerificationEmail(user.id, user.email);
        return successResponse({ message: 'Verification email sent' });
    } catch (err) {
        console.error('Send verification error:', err);
        return errorResponse('Failed to send verification email', 500);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/auth/send-verification/
git commit -m "feat(api): add send-verification resend endpoint with rate limiting"
```

---

## Task 9: Update /api/auth/me & /api/auth/register Routes

**Files:**
- Modify: `apps/web/src/app/api/auth/me/route.ts`
- Modify: `apps/web/src/app/api/auth/register/route.ts`
- Modify: `apps/web/src/lib/auth/auth.ts` (getCurrentUser)

- [ ] **Step 1: Update `getCurrentUser` in `auth.ts` to expose `isGoogleUser`**

Find the `getCurrentUser` function select block (around line 456) and add `passwordHash` to the select:
```typescript
select: {
    id: true,
    email: true,
    totpEnabled: true,
    emailOtpEnabled: true,
    twoFactorMethod: true,
    masterKeyHash: true,
    passkeyEnabled: true,
    isActive: true,
    isVerified: true,
    createdAt: true,
    passwordHash: true, // Add this line
},
```

- [ ] **Step 2: Update `/api/auth/me/route.ts` to include `isGoogleUser`**

Replace the `successResponse` call:
```typescript
return successResponse({
    user: {
        id: user.id,
        email: user.email,
        totpEnabled: user.totpEnabled,
        emailOtpEnabled: user.emailOtpEnabled,
        twoFactorMethod: user.twoFactorMethod,
        hasMasterKey: !!user.masterKeyHash,
        passkeyEnabled: user.passkeyEnabled,
        isVerified: user.isVerified,
        isGoogleUser: !user.passwordHash, // true for Google-only accounts
        createdAt: user.createdAt,
    },
});
```

- [ ] **Step 3: Update `/api/auth/register/route.ts` — remove masterKey from schema**

Replace the schema:
```typescript
const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain uppercase, lowercase, and a number'
        ),
    // masterKey removed — auto-derived from password
});
```

Replace the handler body to remove masterKey:
```typescript
const { email, password } = validation.data;

try {
    const result = await registerUser({ email, password });
    // ... rest unchanged
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/auth/me/route.ts apps/web/src/app/api/auth/register/route.ts apps/web/src/lib/auth/auth.ts
git commit -m "feat(api): expose isGoogleUser on /me, remove masterKey from register route"
```

---

## Task 10: Login Page — Google Button & Error Params

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Add Google OAuth button and error handling to the login page**

In `apps/web/src/app/login/page.tsx`:

a) Add Google icon import at the top. Since there's no Google icon in lucide-react, add an inline SVG component. Add this near the top of the file (after existing imports):

```tsx
function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
    );
}
```

b) Find the `useEffect` that handles `searchParams` (around line 50) and add the Google OAuth error handler:
```typescript
useEffect(() => {
    if (searchParams.get('verified') === '1') setInfo('Email verified successfully. You can now sign in.');
    if (searchParams.get('error') === 'verification-failed') setError(searchParams.get('message') || 'Email verification failed.');
    if (searchParams.get('error') === 'oauth_failed') setError('Google sign-in failed. Please try again.');
    if (searchParams.get('error') === 'oauth_state') setError('Authentication error. Please try again.');
    if (searchParams.get('error') === 'oauth_cancelled') setInfo('Google sign-in was cancelled.');
    if (searchParams.get('reset') === '1') setInfo('Password reset successfully. Please sign in with your new password.');
}, [searchParams]);
```

c) In the JSX, add the Google button. Find the section with the email/password form `<form>` and add a divider + Google button just ABOVE the `<form>` tag (before `<div className="space-y-4">`):

```tsx
{/* Google Sign-In */}
<div className="mb-6">
    <a
        href="/api/auth/google/authorize"
        className="flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent transition-colors text-sm font-medium"
    >
        <GoogleIcon className="w-5 h-5" />
        Continue with Google
    </a>
</div>

<div className="relative mb-6">
    <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
    </div>
    <div className="relative flex justify-center text-xs">
        <span className="bg-card px-2 text-muted-foreground">or sign in with email</span>
    </div>
</div>
```

d) Below the existing `Sign in` button in the form, add a "Forgot password?" link. Find the submit button and after it add:
```tsx
<div className="text-center">
    <Link
        href="/forgot-password"
        className="text-xs text-muted-foreground hover:text-foreground underline"
    >
        Forgot your password?
    </Link>
</div>
```

e) Below the existing `Don't have an account?` link, check if it exists and ensure it links to `/register`. Also add it if not present.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/login/page.tsx
git commit -m "feat(ui): add Google sign-in button and forgot password link to login page"
```

---

## Task 11: Register Page — Remove Master Key Section

**Files:**
- Modify: `apps/web/src/app/register/page.tsx`

- [ ] **Step 1: Remove master key UI from register page**

In `apps/web/src/app/register/page.tsx`:

a) Remove `masterKey` and `useMasterKey` from the `formData` state:
```typescript
const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    // masterKey and useMasterKey removed — auto-derived from password
});
```

b) In `handleSubmit`, remove `masterKey` from the request body:
```typescript
body: JSON.stringify({
    email: formData.email,
    password: formData.password,
    // masterKey removed
}),
```

c) Remove the entire master key checkbox/input section from the JSX (the section with `useMasterKey` checkbox and `masterKey` input field).

d) Add a small info note in the form explaining encryption is automatic:
```tsx
<div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 text-xs text-sky-300">
    🔒 Your server credentials will be automatically encrypted using a key derived from your password. Keep your password safe — losing it means losing access to stored credentials.
</div>
```

e) Also add the Google sign-in option to the register page. Above the form, add:
```tsx
<div className="mb-6">
    <a
        href="/api/auth/google/authorize"
        className="flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent transition-colors text-sm font-medium"
    >
        <GoogleIcon className="w-5 h-5" />
        Continue with Google
    </a>
</div>
<div className="relative mb-6">
    <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
    </div>
    <div className="relative flex justify-center text-xs">
        <span className="bg-card px-2 text-muted-foreground">or register with email</span>
    </div>
</div>
```

(Add the same `GoogleIcon` component to this file.)

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/register/page.tsx
git commit -m "feat(ui): remove master key setup from register, add Google sign-in, add auto-encryption note"
```

---

## Task 12: Dashboard Layout — Email Verification Banner

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Update the `User` interface in `dashboard/layout.tsx` to include `isVerified` and `isGoogleUser`**

Find the `User` interface near the top:
```typescript
interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    hasMasterKey: boolean;
    isVerified: boolean;       // Add this
    isGoogleUser: boolean;     // Add this
}
```

- [ ] **Step 2: Add verification banner state and resend handler in `LayoutInner`**

After the existing state declarations (`const [sidebarOpen, setSidebarOpen] = useState(false);`), add:
```typescript
const [resendingVerification, setResendingVerification] = useState(false);
const [verificationSent, setVerificationSent] = useState(false);

const handleResendVerification = async () => {
    setResendingVerification(true);
    try {
        await fetch('/api/auth/send-verification', { method: 'POST' });
        setVerificationSent(true);
    } finally {
        setResendingVerification(false);
    }
};
```

- [ ] **Step 3: Add the banner to the JSX**

In the JSX, find the `<div className="lg:pl-64">` wrapper and add the banner as the FIRST child, before the `<header>`:

```tsx
{/* Email verification banner */}
{user && !user.isVerified && !user.isGoogleUser && (
    <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-yellow-300">
            <Mail className="w-4 h-4 shrink-0" />
            <span>Please verify your email address to secure your account.</span>
        </div>
        <button
            onClick={handleResendVerification}
            disabled={resendingVerification || verificationSent}
            className="text-xs font-medium text-yellow-300 hover:text-yellow-200 underline shrink-0 disabled:opacity-50"
        >
            {verificationSent ? 'Email sent!' : resendingVerification ? 'Sending…' : 'Resend verification'}
        </button>
    </div>
)}
```

Add `Mail` to the lucide-react import at the top:
```typescript
import {
    Server, FolderOpen, Settings, LogOut, Menu, X, Plus, Search, Shield, Monitor, Mail,
} from 'lucide-react';
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(ui): add email verification banner to dashboard layout"
```

---

## Task 13: Settings Page — Encryption Section

**Files:**
- Modify: `apps/web/src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add `isGoogleUser` to the `User` interface in settings**

Find the `User` interface in settings page:
```typescript
interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    emailOtpEnabled: boolean;
    twoFactorMethod: 'NONE' | 'TOTP' | 'EMAIL';
    hasMasterKey: boolean;
    passkeyEnabled: boolean;
    isVerified: boolean;
    isGoogleUser: boolean;  // Add this
}
```

- [ ] **Step 2: Add encryption section state**

Near the other state declarations (find where passkey states are), add:
```typescript
// Encryption section
const [encryptionPassphrase, setEncryptionPassphrase] = useState('');
const [encryptionConfirm, setEncryptionConfirm] = useState('');
const [encryptionLoading, setEncryptionLoading] = useState(false);
const [showEncryptionResetConfirm, setShowEncryptionResetConfirm] = useState(false);
```

- [ ] **Step 3: Add `handleChangePassphrase` handler**

Find where other handler functions are defined (near `handleLogout` or passkey handlers) and add:
```typescript
const handleChangePassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (encryptionPassphrase !== encryptionConfirm || encryptionPassphrase.length < 8) return;
    setEncryptionLoading(true);
    try {
        const res = await fetch('/api/auth/setup-encryption', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passphrase: encryptionPassphrase }),
        });
        const data = await res.json();
        if (data.success) {
            addToast('success', 'Encryption passphrase updated');
            setEncryptionPassphrase('');
            setEncryptionConfirm('');
            setUser((u) => u ? { ...u, hasMasterKey: true } : u);
        } else {
            addToast('error', data.error || 'Failed to update passphrase');
        }
    } catch {
        addToast('error', 'Something went wrong');
    } finally {
        setEncryptionLoading(false);
    }
};
```

Note: `addToast` is the existing toast helper function in the settings page.

- [ ] **Step 4: Add the Encryption section to the JSX**

Find the return JSX — there are several `<Card>` sections (Security, 2FA, Passkeys, etc.). Add a new encryption Card after the existing security cards:

```tsx
{/* Encryption Section */}
<Card className="p-6 space-y-4">
    <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
        </div>
        <div>
            <h2 className="font-semibold">Credential Encryption</h2>
            <p className="text-xs text-muted-foreground">
                How your stored server credentials are protected
            </p>
        </div>
    </div>

    {user?.isGoogleUser ? (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
                {user.hasMasterKey ? (
                    <><Check className="w-4 h-4 text-green-400" /><span className="text-green-400">Encryption passphrase is set</span></>
                ) : (
                    <><AlertTriangle className="w-4 h-4 text-yellow-400" /><span className="text-yellow-400">Encryption passphrase not set — server connections won't work</span></>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                Your server credentials are encrypted with your encryption passphrase.
                You enter this each time you sign in with Google.
            </p>
            {!user.hasMasterKey && (
                <Button asChild size="sm">
                    <a href="/setup-encryption">Set Up Encryption</a>
                </Button>
            )}
            {!showEncryptionResetConfirm && (
                <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={() => setShowEncryptionResetConfirm(true)}
                >
                    Reset encryption passphrase (deletes all server credentials)
                </button>
            )}
            {showEncryptionResetConfirm && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
                    <p className="text-sm text-red-300 font-medium">
                        ⚠️ This will permanently delete all your stored servers and credentials.
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                                const res = await fetch('/api/auth/reset-encryption-key', { method: 'POST' });
                                const data = await res.json();
                                if (data.success) {
                                    window.location.href = '/setup-encryption';
                                }
                            }}
                        >
                            Delete Everything & Reset
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowEncryptionResetConfirm(false)}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
        </div>
    ) : (
        <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-green-400">Encryption active — derived from your login password</span>
            </div>
            <p className="text-xs">
                Your server credentials are encrypted with a key derived from your password.
                If you change your password, all credentials are automatically re-encrypted.
                If you <strong>reset</strong> your password (forgot password), credentials are permanently lost.
            </p>
        </div>
    )}
</Card>
```

Make sure `Lock` is in the lucide-react import (it likely already is: `import { ..., Lock, ... } from 'lucide-react';`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/settings/page.tsx
git commit -m "feat(ui): add encryption section to settings page"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run all existing tests**

```bash
cd apps/web && npm run test -- --run
```

Expected: All tests pass (including the new auth.test.ts).

- [ ] **Step 2: Build to check for TypeScript errors**

```bash
cd apps/web && npm run build 2>&1 | tail -30
```

Expected: Build succeeds with no type errors. If there are errors, fix them before proceeding.

- [ ] **Step 3: Verify environment variables are documented**

Ensure `.env.example` (or equivalent) in the repo root includes:
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

If no `.env.example` exists, add a comment to the README or check `apps/web/.env.example`.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: final cleanup and build verification for Google OAuth + encryption features

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Google OAuth login — Tasks 4, 5
- ✅ Encryption key setup UI for Google users — Task 7
- ✅ Email verification enforced (banner) — Task 12
- ✅ Auto-assign encryption with email/password — Task 3
- ✅ Password reset → credentials lost — Task 3, 6
- ✅ Forgot-password flow — Task 6
- ✅ /setup-encryption and /unlock-encryption pages — Task 7
- ✅ Settings encryption section — Task 13
- ✅ Rate limiting for forgot-password and send-verification — Task 2
- ✅ Migration for existing users (auto-derive masterKey on login) — Task 3

**Type consistency:**
- `registerUser(input: RegisterInput)` — `masterKey` removed from interface ✅
- `forgotPassword(email: string): Promise<void>` — called in route ✅
- `resetPassword(token, newPassword): Promise<{success, error?}>` — matches route usage ✅
- `setupEncryption(userId, passphrase): Promise<{success, masterKey?, error?}>` — matches route ✅
- `unlockEncryption(userId, passphrase): Promise<{success, masterKey?, error?}>` — matches route ✅
- `resetEncryptionKey(userId): Promise<{success}>` — matches route ✅
- `findOrCreateGoogleUser(googleInfo): Promise<FindOrCreateGoogleUserResult>` — matches callback ✅
- `session.tempMasterKey` — set in loginUser, read in verify2FA ✅
