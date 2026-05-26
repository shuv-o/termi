# SSH Connect Page — Security & Performance Hardening

**Date:** 2026-05-03  
**Scope:** `apps/web/src/app/panel/connect/[id]/ssh/page.tsx`, `apps/web/src/components/terminal/SSHTerminal.tsx`, `apps/gateway/src/index.ts`

---

## Problem Statement

The `/panel/connect/[id]/ssh` page has several security and performance issues:

1. **JWE token in WS URL** — the encrypted credentials token appears in gateway server access logs.
2. **No token renewal** — JWE expires in 5 minutes; reconnect attempts after expiry silently fail.
3. **No disconnect/error UX** — `handleDisconnect` is a no-op; errors are console-only.
4. **No `onSessionNotFound` handler** — user stranded after retries exhausted.
5. **Sequential API calls** — server info and token fetched in sequence, not parallel.
6. **`TextEncoder` per keystroke** — new instance on every key input.
7. **Unsafe `btoa` spread** — `String.fromCharCode(...bytes)` can stack-overflow on large pastes.
8. **No resize debounce** — WS resize messages on every pixel of window resize.
9. **Hard reload reconnect** — "Reconnect" button uses `window.location.reload()`.

---

## Architecture

### 1. Auth Handshake (gateway + SSHTerminal)

**Current:** `ws://gateway/connect?token=<jwe>&protocol=ssh&serverId=...&sessionId=...`  
**New:** `ws://gateway/connect?protocol=ssh&serverId=...&sessionId=...`

The token is moved from the URL to the first WebSocket message.

**Handshake sequence:**
1. Client opens WS (no token in URL).
2. Client immediately sends: `{"type":"auth","token":"<jwe>"}`.
3. Gateway validates the JWE token within 5 seconds.
   - Valid → proceeds as before (reattach or new session).
   - Invalid / timeout → sends `{"type":"error","message":"Authentication failed"}` and closes with 1008.
4. All existing protocol handling (reattach, SSH session creation, etc.) is unchanged.

**Gateway changes (`apps/gateway/src/index.ts`):**
- In `wss.on('connection')`, read `protocol`/`serverId`/`sessionId` from query params as before (these are not secret). Set a 5-second auth timeout immediately.
- The `validateToken()` call (currently at the top of the connection handler) is REMOVED from the query-param path and moved into the `ws.on('message')` first-message handler.
- On `ws.on('message')`, if not yet authenticated (track with `let authenticated = false`): expect `{type:"auth",token}`, call `validateToken(token)`, store result in `tokenPayload`, set `authenticated = true`, clear auth timeout, proceed with existing protocol-branching logic.
- If any other message type arrives before auth: close 1008.
- If auth timeout fires: send `{"type":"error","message":"Authentication timeout"}` and close 1008.
- `serverId` is still passed in the query string (not secret — just a DB ID).
- `sessionId` is still in the query string (not secret — required for reattach before auth completes).

**SSHTerminal changes (`apps/web/src/components/terminal/SSHTerminal.tsx`):**
- Remove `token` from the WS URL.
- On `ws.onopen`, immediately send `{"type":"auth","token":"<connectionToken>"}`.
- Existing `case 'connected'` (now called after auth) is renamed to `case 'authenticated'` to avoid confusion — OR gateway can keep sending `connected` after auth completes. Keep `connected` message name to minimise changes; gateway sends `{"type":"connected"}` after successful auth.

### 2. Token Renewal

**New prop on SSHTerminal:**
```typescript
renewToken?: () => Promise<string>;
```

**Renewal flow:**
- `connectionToken` stored in a `connectionTokenRef` (not just a prop) so retries always use the latest token.
- On `connect()`: if `renewToken` is provided, call it first to get a fresh token, update `connectionTokenRef.current`, then open the WS.
- If `renewToken` throws: write error to terminal, stop retrying.

**Page implementation:**
```typescript
const renewToken = useCallback(async () => {
    const res = await fetch('/api/connection/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, protocol: 'ssh' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error('Failed to renew token');
    return data.data.token as string;
}, [serverId]);
```

`renewToken` is passed to `SSHTerminal`. On the initial connect (first render), `connectionToken` from state is used directly (no renewal needed). On reconnects, `renewToken()` is called.

To distinguish initial connect from reconnect, SSHTerminal tracks `hasConnectedOnce` ref (false initially, set to true after first `ws.onopen`).

### 3. UX Fixes (page.tsx)

**`onDisconnect`:** Show status in the header area — replace the server name subtitle with "Disconnected" in amber text. Add a "Reconnect" button that calls a new `reconnect()` function.

**`onError`:** Show an error banner (dismissable) above the terminal.

**`onSessionNotFound`:** Call `renewToken()` then trigger reconnect via a new `triggerReconnect` ref (callback passed down from page to terminal).

**Reconnect button:** Instead of `window.location.reload()`, call `triggerReconnect()` — clears the terminal, resets retry counter, gets fresh token, reconnects WS.

### 4. Parallel API Calls (page.tsx)

Replace sequential fetch → token with `Promise.all`:
```typescript
const [serverData, tokenData] = await Promise.all([
    fetch(`/api/servers/${serverId}`).then(r => r.json()),
    fetch('/api/connection/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, protocol: 'ssh' }),
    }).then(r => r.json()),
]);
```

### 5. Performance Fixes (SSHTerminal.tsx)

**TextEncoder as module constant:**
```typescript
const TEXT_ENCODER = new TextEncoder();
```

**Safe base64 encoding for large inputs:**
```typescript
function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
```
Used in `terminal.onData` instead of the spread form.

**Debounce resize (100ms):**
```typescript
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
const handleResize = () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        fit.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const { cols, rows } = terminal;
            wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
    }, 100);
};
```
Clear `resizeTimer` in effect cleanup.

---

## Files Changed

| File | Changes |
|------|---------|
| `apps/gateway/src/index.ts` | Auth handshake: 5s timeout, auth-first message handling |
| `apps/web/src/components/terminal/SSHTerminal.tsx` | Token out of URL, send auth on open, `renewToken` prop, `connectionTokenRef`, `bytesToBase64`, `TEXT_ENCODER`, debounced resize, `triggerReconnect` callback |
| `apps/web/src/app/panel/connect/[id]/ssh/page.tsx` | Parallel fetches, `renewToken` impl, `onDisconnect`/`onError`/`onSessionNotFound` handlers, reconnect button without `location.reload()` |

---

## Security Properties After Fix

| Threat | Before | After |
|--------|--------|-------|
| Token in gateway logs | ❌ Token in URL | ✅ Token in WS payload (not logged) |
| Expired token on reconnect | ❌ Silent failure | ✅ Auto-renewed before reconnect |
| User stranded after retries | ❌ No recovery | ✅ `onSessionNotFound` triggers renewal + reconnect |
| Server-initiated disconnect | ❌ No UI feedback | ✅ Header shows "Disconnected" + reconnect button |

---

## Not in Scope

- Auth handshake for SCP/RDP/VNC (separate pages, separate task)
- JTI tracking / token replay prevention (requires shared DB state)
- Decimal/octal IP bypass in SSRF (mitigated by web-layer `validateHost`)
