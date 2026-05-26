# Session Security & Connection Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all High/Medium audit findings in the SSH persistent session system: add WS heartbeat, exponential reconnect backoff, session-closed guard, bidirectional idle tracking, atomic session-limit, graceful shutdown on all signals, and remove leftover debug logs.

**Architecture:** All fixes are targeted and isolated — no structural changes. Gateway changes are in `PersistentSessionStore.ts` and `index.ts`; client changes are in `SSHTerminal.tsx`. Each fix is an independent commit.

**Tech Stack:** Node.js ESM gateway (ws, ssh2), Next.js 15 App Router, TypeScript, xterm.js

**Known risks NOT fixed here (architectural — acceptable for now):**
- JWE token replay: 5-min window is acceptable; JTI tracking requires shared DB state between web + gateway.
- In-memory session loss on gateway restart: already handled gracefully via `session-not-found` → `renewSession` flow.
- Cross-tab session reattach: acceptable by design (same authenticated user).

---

## Task 1: Remove debug console.logs

**Files:**
- Modify: `apps/gateway/src/index.ts` (lines 121, 127)
- Modify: `apps/web/src/components/terminal/SSHTerminal.tsx` (line 59)

- [ ] **Step 1: Remove the two debug console.log lines in gateway index.ts**

In `apps/gateway/src/index.ts`, remove these two lines that were added for debugging:
```typescript
// DELETE this line (was line ~121):
console.log(`[gateway] raw req.url: ${req.url?.slice(0, 300)}`);
// DELETE this line (was line ~127):
console.log(`[gateway] parsed: protocol=${protocol} serverId=${serverId?.slice(0,8)} sessionId=${JSON.stringify(sessionId)} paramKeys=[${[...url.searchParams.keys()].join(',')}]`);
```

- [ ] **Step 2: Remove the debug console.log in SSHTerminal.tsx**

In `apps/web/src/components/terminal/SSHTerminal.tsx` line 59, remove:
```typescript
// DELETE this line:
console.log('[SSHTerminal] connecting to:', wsUrl.replace(/token=[^&]+/, 'token=<redacted>'));
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/gateway && npx tsc --noEmit && cd ../web && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/gateway/src/index.ts apps/web/src/components/terminal/SSHTerminal.tsx
git commit -m "chore: remove debug console.logs from gateway and SSHTerminal"
```

---

## Task 2: Add `isClosing` guard to prevent sink/eviction race

**Files:**
- Modify: `apps/gateway/src/sessions/PersistentSessionStore.ts`
- Modify: `apps/gateway/src/index.ts` (createSink function)

The race: `createSink.onMessage` calls `persistentSessions.delete(session.sessionId)` which calls `session.handler.close()`. Meanwhile, another SSH callback fires and tries to write to the already-closed handler or send on a closed WS. Fix: add an `isClosing` flag set atomically when deletion begins.

- [ ] **Step 1: Add `isClosing` flag to PersistentSession interface**

In `apps/gateway/src/sessions/PersistentSessionStore.ts`, update the interface and `delete` method:
```typescript
export interface PersistentSession {
    sessionId: string;
    userId: string;
    serverId: string;
    handler: SSHHandler;
    buffer: RingBuffer;
    lastKeystrokeAt: number;
    createdAt: number;
    attachedWs: WebSocket | null;
    isClosing: boolean;   // ← add this
}
```

Update the `delete` method to set the flag before closing:
```typescript
delete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
        session.isClosing = true;   // ← set before close
        session.handler.close();
        this.sessions.delete(sessionId);
    }
}
```

- [ ] **Step 2: Set `isClosing: false` when creating sessions**

In `apps/gateway/src/index.ts` where `PersistentSession` is constructed (in the "New session" branch), add the flag:
```typescript
const session: PersistentSession = {
    sessionId: resolvedSessionId,
    userId: tokenPayload.userId,
    serverId,
    handler: null as any,
    buffer: new RingBuffer(),
    lastKeystrokeAt: Date.now(),
    createdAt: Date.now(),
    attachedWs: ws,
    isClosing: false,   // ← add this
};
```

- [ ] **Step 3: Guard createSink callbacks with isClosing check**

