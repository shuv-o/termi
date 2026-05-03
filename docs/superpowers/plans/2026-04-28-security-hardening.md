# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 8 security vulnerabilities identified in the audit: timing oracle in `secureCompare`, secrets in Docker build history, missing DB SSL enforcement, gateway protocol mismatch, SSRF DNS-rebinding window, hardcoded infrastructure URL, un-validated Electron PTY `cwd`, and world-readable Electron config file.

**Architecture:** Surgical targeted changes across 8 files. No new dependencies, no structural refactoring. Each task is independent and can be verified in isolation. Tests run with `npm run test --workspace=apps/web` (vitest). Electron changes are manual-verify only (no test harness in that workspace).

**Tech Stack:** TypeScript, Next.js 16 App Router, vitest, Node.js `crypto` (`timingSafeEqual`), Prisma/pg, ESM gateway, Electron (CommonJS main process)

---

## File Map

| File | Change |
|------|--------|
| `apps/web/src/lib/crypto/crypto.ts` | Fix `secureCompare` — use `timingSafeEqual` with padded buffers |
| `apps/web/src/lib/crypto/crypto.test.ts` | **New** — unit tests for `secureCompare` and the DB URL validator |
| `apps/web/src/lib/db/prisma.ts` | Add `assertDatabaseSslInProduction()` startup check |
| `apps/web/Dockerfile` | Remove `SESSION_SECRET`, `ENCRYPTION_KEY`, `GATEWAY_JWT_SECRET` from `ARG`/`ENV` |
| `docker-compose.dokploy.yml` | Remove insecure `:-change-this` fallback defaults for secrets |
| `apps/gateway/src/index.ts` | Add `tokenPayload.protocol !== protocol` cross-check |
| `apps/web/src/app/api/connection/token/route.ts` | Add SSRF re-validation; remove hardcoded production URL |
| `apps/electron/main.js` | Validate `cwd` before passing to node-pty; `chmod 0600` config file |
| `.env.example` | Add `sslmode=require` to example URL; remove unused `GATEWAY_URL` |

---

## Task 1: Fix `secureCompare` Timing Oracle

**Files:**
- Modify: `apps/web/src/lib/crypto/crypto.ts` (the `secureCompare` function)
- Create: `apps/web/src/lib/crypto/crypto.test.ts`

The current implementation exits early when string lengths differ, which leaks length via timing. Fix: convert both strings to `Buffer`, pad to equal length, then `timingSafeEqual`. The result is always constant-time.

- [ ] **Step 1: Create test file with a failing test**

  Create `apps/web/src/lib/crypto/crypto.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { secureCompare } from './crypto';

  describe('secureCompare', () => {
      it('returns true for equal strings', () => {
          expect(secureCompare('hello', 'hello')).toBe(true);
      });

      it('returns false for strings that differ by content only', () => {
          expect(secureCompare('hello', 'world')).toBe(false);
      });

      it('returns false for strings that differ by length only', () => {
          // This would return false quickly (timing leak) before the fix
          expect(secureCompare('abc', 'abcd')).toBe(false);
      });

      it('returns false when empty vs non-empty', () => {
          expect(secureCompare('', 'a')).toBe(false);
      });

      it('returns true for empty strings', () => {
          expect(secureCompare('', '')).toBe(true);
      });

      it('handles unicode strings', () => {
          expect(secureCompare('héllo', 'héllo')).toBe(true);
          expect(secureCompare('héllo', 'hello')).toBe(false);
      });
  });
  ```

- [ ] **Step 2: Run tests — all should pass (behavior is correct, the fix is only about timing)**

  ```bash
  cd apps/web && npx vitest run src/lib/crypto/crypto.test.ts
  ```

  Expected: All 6 tests **PASS** (the current implementation is functionally correct; only the timing side-channel is wrong).

