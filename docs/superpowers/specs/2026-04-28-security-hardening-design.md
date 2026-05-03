# Termi Security Hardening Design

**Date:** 2026-04-28  
**Scope:** Web (Docker/Traefik) + Electron desktop  
**Deployment:** Single-instance, remote PostgreSQL  
**Approach:** Option A — Surgical targeted fixes

---

## Problem Statement

Termi has a strong security foundation (AES-256-GCM credentials, scrypt passwords, JWE tokens, SSRF guards, CSP headers) but several concrete vulnerabilities were found during audit:
- Secrets exposed via Docker build layer history
- Timing oracle in `secureCompare`
- No SSL enforcement for the remote database connection
- Protocol mismatch not cross-validated in the gateway
- SSRF protection only at server-save time, not at token-issue time
- Hardcoded production infrastructure URL in source
- Electron PTY `cwd` not validated; config file permissions not set

---

## Findings & Fixes

### 1. Cryptography — `secureCompare` timing oracle

**File:** `apps/web/src/lib/crypto/crypto.ts`

**Problem:** `secureCompare` early-exits on `a.length !== b.length`, leaking string length via timing side-channel.

**Fix:** Convert both strings to `Buffer`, zero-pad the shorter one to equal length, then use `timingSafeEqual`. Result: always constant-time regardless of input.

```ts
export function secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    const len = Math.max(bufA.length, bufB.length);
    const padA = Buffer.concat([bufA, Buffer.alloc(len - bufA.length)]);
    const padB = Buffer.concat([bufB, Buffer.alloc(len - bufB.length)]);
    return timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}
```

The `&& bufA.length === bufB.length` is evaluated after the constant-time comparison, so length is only returned after the timing-safe path has already run.

---

### 2. Docker — Secrets in build layer history

**Files:** `apps/web/Dockerfile`, `docker-compose.dokploy.yml`

**Problem:** `SESSION_SECRET`, `ENCRYPTION_KEY`, and `GATEWAY_JWT_SECRET` are passed as Docker build `ARG`s via docker-compose. When a user sets real secrets in `.env`, those secrets are baked into the image layer history and visible via `docker history --no-trunc`.

**Fix:** Remove all three from `ARG`/`ENV` in the Dockerfile entirely. These are not needed at build time — the placeholder comment proves this. Instead, set a hardcoded build-time constant of sufficient length directly in the Dockerfile so Next.js env validation passes. Real values are injected only at runtime via docker-compose `environment:`.

Also: remove insecure `:-change-this` default fallbacks from docker-compose. Missing secrets in production should cause the container to fail, not silently use a weak value.

---

### 3. Database — No SSL enforcement for remote connection

**File:** `apps/web/src/lib/db/prisma.ts`

**Problem:** The Prisma singleton starts without validating that `DATABASE_URL` includes `sslmode=require`. With a remote database, traffic can be unencrypted.

**Fix:** At production startup, parse `DATABASE_URL` and assert it contains `sslmode=require` or `ssl=true`. If not present, throw a clear error and refuse to start.

Also update `.env.example`: show `?sslmode=require` in the example `DATABASE_URL`, and remove the unused `GATEWAY_URL` variable.

---

### 4. Gateway — Protocol cross-validation

**File:** `apps/gateway/src/index.ts`

**Problem:** After validating the JWE token, the gateway checks `tokenPayload.serverId === serverId` but does NOT check `tokenPayload.protocol === protocol`. A valid SSH token could be submitted with `protocol=rdp` in the URL, routing to `GuacamoleHandler` with SSH credentials.

**Fix:** Add `tokenPayload.protocol !== protocol` check immediately after `serverId` validation. Close with `4403 Forbidden` on mismatch.

---

### 5. Gateway — SSRF re-validation at token issuance (DNS rebinding)

**File:** `apps/web/src/app/api/connection/token/route.ts`

**Problem:** SSRF validation runs when a server is created/updated, but not when a connection token is issued. A DNS rebinding attack or admin race condition between save and connect bypasses the guard.

**Fix:** Call `validateHost(server.host, process.env.ALLOW_PRIVATE_NETWORKS === 'true')` in the token route after `getServerForConnection()` returns the decrypted server. Reject token issuance if the host resolves to a private address.

---

### 6. Token route — Hardcoded production URL

**File:** `apps/web/src/app/api/connection/token/route.ts`

**Problem:** `|| 'https://gateway.termi.dp.shuvoo.com'` hardcodes internal infrastructure in source code, leaking the production deployment URL and making the fallback misleading.

**Fix:** Change to `|| process.env.GATEWAY_URL || 'ws://localhost:22081'`. Also align `GATEWAY_URL` vs `NEXT_PUBLIC_GATEWAY_URL` usage in `.env.example` with clear comments on which is server-side only.

---

### 7. Electron — `cwd` parameter not validated

**File:** `apps/electron/main.js`

**Problem:** The `local-terminal:create` IPC handler accepts `{ cwd }` from the renderer process and passes it directly to `node-pty` without validation. A compromised renderer could set `cwd` to any path.

**Fix:**
1. Resolve `cwd` to an absolute path using `path.resolve()`
2. Verify it exists with `fs.existsSync()`
3. Fall back to `os.homedir()` if invalid or missing

---

### 8. Electron — `termi.config.json` world-readable

**File:** `apps/electron/main.js`

**Problem:** `termi.config.json` stores `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, and `GATEWAY_JWT_SECRET` in the OS user-data directory. On macOS/Linux, the default file permissions allow other OS users to read the file.

**Fix:** After confirming the file path at startup, call `fs.chmodSync(configPath, 0o600)` (owner-read/write only). Apply this both when the file already exists and whenever it would be created.

---

## Files Changed

| File | Changes |
|------|---------|
| `apps/web/src/lib/crypto/crypto.ts` | Fix `secureCompare` to use `timingSafeEqual` |
| `apps/web/Dockerfile` | Remove secrets from build ARGs |
| `docker-compose.dokploy.yml` | Remove insecure fallback defaults for secrets |
| `apps/web/src/lib/db/prisma.ts` | Add SSL enforcement at startup |
| `apps/gateway/src/index.ts` | Add protocol cross-validation |
| `apps/web/src/app/api/connection/token/route.ts` | Add SSRF re-check; fix hardcoded URL |
| `apps/electron/main.js` | Validate `cwd`; set config file permissions |
| `.env.example` | Add `sslmode=require`; remove `GATEWAY_URL`; clarify docs |

---

## Out of Scope

- Redis-backed rate limiter (single-instance deployment; in-memory is acceptable)
- CSP `unsafe-inline` removal (requires Tailwind refactor)
- Gateway `/health` endpoint (user chose to leave open for monitoring)