In `apps/gateway/src/index.ts`, update `createSink`:
```typescript
function createSink(session: PersistentSession): SSHOutputSink {
    return {
        onData(encoded: string) {
            if (session.isClosing) return;
            session.buffer.append(Buffer.from(encoded, 'base64'));
            if (session.attachedWs?.readyState === WebSocket.OPEN) {
                session.attachedWs.send(JSON.stringify({ type: 'data', data: encoded }));
            }
        },
        onMessage(type: string, extra?: Record<string, unknown>) {
            if (session.isClosing) return;
            if (session.attachedWs?.readyState === WebSocket.OPEN) {
                session.attachedWs.send(JSON.stringify({ type, ...extra }));
            }
            if (type === 'disconnected' || type === 'closed' || type === 'error') {
                persistentSessions.delete(session.sessionId);
            }
        },
    };
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/gateway && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/sessions/PersistentSessionStore.ts apps/gateway/src/index.ts
git commit -m "fix: add isClosing guard to prevent sink/eviction race condition"
```

---

## Task 3: Bidirectional idle tracking (track output activity too)

**Files:**
- Modify: `apps/gateway/src/index.ts` (createSink `onData`)
- Modify: `apps/gateway/src/sessions/PersistentSessionStore.ts` (evictIdleSessions)

Currently `lastKeystrokeAt` is updated only on inbound data (keystrokes). A session running a long build produces output continuously but receives no keystrokes — it would be wrongly evicted after 6h of "inactivity" if the user isn't typing. Fix: update on any SSH output too, and rename the field to `lastActivityAt` for clarity.

- [ ] **Step 1: Rename `lastKeystrokeAt` to `lastActivityAt` in the interface and store**

In `apps/gateway/src/sessions/PersistentSessionStore.ts`:
```typescript
export interface PersistentSession {
    sessionId: string;
    userId: string;
    serverId: string;
    handler: SSHHandler;
    buffer: RingBuffer;
    lastActivityAt: number;   // ← renamed from lastKeystrokeAt
    createdAt: number;
    attachedWs: WebSocket | null;
    isClosing: boolean;
}
```

Update `evictIdleSessions`:
```typescript
private evictIdleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
        // Only evict detached sessions (attached sessions have a live user)
        if (session.attachedWs === null && now - session.lastActivityAt > this.idleTimeoutMs) {
            console.log(`[PersistentSessionStore] Evicting idle session ${id} (user ${session.userId})`);
            this.delete(id);
        }
    }
}
```

- [ ] **Step 2: Update all references from `lastKeystrokeAt` to `lastActivityAt`**

In `apps/gateway/src/index.ts`:
- In the new-session constructor: `lastActivityAt: Date.now()`
- In the `case 'data':` message handler (inbound keystrokes): `session.lastActivityAt = Date.now();`
- In `createSink.onData` (outbound SSH output): `session.lastActivityAt = Date.now();`

```typescript
// In createSink:
onData(encoded: string) {
    if (session.isClosing) return;
    session.lastActivityAt = Date.now();   // ← update on outbound data too
    session.buffer.append(Buffer.from(encoded, 'base64'));
    if (session.attachedWs?.readyState === WebSocket.OPEN) {
        session.attachedWs.send(JSON.stringify({ type: 'data', data: encoded }));
    }
},

// In ws.on('message') case 'data':
case 'data':
    if (message.data) {
        session.lastActivityAt = Date.now();   // ← renamed
        session.handler.write(Buffer.from(message.data, 'base64'));
    }
    break;
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/gateway && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/gateway/src/sessions/PersistentSessionStore.ts apps/gateway/src/index.ts
git commit -m "fix: track bidirectional SSH activity for idle timeout (rename lastKeystrokeAt → lastActivityAt)"
```

---

## Task 4: Atomic session-limit check+add

**Files:**
- Modify: `apps/gateway/src/sessions/PersistentSessionStore.ts`
- Modify: `apps/gateway/src/index.ts` (new-session branch)

The race: two concurrent WS connections for the same user both call `isAtLimit()` → both get `false` → both call `add()` → limit exceeded by 1. Fix: replace separate `isAtLimit()` + `add()` with a single `tryAdd()` that checks and inserts atomically (JavaScript is single-threaded so this is sufficient — no async gap between check and insert).

- [ ] **Step 1: Add `tryAdd` method to PersistentSessionStore**

In `apps/gateway/src/sessions/PersistentSessionStore.ts`, add after `add()`:
```typescript
/**
 * Atomically checks the per-user limit and adds the session if under limit.
 * Returns true if added, false if limit would be exceeded.
 * JavaScript is single-threaded so no async gap between check and insert.
 */
tryAdd(session: PersistentSession): boolean {
    if (this.countByUser(session.userId) >= MAX_CONNECTIONS_PER_USER) return false;
    this.sessions.set(session.sessionId, session);
    return true;
}
```