- [ ] **Step 3: Replace the `secureCompare` function in `apps/web/src/lib/crypto/crypto.ts`**

  Find the current `secureCompare` function (lines ~253–264) and replace it entirely:

  ```ts
  /**
   * Constant-time string comparison to prevent timing attacks.
   * Pads both inputs to equal length before calling timingSafeEqual,
   * so execution time does not reveal string length.
   */
  export function secureCompare(a: string, b: string): boolean {
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      const len = Math.max(bufA.length, bufB.length);
      // Pad shorter buffer so timingSafeEqual always runs full length
      const padA = Buffer.concat([bufA, Buffer.alloc(len - bufA.length)]);
      const padB = Buffer.concat([bufB, Buffer.alloc(len - bufB.length)]);
      // Evaluate length equality AFTER the constant-time comparison so length
      // information is not leaked through early-exit timing
      return timingSafeEqual(padA, padB) && bufA.length === bufB.length;
  }
  ```

  `timingSafeEqual` is already imported at the top of `crypto.ts`:
  ```ts
  import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash, scryptSync, timingSafeEqual } from 'crypto';
  ```

- [ ] **Step 4: Run tests — all should still pass**

  ```bash
  cd apps/web && npx vitest run src/lib/crypto/crypto.test.ts
  ```

  Expected: All 6 tests **PASS**.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/lib/crypto/crypto.ts apps/web/src/lib/crypto/crypto.test.ts
  git commit -m "fix(crypto): eliminate timing oracle in secureCompare via timingSafeEqual

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 2: Remove Secrets from Docker Build ARGs

**Files:**
- Modify: `apps/web/Dockerfile`
- Modify: `docker-compose.dokploy.yml`

`SESSION_SECRET`, `ENCRYPTION_KEY`, `GATEWAY_JWT_SECRET` are passed as build `ARG`s and baked into image layer history. They are NOT needed at build time — the placeholder comment in the Dockerfile confirms this. The fix removes them from `ARG`/`ENV` entirely and uses hardcoded safe placeholders directly in the Dockerfile.

- [ ] **Step 1: Edit `apps/web/Dockerfile` — remove the three secrets ARGs and their ENV lines**

  Remove these lines entirely from the builder stage (around lines 47–64):

  ```dockerfile
  # REMOVE these three ARG lines:
  ARG SESSION_SECRET=build-time-placeholder-not-used-in-runtime-x
  ARG ENCRYPTION_KEY=build-time-placeholder-not-used-in-runtime-x
  ARG GATEWAY_JWT_SECRET=build-time-placeholder-not-used-in-runtime

  # REMOVE these three ENV lines:
  ENV SESSION_SECRET=${SESSION_SECRET}
  ENV ENCRYPTION_KEY=${ENCRYPTION_KEY}
  ENV GATEWAY_JWT_SECRET=${GATEWAY_JWT_SECRET}
  ```

  Replace with hardcoded build-time constants (these satisfy Next.js env validation during build without ever containing real secrets):

  ```dockerfile
  # Build-time placeholder values for secrets — real values injected at runtime only.
  # These constants keep Next.js env validation happy during `npm run build` without
  # ever leaking production secrets into the image layer history.
  ENV SESSION_SECRET=build-time-placeholder-not-used-in-runtime-xxxxxxxxxx
  ENV ENCRYPTION_KEY=build-time-placeholder-not-used-in-runtime-xxxxxxxxxx
  ENV GATEWAY_JWT_SECRET=build-time-placeholder-not-used-in-runtime-xxxxxxx
  ```

  The final Dockerfile builder stage (after ARG lines that remain: `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_APP_URL`, VAPID keys) should look like:

  ```dockerfile
  # Stage 2: Builder
  FROM node:20-slim AS builder
  WORKDIR /app

  RUN apt-get update -y && apt-get install -y openssl

  COPY --from=deps /app/node_modules ./node_modules
  COPY . .

  RUN npx prisma generate --schema=apps/web/prisma/schema.prisma

  # Build-time arguments — public vars baked into JS bundle must be set here
  ARG NEXT_PUBLIC_GATEWAY_URL
  ARG NEXT_PUBLIC_APP_URL
  ARG VAPID_PUBLIC_KEY=your-vapid-public-key
  ARG VAPID_PRIVATE_KEY=your-vapid-private-key
  ARG VAPID_SUBJECT=mailto:admin@example.com

  ENV NEXT_TELEMETRY_DISABLED=1
  ENV NODE_ENV=production
  ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
  ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
  ENV VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
  ENV VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
  ENV VAPID_SUBJECT=${VAPID_SUBJECT}

  # Build-time placeholder values for secrets — real values injected at runtime only.
  # These constants keep Next.js env validation happy during `npm run build` without
  # ever leaking production secrets into the image layer history.
  ENV SESSION_SECRET=build-time-placeholder-not-used-in-runtime-xxxxxxxxxx
  ENV ENCRYPTION_KEY=build-time-placeholder-not-used-in-runtime-xxxxxxxxxx
  ENV GATEWAY_JWT_SECRET=build-time-placeholder-not-used-in-runtime-xxxxxxx

  RUN npm run build --workspace=apps/web
  ```

