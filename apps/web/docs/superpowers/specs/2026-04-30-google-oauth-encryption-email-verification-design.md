# Design: Google OAuth, Encryption Key Setup, Email Verification & Password Reset

**Date:** 2026-04-30  
**Scope:** `apps/web`

---

## Problem Statement

The application currently supports email/password login with optional master key encryption, but lacks: Google OAuth login, enforced email verification (login is unrestricted), automatic encryption key derivation tied to passwords, a dedicated encryption key setup UI for OAuth users, and a password reset flow that communicates credential loss.

---

## Proposed Approach

Use the **Arctic** OAuth library (lightweight, no framework lock-in) alongside the existing iron-session custom auth system. Minimize schema additions. Derive encryption keys transparently from login passwords for email users; require an explicit passphrase for Google users.

---

## Architecture

### Components Added / Modified

| Component | Type | Change |
|---|---|---|
| `OAuthAccount` Prisma model | New | Links Google accounts to users |
| `User` Prisma model | Modified | `passwordHash` nullable; password reset fields added |
| `/api/auth/google/authorize` | New API route | Initiates Google OAuth flow |
| `/api/auth/google/callback` | New API route | Handles Google callback |
| `/api/auth/forgot-password` | New API route | Issues password reset token |
| `/api/auth/reset-password` | New API route | Applies new password, wipes encryption |
| `loginUser()` in `auth.ts` | Modified | Auto-derives and stores masterKey in session |
| `registerUser()` in `auth.ts` | Modified | Always derives masterKey from password |
| `/login/page.tsx` | Modified | Add "Continue with Google" button |
| `/register/page.tsx` | Modified | Remove master key setup (auto-handled) |
| `/setup-encryption/page.tsx` | New page | First-time passphrase setup for Google users |
| `/unlock-encryption/page.tsx` | New page | Per-session passphrase unlock for Google users |
| `/forgot-password/page.tsx` | New page | Email entry for reset link |
| `/reset-password/page.tsx` | New page | New password entry |
| Dashboard layout | Modified | Email verification banner |
| Settings page | Modified | Encryption key status + change passphrase section |

---

## Data Model

### New: `OAuthAccount` model

```prisma
model OAuthAccount {
  id                String   @id @default(cuid())
  userId            String
  provider          String   // "GOOGLE"
  providerAccountId String   // Google `sub`
  email             String
  createdAt         DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

### Modified: `User` model fields

```prisma
passwordHash String?  // Nullable — Google-only users have no password

// Password reset
passwordResetToken     String?
passwordResetExpiresAt DateTime?
```

Add `oauthAccounts OAuthAccount[]` relation to `User`.

---

## Feature Designs

### 1. Google OAuth Flow

**Library:** `arctic` (npm package, ESM-compatible)

**Environment variables required:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_URL` (already used for email links)

**Flow:**

```
User clicks "Continue with Google"
  → GET /api/auth/google/authorize
    - Generate PKCE: codeVerifier + codeChallenge + state nonce
    - Store { state, codeVerifier } in iron-session (no isLoggedIn)
    - Redirect to Google OAuth URL (scopes: openid, email, profile)

  → Google redirects to /api/auth/google/callback?code=...&state=...
    - Validate state matches session
    - Exchange code for tokens using Arctic (with stored codeVerifier)
    - Fetch user info: { sub, email, name, picture }

    CASE A — New user (no OAuthAccount, no User with matching email):
      - Create User { email, isVerified: true, passwordHash: null }
      - Create OAuthAccount { provider: "GOOGLE", providerAccountId: sub }
      - Create session (standard)
      - Redirect to /setup-encryption

    CASE B — Returning Google user (OAuthAccount exists):
      - Create session (standard, no masterKey yet)
      - Redirect to /unlock-encryption

    CASE C — Existing email/password user with same email (no OAuthAccount):
      - Create OAuthAccount linking to existing User
      - Create session (standard, no masterKey yet)
      - Redirect to /unlock-encryption (they have existing encrypted credentials)
      - NOTE: For these users, their "passphrase" is their account password.
        The unlock page copy should say "Enter your account password or encryption passphrase"
        to avoid confusion for users who link accounts later.
```

**Session state during Google OAuth dance** (before full login):
```typescript
// Temporary session fields used during OAuth redirect
googleOAuthState?: string;
googleCodeVerifier?: string;
```
These are cleared after callback completes.

---

### 2. Email/Password Encryption Auto-Wire

**Registration change:**  
`registerUser()` always derives a masterKey from the user's password + a fresh random salt. No explicit master key passphrase is collected. `masterKeyHash` and `masterKeySalt` are always written.

**Login change:**  
After password verification in `loginUser()`, derive the masterKey:
```typescript
const derivedKey = deriveMasterKey(password, Buffer.from(user.masterKeySalt, 'base64'));
session.masterKey = derivedKey.toString('hex');
```

**Migration (existing users without masterKey):**  
If `user.masterKeySalt` is null at login time, auto-derive and persist:
```typescript
// On login, if no masterKeySalt:
const salt = generateSalt();
const derived = deriveMasterKey(password, salt);
await prisma.user.update({ where: { id: user.id }, data: {
  masterKeyHash: hashDerivedKey(derived),
  masterKeySalt: salt.toString('base64'),
}});
session.masterKey = derived.toString('hex');
```