Keep the existing `add()` method for reattach paths that don't need the limit check.

- [ ] **Step 2: Replace limit-check+add in gateway index.ts new-session branch**

In `apps/gateway/src/index.ts`, replace the existing pattern:
```typescript
// BEFORE (delete these lines):
if (persistentSessions.isAtLimit(tokenPayload.userId)) {
    const evicted = persistentSessions.evictOldestDetachedForUser(tokenPayload.userId);
    if (!evicted) {
        ws.send(JSON.stringify({ type: 'error', message: 'Too many connections' }));
        ws.close(4029, 'Too Many Requests');
        return;
    }
}
// ... session construction ...
persistentSessions.add(session);

// AFTER (replace with):
if (persistentSessions.isAtLimit(tokenPayload.userId)) {
    const evicted = persistentSessions.evictOldestDetachedForUser(tokenPayload.userId);
    if (!evicted) {
        ws.send(JSON.stringify({ type: 'error', message: 'Too many connections' }));
        ws.close(4029, 'Too Many Requests');
        return;
    }
}

const session: PersistentSession = {
    sessionId: resolvedSessionId,
    userId: tokenPayload.userId,
    serverId,
    handler: null as any,
    buffer: new RingBuffer(),
    lastActivityAt: Date.now(),
    createdAt: Date.now(),
    attachedWs: ws,
    isClosing: false,
};

const sink = createSink(session);
session.handler = new SSHHandler(tokenPayload, sink);

// tryAdd is atomic: if another concurrent connection sneaked in, this still rejects cleanly
if (!persistentSessions.tryAdd(session)) {
    session.isClosing = true;
    session.handler.close();
    ws.send(JSON.stringify({ type: 'error', message: 'Too many connections' }));
    ws.close(4029, 'Too Many Requests');
    return;
}
```

Note: `tryAdd` replaces the final `persistentSessions.add(session)` call. The eviction before still handles the common case; `tryAdd` is a safety net for the concurrent-connect race.

- [ ] **Step 3: TypeScript check**

```bash
cd apps/gateway && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add apps/gateway/src/sessions/PersistentSessionStore.ts apps/gateway/src/index.ts
git commit -m "fix: atomic session-limit check+add via tryAdd() to prevent race condition"
```

---

## Task 5: WS heartbeat — gateway sends ping, detects silent drops

**Files:**
- Modify: `apps/gateway/src/index.ts` (SSH WS connection block)
- Modify: `apps/web/src/components/terminal/SSHTerminal.tsx`

Without a heartbeat, a silent network drop (NAT timeout, mobile switching WiFi) leaves the gateway thinking the WS is still attached. The SSH session stays "attached" forever and no one can reattach. Fix: gateway sends `{"type":"ping"}` every 30 seconds; client responds with `{"type":"pong"}`. If gateway gets no pong within 15 seconds, it closes the WS (which triggers detach, not session close).

- [ ] **Step 1: Add heartbeat management to the SSH WS connection in gateway index.ts**

In `apps/gateway/src/index.ts`, after the reattach/new-session branching and before `ws.on('message', ...)`, add:

```typescript
// ── Heartbeat: detect silently-dropped WS connections ──
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS  = 15_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pongTimer: ReturnType<typeof setTimeout> | null = null;

function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'ping' }));
        pongTimer = setTimeout(() => {
            console.warn(`[gateway] SSH WS pong timeout for session ${resolvedSessionId} — closing`);
            ws.close(1001, 'Heartbeat timeout');
        }, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (pongTimer)      { clearTimeout(pongTimer);       pongTimer = null; }
}

startHeartbeat();
```

- [ ] **Step 2: Handle `pong` message and stop heartbeat timers on WS close**

In the `ws.on('message', ...)` switch statement, add a `pong` case:
```typescript
case 'pong':
    // Client is alive — cancel the pong timeout
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
    break;
```

Update `ws.on('close', ...)`:
```typescript
ws.on('close', () => {
    stopHeartbeat();
    const session = persistentSessions.get(resolvedSessionId);
    if (session && session.attachedWs === ws) {
        session.attachedWs = null;
    }
});
```