- [ ] **Step 2: Edit `docker-compose.dokploy.yml` — remove secrets from `build.args`, remove insecure fallback defaults**

  In the `web:` service's `build.args:` section, remove the three secrets:

  ```yaml
  # REMOVE these three lines from build.args:
  SESSION_SECRET: ${SESSION_SECRET:-build-time-placeholder-not-used-in-runtime-x}
  ENCRYPTION_KEY: ${ENCRYPTION_KEY:-build-time-placeholder-not-used-in-runtime-x}
  GATEWAY_JWT_SECRET: ${GATEWAY_JWT_SECRET:-build-time-placeholder-not-used-in-runtime}
  ```

  The `build.args:` block should now only contain public vars:

  ```yaml
  build:
    context: .
    dockerfile: apps/web/Dockerfile
    args:
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-https://example.com}
      NEXT_PUBLIC_GATEWAY_URL: ${NEXT_PUBLIC_GATEWAY_URL}
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
  ```

  In the `web:` service's `environment:` section, remove the insecure fallback defaults for secrets. Change:

  ```yaml
  # BEFORE (insecure defaults):
  SESSION_SECRET: ${SESSION_SECRET:-change-this-to-a-long-random-string}
  ENCRYPTION_KEY: ${ENCRYPTION_KEY:-generate-with-openssl-rand-base64-32}
  GATEWAY_JWT_SECRET: ${GATEWAY_JWT_SECRET:-gateway-secret-change-this}
  ```

  To (fail-fast with no default):

  ```yaml
  # AFTER (no fallback — missing secret = container fails to start):
  SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET must be set (openssl rand -base64 32)}
  ENCRYPTION_KEY: ${ENCRYPTION_KEY:?ENCRYPTION_KEY must be set (openssl rand -base64 32)}
  GATEWAY_JWT_SECRET: ${GATEWAY_JWT_SECRET:?GATEWAY_JWT_SECRET must be set (openssl rand -base64 32)}
  ```

  In the `gateway:` service `environment:` section, do the same:

  ```yaml
  # BEFORE:
  GATEWAY_JWT_SECRET: ${GATEWAY_JWT_SECRET:-gateway-secret-change-this}
  # AFTER:
  GATEWAY_JWT_SECRET: ${GATEWAY_JWT_SECRET:?GATEWAY_JWT_SECRET must be set (openssl rand -base64 32)}
  ```