---

### 3. Email Verification Banner

**When shown:** Dashboard layout checks `user.isVerified` (from `/api/auth/me`). If false, renders a top banner:
> ⚠️ Please verify your email address. [Resend verification email] 

Banner has a "Resend" button that calls `POST /api/auth/send-verification` (rate-limited — max 3 sends per hour per user). Banner disappears once verified.

**Login is not blocked.** Unverified users can access the full dashboard.

---

### 4. Encryption Key Setup UI (Google Users)

#### `/setup-encryption` — First-time setup

Shown after a Google user's very first login. Cannot be skipped (the page itself checks: if `masterKeyHash` is already set, redirect to dashboard; if user is not a Google-only user, redirect to dashboard).

- Explains: "Your server credentials will be encrypted with this passphrase. You'll need to enter it each time you log in."
- Form: passphrase (min 8 chars) + confirm passphrase, password strength meter
- On submit → `POST /api/auth/setup-encryption`:
  - Derive masterKey from passphrase + new salt
  - Write `masterKeyHash` + `masterKeySalt` to DB
  - Write `masterKey` (hex) to session
  - Redirect to dashboard

#### `/unlock-encryption` — Per-session unlock (returning Google users)

Shown after Google login when `masterKeyHash` exists but session has no `masterKey`. Can be skipped ("Skip for now — I'll connect servers later").

- Form: single passphrase field
- On submit → `POST /api/auth/unlock-encryption`:
  - Derive masterKey from passphrase + stored salt
  - Verify against `masterKeyHash`
  - If match: write `masterKey` to session → redirect to dashboard
  - If mismatch: error "Incorrect passphrase"
- "Forgot your passphrase?" link → warning modal explaining all server credentials will be permanently deleted → confirmation → `POST /api/auth/reset-encryption-key` → wipes all servers + clears `masterKeyHash`/`masterKeySalt` → redirects to `/setup-encryption`

#### Settings page — Encryption section

- Shows: "Encryption: Active ✓" or "Encryption: Not set up"
- For email users: "Your encryption is derived from your login password. Changing your password will make existing server credentials inaccessible."
- For Google users: "Change passphrase" button → modal (enter current passphrase, new passphrase, confirm) → re-encrypts all server credentials with new key

---

### 5. Password Reset Flow

**UI pages:**
- `/forgot-password` — Email input form, "Send reset link" CTA
- `/reset-password?token=...` — New password + confirm, with prominent warning banner

**Warning banner on `/reset-password`:**
> ⚠️ **Security notice:** Resetting your password will permanently delete access to your stored server credentials (usernames, passwords, private keys). This is by design — your credentials are encrypted with a key derived from your current password. After reset, you will need to re-add your servers.

**API routes:**

`POST /api/auth/forgot-password`:
- Accept `{ email }`
- Always respond with the same message (prevents email enumeration)
- If user exists and has `passwordHash` (email/password user): generate token, hash it, store with 1-hour expiry, send email
- Google-only users get no email (no password to reset)

`POST /api/auth/reset-password`:
- Accept `{ token, newPassword }`
- Validate token (find by hash, check expiry)
- Hash new password → update `passwordHash`
- **Clear** `masterKeyHash` + `masterKeySalt` (old encryption key is gone)
- **Delete all `Server` records** for this user (credentials are now inaccessible)
- Revoke all sessions
- Clear `passwordResetToken` + `passwordResetExpiresAt`
- Audit log: `USER_PASSWORD_RESET`

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Google OAuth state mismatch | Return 400, redirect to `/login?error=oauth_state` |
| Google token exchange failure | Redirect to `/login?error=oauth_failed` |
| Encryption passphrase mismatch | 400 with `"Incorrect passphrase"` |
| Reset token expired/invalid | 400 with `"Reset link is invalid or has expired"` |
| Passphrase reset for Google user (forgot) | All servers deleted, audit logged |
| Email/password user hits `/setup-encryption` | Redirect to dashboard (no action needed) |

---

## Security Considerations

- **PKCE** enforced on all Google OAuth requests (Arctic handles this)
- **State nonce** validated on callback to prevent CSRF
- **Password reset token** is hashed before storage (same pattern as session tokens)
- **Credential deletion on password reset** is intentional and by design — not a bug
- **Server deletion on passphrase forget** is permanent and requires explicit confirmation
- **masterKey is never stored plaintext** — stored in iron-session (encrypted cookie) only for session lifetime
- **Rate limiting** on `/forgot-password` and `/send-verification` endpoints (3 per hour per IP/user)

---

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

Existing: `NEXT_PUBLIC_APP_URL`, `SMTP_*`, `SESSION_SECRET`, `ENCRYPTION_KEY`

---

## Out of Scope

- Other OAuth providers (GitHub, Microsoft, etc.) — same architecture, add later
- Admin-forced email verification (block login) — explicitly decided against
- Passkey integration with Google OAuth accounts — existing passkey system unchanged