Update `ws.on('error', ...)`:
```typescript
ws.on('error', (err) => {
    stopHeartbeat();
    console.error('[gateway] SSH WebSocket error:', err);
});
```

- [ ] **Step 3: Handle `ping` and respond with `pong` in SSHTerminal.tsx**

In `apps/web/src/components/terminal/SSHTerminal.tsx`, in the `ws.onmessage` switch, add:
```typescript
case 'ping':
    // Gateway heartbeat — respond immediately
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
    }
    break;
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/gateway && npx tsc --noEmit && cd ../web && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/index.ts apps/web/src/components/terminal/SSHTerminal.tsx
git commit -m "feat: WS heartbeat — gateway pings every 30s, closes on 15s pong timeout"
```

---

## Task 6: Exponential backoff for reconnects in SSHTerminal

**Files:**
- Modify: `apps/web/src/components/terminal/SSHTerminal.tsx`

Currently on WS close the session context triggers a `renewSession` → remount of SSHTerminal. The reconnect is immediate. If the gateway is down, this hammers it with rapid reconnect attempts. Fix: track failure count in a ref; back off with `min(1.5^n * 1000, 30000)` ms delay before reconnecting, and cap at 5 auto-retries (then require manual retry).

The backoff lives in `SSHTerminal` because that's where the WS is managed. The sessions context `renewSession` call is the trigger; we intercept it by delaying inside the terminal before calling `onSessionNotFound`.

- [ ] **Step 1: Add backoff refs and helper to SSHTerminal.tsx**

Add refs and a helper at the top of the component (after the existing refs):
```typescript
const retryCountRef  = useRef(0);
const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
const MAX_AUTO_RETRIES = 5;

function getBackoffMs(attempt: number): number {
    return Math.min(Math.pow(1.5, attempt) * 1_000, 30_000);
}
```

- [ ] **Step 2: Clear retry timer on clean unmount**

In the cleanup return of `useEffect`, add:
```typescript
return () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    window.removeEventListener('resize', handleResize);
    const ws = wsRef.current;
    wsRef.current = null;
    onWebSocketCreatedRef.current?.(null);
    ws?.close();
    terminal.dispose();
};
```

- [ ] **Step 3: Apply backoff to `onclose` and `session-not-found` paths**