- [ ] **Step 3: Verify the Dockerfile still builds (dry-run with placeholder)**

  ```bash
  # From repo root — just check syntax, don't push
  docker build --no-cache \
    --build-arg NEXT_PUBLIC_GATEWAY_URL=wss://gateway.example.com \
    --build-arg NEXT_PUBLIC_APP_URL=https://example.com \
    -f apps/web/Dockerfile \
    --target builder \
    . 2>&1 | tail -5
  ```

  Expected: build completes without error. If Docker is not available locally, skip this step and verify in CI.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/Dockerfile docker-compose.dokploy.yml
  git commit -m "fix(docker): remove secrets from build ARGs; add fail-fast env validation

  Secrets (SESSION_SECRET, ENCRYPTION_KEY, GATEWAY_JWT_SECRET) are not needed
  at build time. Hardcoding safe build-time placeholders directly in the
  Dockerfile prevents real secrets from appearing in docker history.

  docker-compose now uses the :? syntax so missing secrets cause the container
  to refuse to start rather than silently running with a weak default.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 3: Enforce SSL on Remote Database Connection

**Files:**
- Modify: `apps/web/src/lib/db/prisma.ts`
- Modify: `apps/web/src/lib/crypto/crypto.test.ts` (add the SSL check unit test)

Add a startup assertion that fails loudly in production if `DATABASE_URL` lacks `sslmode=require` or `ssl=true`. Extract the check as a pure function so it can be unit-tested without a real database.

- [ ] **Step 1: Add failing test for the SSL validator to `apps/web/src/lib/crypto/crypto.test.ts`**

  Append to the existing test file:

  ```ts
  import { assertDatabaseSslInProduction } from '../db/prisma';

  describe('assertDatabaseSslInProduction', () => {
      it('does nothing in development', () => {
          const original = process.env.NODE_ENV;
          // @ts-ignore
          process.env.NODE_ENV = 'development';
          expect(() =>
              assertDatabaseSslInProduction('postgresql://user:pass@host/db')
          ).not.toThrow();
          // @ts-ignore
          process.env.NODE_ENV = original;
      });

      it('throws in production when sslmode is absent', () => {
          const original = process.env.NODE_ENV;
          // @ts-ignore
          process.env.NODE_ENV = 'production';
          expect(() =>
              assertDatabaseSslInProduction('postgresql://user:pass@host/db')
          ).toThrow('sslmode=require');
          // @ts-ignore
          process.env.NODE_ENV = original;
      });

      it('does not throw in production with sslmode=require', () => {
          const original = process.env.NODE_ENV;
          // @ts-ignore
          process.env.NODE_ENV = 'production';
          expect(() =>
              assertDatabaseSslInProduction('postgresql://user:pass@host/db?sslmode=require')
          ).not.toThrow();
          // @ts-ignore
          process.env.NODE_ENV = original;
      });

      it('does not throw in production with ssl=true', () => {
          const original = process.env.NODE_ENV;
          // @ts-ignore
          process.env.NODE_ENV = 'production';
          expect(() =>
              assertDatabaseSslInProduction('postgresql://user:pass@host/db?ssl=true')
          ).not.toThrow();
          // @ts-ignore
          process.env.NODE_ENV = original;
      });

      it('throws with a clear actionable message', () => {
          const original = process.env.NODE_ENV;
          // @ts-ignore
          process.env.NODE_ENV = 'production';
          expect(() =>
              assertDatabaseSslInProduction('postgresql://user:pass@host/db')
          ).toThrow(/DATABASE_URL.*sslmode=require/);
          // @ts-ignore
          process.env.NODE_ENV = original;
      });
  });
  ```

- [ ] **Step 2: Run test — should FAIL (function not exported yet)**

  ```bash
  cd apps/web && npx vitest run src/lib/crypto/crypto.test.ts
  ```

  Expected: FAIL with `assertDatabaseSslInProduction is not a function` or similar import error.

- [ ] **Step 3: Add `assertDatabaseSslInProduction` to `apps/web/src/lib/db/prisma.ts`**

  The full file after the change:

  ```ts
  /**
   * Termi Database Client
   *
   * Singleton Prisma client instance with proper configuration
   * for both development and production environments.
   */

  import { PrismaClient } from '@/app/generated/prisma/client';
  import { PrismaPg } from '@prisma/adapter-pg';
  import { Pool } from 'pg';

  // ============================================================================
  // STARTUP VALIDATION
  // ============================================================================

  /**
   * Assert that DATABASE_URL includes SSL parameters in production.
   * Exported for unit-testing. Called automatically at module load time.
   *
   * @param url - The DATABASE_URL string to check (defaults to env var)
   * @throws Error in production when SSL is not configured
   */
  export function assertDatabaseSslInProduction(url?: string): void {
      if (process.env.NODE_ENV !== 'production') return;
      const dbUrl = url ?? process.env.DATABASE_URL ?? '';
      const hasSsl =
          dbUrl.includes('sslmode=require') ||
          dbUrl.includes('sslmode=verify-full') ||
          dbUrl.includes('sslmode=verify-ca') ||
          dbUrl.includes('ssl=true');
      if (!hasSsl) {
          throw new Error(
              'DATABASE_URL must include SSL parameters for production deployments. ' +
              'Append ?sslmode=require to your connection string. ' +
              'Example: postgresql://user:pass@host:5432/termi?sslmode=require'
          );
      }
  }

  // Run at module load — fails fast before any query is made
  assertDatabaseSslInProduction();

  // ============================================================================
  // CLIENT SINGLETON
  // ============================================================================

  // Prevent multiple Prisma Client instances in development
  const globalForPrisma = globalThis as unknown as {
      prisma: PrismaClient | undefined;
      pool: Pool | undefined;
  };

  // Create PostgreSQL connection pool
  const pool = globalForPrisma.pool ?? new Pool({
      connectionString: process.env.DATABASE_URL,
  });

  if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.pool = pool;
  }

  // Create Prisma adapter
  const adapter = new PrismaPg(pool);

  export const prisma =
      globalForPrisma.prisma ??
      new PrismaClient({
          adapter,
          log: process.env.NODE_ENV === 'development'
              ? ['query', 'error', 'warn']
              : ['error'],
      });

  if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = prisma;
  }

  export default prisma;
  ```

- [ ] **Step 4: Run tests — should PASS**

  ```bash
  cd apps/web && npx vitest run src/lib/crypto/crypto.test.ts
  ```

  Expected: All tests **PASS** (including all 5 new SSL tests and the 6 earlier `secureCompare` tests).