Replace the existing `ws.onclose` handler:
```typescript
ws.onclose = () => {
    if (wsRef.current !== ws) return;
    onWebSocketCreatedRef.current?.(null);
    if (statusRef.current === 'disconnected' || statusRef.current === 'error') return;

    retryCountRef.current += 1;
    if (retryCountRef.current > MAX_AUTO_RETRIES) {
        updateStatus('error');
        terminalInstance.current?.write(
            `\r\n\x1b[31mConnection lost after ${MAX_AUTO_RETRIES} retries. Click Retry to reconnect.\x1b[0m\r\n`
        );
        onErrorRef.current?.('Max reconnect attempts reached');
        return;
    }

    const delay = getBackoffMs(retryCountRef.current);
    updateStatus('disconnected');
    terminalInstance.current?.write(
        `\r\n\x1b[33mConnection lost. Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${retryCountRef.current}/${MAX_AUTO_RETRIES})...\x1b[0m\r\n`
    );
    retryTimerRef.current = setTimeout(() => {
        if (wsRef.current === null) return; // component unmounted
        onSessionNotFoundRef.current?.();   // triggers renewSession in context
    }, delay);
};
```

Replace `case 'session-not-found':`:
```typescript
case 'session-not-found':
    // Gateway lost the session (restart/expiry) — trigger new session creation.
    // Reset retry counter because this is a fresh gateway session, not a network failure.
    retryCountRef.current = 0;
    onSessionNotFoundRef.current?.();
    break;
```

Reset retry counter on successful connect:
```typescript
case 'shell-ready':
    retryCountRef.current = 0;   // ← add this line before updateStatus
    updateStatus('connected');
    // ...rest of shell-ready handler
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/terminal/SSHTerminal.tsx
git commit -m "feat: exponential backoff reconnect in SSHTerminal (1.5^n * 1s, max 30s, cap 5 retries)"
```

---

## Task 7: Graceful shutdown on SIGINT + uncaughtException/unhandledRejection

**Files:**
- Modify: `apps/gateway/src/index.ts` (shutdown block at bottom)

Currently only `SIGTERM` triggers cleanup. A `Ctrl+C` (SIGINT) or unhandled exception skips `destroy()`, leaving orphaned SSH connections on the remote server alive until the remote keepalive timeout.

- [ ] **Step 1: Add SIGINT and error handlers to gateway index.ts**

Replace the existing shutdown block at the bottom of `apps/gateway/src/index.ts`:
```typescript
// ── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string) {
    console.log(`[gateway] Received ${signal} — shutting down...`);
    persistentSessions.destroy();
    server.close(() => {
        console.log('[gateway] HTTP server closed.');
        process.exit(0);
    });
    // Force exit after 5 s if server.close() hangs
    setTimeout(() => { process.exit(1); }, 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    console.error('[gateway] Uncaught exception:', err);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    console.error('[gateway] Unhandled rejection:', reason);
    shutdown('unhandledRejection');
});
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/gateway && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add apps/gateway/src/index.ts
git commit -m "fix: graceful shutdown on SIGINT + uncaughtException/unhandledRejection"
```

---

## Task 8: Gateway-side basic SSRF guard (defense-in-depth)

**Files:**
- Modify: `apps/gateway/src/index.ts`

The web server validates host before issuing the JWE token. The gateway trusts the host embedded in the validated token. The audit finding is that if a server DB record changes after token issuance, the gateway could connect to a different host. This is a 5-minute window and requires a compromised DB. As defense-in-depth, add a simple private-IP/loopback block in the gateway before SSH connects.

- [ ] **Step 1: Add an inline `isPrivateHost` check function to gateway index.ts**

Add this function near the top of `apps/gateway/src/index.ts` (after imports):
```typescript
/**
 * Returns true if the host resolves to a private/loopback address.
 * Defense-in-depth: the web server already runs validateHost() before
 * issuing the JWE token, but this catches any server-record changes
 * within the 5-minute token window.
 */
function isPrivateHost(host: string): boolean {
    // Reject obvious loopback / metadata addresses
    const lower = host.toLowerCase().trim();
    const loopback = /^(localhost|127\.|::1|0\.0\.0\.0)/;
    const private10 = /^10\./;
    const private172 = /^172\.(1[6-9]|2\d|3[01])\./;
    const private192 = /^192\.168\./;
    const linkLocal = /^169\.254\./;
    const awsMeta = /^169\.254\.169\.254/;
    return loopback.test(lower) || private10.test(lower) || private172.test(lower)
        || private192.test(lower) || linkLocal.test(lower) || awsMeta.test(lower);
}
```

- [ ] **Step 2: Call isPrivateHost before SSH session creation**

In the SSH branch of gateway index.ts, just after the `resolvedSessionId` line and before creating the SSH session, add:
```typescript
if (isPrivateHost(tokenPayload.host)) {
    console.error(`[gateway] SSRF blocked: host ${tokenPayload.host} is private (session ${resolvedSessionId})`);
    ws.send(JSON.stringify({ type: 'error', message: 'Connection to private addresses is not allowed' }));
    ws.close(4003, 'Forbidden');
    return;
}
```

- [ ] **Step 3: Verify `tokenPayload.host` exists in the TokenPayload type**

Check `apps/gateway/src/auth/token.ts` — if `host` is not in `TokenPayload`, add it:
```typescript
export interface TokenPayload {
    userId: string;
    serverId: string;
    protocol: string;
    host: string;       // ← ensure this exists
    // ...other fields
}
```
And ensure `host` is included in the JWE claims in `apps/web/src/app/api/connection/token/route.ts`.

- [ ] **Step 4: TypeScript check**

```bash
cd apps/gateway && npx tsc --noEmit && cd ../web && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/index.ts apps/gateway/src/auth/token.ts
git commit -m "security: gateway-side SSRF guard blocks private/loopback hosts (defense-in-depth)"
```

---

## Final Verification

- [ ] **Build both apps**
```bash
npm run build
```
Expected: both apps build without errors

- [ ] **Manual smoke test**
1. Start dev stack: `npm run dev:all`
2. Open `/panel` → click "Sessions" on an SSH server → terminal connects ✓
3. Close browser tab → re-open sessions page → session restores from background ✓
4. Kill and restart gateway → session shows error + retries with visible backoff delay ✓
5. After 5 retries it stops and shows "Max reconnect attempts reached" ✓
6. Click Retry → reconnects fresh ✓
7. Wait 30s → check gateway logs for ping/pong messages ✓

- [ ] **Final commit tag**
```bash
git tag session-hardening-v1
```