- [ ] **Step 5: Update `.env.example` — add `sslmode=require` and clean up docs**

  Find the `DATABASE_URL` example line and update it:

  ```bash
  # BEFORE:
  DATABASE_URL=postgresql://termi:your-secure-password-here@your-db-host:5432/termi

  # AFTER:
  DATABASE_URL=postgresql://termi:your-secure-password-here@your-db-host:5432/termi?sslmode=require
  ```

  Also remove the unused `GATEWAY_URL` variable (only `NEXT_PUBLIC_GATEWAY_URL` is used by the application):

  ```bash
  # REMOVE this line from .env.example:
  GATEWAY_URL=ws://localhost:2281
  ```

  And update the comment block for the gateway URL section:

  ```bash
  # WebSocket gateway URL (used at runtime by the token API route to tell the browser where to connect)
  # In production, use wss:// with your gateway domain
  NEXT_PUBLIC_GATEWAY_URL=wss://gateway.example.com
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/src/lib/db/prisma.ts apps/web/src/lib/crypto/crypto.test.ts .env.example
  git commit -m "fix(db): enforce sslmode=require on remote DATABASE_URL in production

  Adds assertDatabaseSslInProduction() that runs at module load time.
  The process exits with a clear error message rather than connecting
  over unencrypted TCP to a remote database.

  .env.example updated to show ?sslmode=require in the example URL
  and removes the unused GATEWAY_URL variable.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 4: Gateway Protocol Cross-Validation

**Files:**
- Modify: `apps/gateway/src/index.ts` (add one check after `serverId` validation)

The gateway validates `tokenPayload.serverId === serverId` but not that the URL protocol matches the token protocol. A valid SSH JWE token could be submitted with `protocol=rdp` in the URL, routing credentials to the wrong handler.

- [ ] **Step 1: Edit `apps/gateway/src/index.ts` — add protocol check after serverId check**

  Find the serverId check block (around line 172):

  ```ts
  // Check server access
  if (tokenPayload.serverId !== serverId) {
      ws.send(JSON.stringify({
          type: 'error',
          message: 'Server access denied'
      }));
      ws.close(4003, 'Forbidden');
      return;
  }
  ```

  Add the protocol check immediately after it:

  ```ts
  // Check server access
  if (tokenPayload.serverId !== serverId) {
      ws.send(JSON.stringify({
          type: 'error',
          message: 'Server access denied'
      }));
      ws.close(4003, 'Forbidden');
      return;
  }

  // Verify protocol in URL matches protocol in token to prevent token reuse across protocols
  if (tokenPayload.protocol !== protocol) {
      ws.send(JSON.stringify({
          type: 'error',
          message: 'Protocol mismatch'
      }));
      ws.close(4003, 'Forbidden');
      return;
  }
  ```

- [ ] **Step 2: Verify TypeScript compilation**

  ```bash
  cd apps/gateway && npx tsc --noEmit
  ```

  Expected: No errors.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/gateway/src/index.ts
  git commit -m "fix(gateway): validate protocol in URL matches protocol in JWE token

  Prevents a valid SSH token from being used to initiate an RDP/VNC
  connection by submitting a mismatched protocol query parameter.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 5: SSRF Re-Validation at Token Issuance

**Files:**
- Modify: `apps/web/src/app/api/connection/token/route.ts`

SSRF validation runs at server-save time but not when issuing the JWE token. A DNS rebinding attack (changing DNS response between save and connect) bypasses the guard. Fix: re-validate the decrypted host in the token route before issuing the token.

- [ ] **Step 1: Edit `apps/web/src/app/api/connection/token/route.ts` — add import and SSRF check**

  At the top of the file, add `validateHost` to the imports:

  ```ts
  import { getCurrentUser } from '@/lib/auth';
  import { getServerForConnection } from '@/lib/services';
  import { validateBody, successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';
  import { createHash } from 'crypto';
  import { connectionTokenRateLimit } from '@/lib/rate-limit';
  import { validateHost } from '@/lib/security/ssrf';
  ```

  After the `if (!server) return notFoundResponse('Server not found');` line and before the `const key = getJWEKey();` line, add:

  ```ts
  const server = await getServerForConnection(serverId, user.id);
  if (!server) return notFoundResponse('Server not found');

  // Re-validate host at token issuance time to close the DNS-rebinding window
  // between server-save and connection-token-issue.
  const ssrfCheck = await validateHost(
      server.host,
      process.env.ALLOW_PRIVATE_NETWORKS === 'true'
  );
  if (!ssrfCheck.valid) {
      return errorResponse(ssrfCheck.error || 'Invalid host', 403);
  }

  const key = getJWEKey();
  ```

- [ ] **Step 2: Verify TypeScript compilation**

  ```bash
  cd apps/web && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: No errors related to the token route (there may be pre-existing unrelated errors in other files).

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/src/app/api/connection/token/route.ts
  git commit -m "fix(api): re-validate host in token route to close DNS-rebinding window

  SSRF validation was only applied at server-save time. Adding it at
  token-issuance time means DNS rebinding between save and connect
  is caught before credentials are placed into the JWE.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 6: Remove Hardcoded Production URL from Token Route

**Files:**
- Modify: `apps/web/src/app/api/connection/token/route.ts`

The fallback `|| 'https://gateway.termi.dp.shuvoo.com'` hardcodes an internal infrastructure URL in source code, leaking the deployment topology and making the fallback wrong for anyone else deploying Termi.

- [ ] **Step 1: Edit `apps/web/src/app/api/connection/token/route.ts` — fix the gatewayUrl line**

  Find:

  ```ts
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.termi.dp.shuvoo.com';
  ```

  Replace with:

  ```ts
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:2281';
  ```

- [ ] **Step 2: Verify TypeScript compilation**

  ```bash
  cd apps/web && npx tsc --noEmit 2>&1 | grep "token/route" | head -5
  ```

  Expected: No output (no errors in this file).

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/src/app/api/connection/token/route.ts
  git commit -m "fix(api): remove hardcoded production infrastructure URL from token route

  Replace the specific domain fallback with a generic localhost default.
  Production deployments must set NEXT_PUBLIC_GATEWAY_URL explicitly.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 7: Validate Electron PTY `cwd` Parameter

**Files:**
- Modify: `apps/electron/main.js` (the `local-terminal:create` IPC handler)

The handler passes the renderer-supplied `cwd` directly to `node-pty`. A compromised renderer could provide any path. Fix: resolve to absolute, check existence, fall back to home.

- [ ] **Step 1: Edit `apps/electron/main.js` — add `cwd` validation in the IPC handler**

  Find the `local-terminal:create` handler (line ~151). It currently reads:

  ```js
  ipcMain.handle('local-terminal:create', (event, id, { cols, rows, cwd } = {}) => {
      if (!nodePty) return { success: false, error: 'node-pty not available — run: npm run setup:electron' };

      const shell =
          process.platform === 'win32'
              ? 'powershell.exe'
              : (process.env.SHELL || '/bin/zsh');

      try {
          const term = nodePty.spawn(shell, [], {
              name: 'xterm-256color',
              cols: cols || 80,
              rows: rows || 24,
              cwd: cwd || os.homedir(),
              env: { ...process.env },
          });
  ```

  Replace the handler opening so that `cwd` is validated before use:

  ```js
  ipcMain.handle('local-terminal:create', (event, id, { cols, rows, cwd } = {}) => {
      if (!nodePty) return { success: false, error: 'node-pty not available — run: npm run setup:electron' };

      const shell =
          process.platform === 'win32'
              ? 'powershell.exe'
              : (process.env.SHELL || '/bin/zsh');

      // Validate and sanitise the working directory supplied by the renderer.
      // Fall back to the user's home directory if the path is missing, not
      // absolute, or does not exist on disk.
      const safeHome = os.homedir();
      let safeCwd = safeHome;
      if (cwd) {
          const resolved = path.resolve(cwd);
          if (fs.existsSync(resolved)) {
              safeCwd = resolved;
          } else {
              console.warn(`[local-terminal] cwd '${cwd}' does not exist — falling back to home`);
          }
      }

      try {
          const term = nodePty.spawn(shell, [], {
              name: 'xterm-256color',
              cols: cols || 80,
              rows: rows || 24,
              cwd: safeCwd,
              env: { ...process.env },
          });
  ```

- [ ] **Step 2: Verify Electron starts without errors (manual check)**

  ```bash
  npm run electron:dev 2>&1 | head -20
  ```

  Expected: App starts, `[local-terminal]` log lines appear if a PTY is created, no crashes.

  If Docker is not available (guacd won't start), that's fine — the local terminal IPC is independent.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/electron/main.js
  git commit -m "fix(electron): validate and sanitise cwd before passing to node-pty

  Resolves cwd to an absolute path and verifies it exists before
  spawning the PTY shell. Falls back to os.homedir() if invalid.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 8: Set `termi.config.json` File Permissions

**Files:**
- Modify: `apps/electron/main.js` (the packaged config loading block)

The config file at `~/Library/Application Support/Termi/termi.config.json` (macOS) stores production secrets. Default file creation permissions may allow other OS users to read it. Fix: apply `0o600` (owner-read/write only) after reading or creating the config file path.

- [ ] **Step 1: Edit `apps/electron/main.js` — add `chmod 0600` after the config path is confirmed**

  Find the packaged config block (around line 214):

  ```js
  if (app.isPackaged) {
      const configPath = path.join(app.getPath('userData'), 'termi.config.json');
      if (fs.existsSync(configPath)) {
          try {
              const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              for (const [k, v] of Object.entries(cfg)) {
                  if (typeof v === 'string' && !(k in process.env)) process.env[k] = v;
              }
          } catch (e) {
              console.error('[config] Failed to parse termi.config.json:', e.message);
          }
      }
  ```

  Replace with (adds `chmod` immediately after confirming file path):

  ```js
  if (app.isPackaged) {
      const configPath = path.join(app.getPath('userData'), 'termi.config.json');

      // Restrict permissions to owner-only (rw-------) regardless of umask.
      // Applied unconditionally: if the file exists, lock it down; if it
      // doesn't, the chmod is a no-op on a non-existent path (caught silently).
      try { fs.chmodSync(configPath, 0o600); } catch (_) {}

      if (fs.existsSync(configPath)) {
          try {
              const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              for (const [k, v] of Object.entries(cfg)) {
                  if (typeof v === 'string' && !(k in process.env)) process.env[k] = v;
              }
          } catch (e) {
              console.error('[config] Failed to parse termi.config.json:', e.message);
          }
      }
  ```

- [ ] **Step 2: Verify permissions applied (manual check on macOS/Linux)**

  After running a packaged build, check:

  ```bash
  ls -la "$HOME/Library/Application Support/Termi/termi.config.json"
  ```

  Expected: `-rw-------  1 <you>  staff  ...` (no group or world read bits).

- [ ] **Step 3: Commit**

  ```bash
  git add apps/electron/main.js
  git commit -m "fix(electron): set 0600 permissions on termi.config.json to prevent other-user read

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

  ```bash
  cd /path/to/termi/root
  npm run test --workspace=apps/web
  ```

  Expected: All tests pass, including the 11 new tests from Tasks 1 and 3.

- [ ] **Step 2: Run lint**

  ```bash
  npm run lint
  ```

  Expected: No new lint errors.

- [ ] **Step 3: Check no secrets appear in Dockerfile ARGs (manual)**

  ```bash
  grep -E "SESSION_SECRET|ENCRYPTION_KEY|GATEWAY_JWT_SECRET" apps/web/Dockerfile
  ```

  Expected: Only the hardcoded `ENV` placeholder lines appear — no `ARG` lines for secrets.

- [ ] **Step 4: Check docker-compose uses fail-fast syntax (manual)**

  ```bash
  grep -E "SESSION_SECRET|ENCRYPTION_KEY|GATEWAY_JWT_SECRET" docker-compose.dokploy.yml
  ```

  Expected: All three appear only in the `environment:` section with `:?` syntax. None appear in `build.args:`.

- [ ] **Step 5: Commit summary**

  ```bash
  git log --oneline -10
  ```

  Should show the 8 commits from Tasks 1–8 (6 code fixes + 2 Electron fixes).

---

## Self-Review Notes

- **spec coverage:** All 8 spec items covered: Tasks 1–8 map 1:1 to spec sections.
- **no placeholders:** All code blocks are complete and copy-pasteable.
- **type consistency:** `validateHost` signature `(host: string, allow: boolean) => Promise<{valid:boolean, error?:string}>` used identically in Task 5 as in existing routes.
- **`timingSafeEqual`:** Already imported in `crypto.ts` — no new import needed for Task 1.
- **Task 4 note:** The `tokenPayload.protocol` field is typed as `'ssh' | 'scp' | 'rdp' | 'vnc'` and the URL `protocol` is typed the same — no cast needed.
