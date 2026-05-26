# SSH Connect Page Security & Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the SSH connect page with WS auth handshake (token out of URL), automatic token renewal on reconnect, proper disconnect/error UX, and client-side performance fixes.

**Architecture:** Token is moved from WS query string to the first WS message (auth handshake). Gateway expects `{type:"auth",token}` within 5s of connection or closes. SSHTerminal holds `connectionTokenRef` and calls an optional `renewToken()` prop before each reconnect. Page handles all terminal state transitions with proper UI feedback.

**Tech Stack:** Node.js ESM gateway (ws), Next.js 15 App Router, xterm.js, React hooks, TypeScript

---

## Files

| File | Change |
|------|--------|
| `apps/gateway/src/index.ts` | Auth handshake: 5s timeout, defer `validateToken` to first WS message |
| `apps/web/src/components/terminal/SSHTerminal.tsx` | Remove token from URL, send auth on open, `renewToken` prop, `connectionTokenRef`, `bytesToBase64`, `TEXT_ENCODER`, debounced resize, `onReconnectReady` |
| `apps/web/src/app/dashboard/connect/[id]/ssh/page.tsx` | Parallel fetches, `renewToken` impl, `onDisconnect`/`onError`/`onSessionNotFound` handlers, reconnect button fix |

---

## Task 1: Gateway Auth Handshake

**Files:**
- Modify: `apps/gateway/src/index.ts` (lines ~149–201, the wss.on('connection') preamble)

The current flow validates the token synchronously from the URL query param. The new flow:
1. Parse URL params (`protocol`, `serverId`, `sessionId`) — no token
2. Set a 5-second auth timeout that closes the socket if no auth message arrives
3. Wait for first WS message: `{type:"auth",token:"<jwe>"}`
4. Validate token, clear timeout, then run existing logic (serverId/protocol checks, SSRF, protocol branch)

- [ ] **Step 1: Replace the wss.on('connection') preamble**

Open `apps/gateway/src/index.ts`. Find line ~149 where `wss.on('connection', async (ws, req) =>` starts.

Replace everything from the connection handler opening through the SSRF check (lines ~149–201) with the auth-handshake wrapper below. The rest of the file (SSH branch, non-SSH branch, shutdown handlers) remains **unchanged**.

```typescript
wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const origin = (req.headers['origin'] || '').toLowerCase();
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Origin not allowed' }));
        ws.close(4403, 'Forbidden');
        return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    // token is NO LONGER in the URL — it arrives in the first WS message
    const protocol  = url.searchParams.get('protocol') as 'ssh' | 'scp' | 'rdp' | 'vnc';
    const serverId  = url.searchParams.get('serverId');
    const sessionId = url.searchParams.get('sessionId');

    if (!protocol || !serverId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing required parameters' }));
        ws.close(4000, 'Bad Request');
        return;
    }

    if (!['ssh', 'scp', 'rdp', 'vnc'].includes(protocol)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid protocol' }));
        ws.close(4000, 'Bad Request');
        return;
    }

    // ── Auth handshake: expect {type:"auth",token} within 5 seconds ──────────
    const AUTH_TIMEOUT_MS = 5_000;
    const authTimeout = setTimeout(() => {
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication timeout' }));
        ws.close(1008, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);

    // Clear auth timeout if socket closes before auth completes
    ws.once('close', () => clearTimeout(authTimeout));
    ws.once('error', () => clearTimeout(authTimeout));

    const onAuthMessage = async (rawData: Buffer) => {
        let message: { type: string; token?: string };
        try {
            message = JSON.parse(rawData.toString());
        } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
            ws.close(1008, 'Authentication required');
            return;
        }

        if (message.type !== 'auth' || typeof message.token !== 'string') {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
            ws.close(1008, 'Authentication required');
            return;
        }

        let tokenPayload: TokenPayload;
        try {
            tokenPayload = await validateToken(message.token);
        } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
            ws.close(4001, 'Unauthorized');
            return;
        }

        clearTimeout(authTimeout);
        ws.off('message', onAuthMessage);

        // ── Token payload cross-checks ─────────────────────────────────────
        if (tokenPayload.serverId !== serverId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Server access denied' }));
            ws.close(4003, 'Forbidden');
            return;
        }

        if (tokenPayload.protocol !== protocol) {
            ws.send(JSON.stringify({ type: 'error', message: 'Protocol mismatch' }));
            ws.close(4003, 'Forbidden');
            return;
        }

        // ── SSRF guard ────────────────────────────────────────────────────
        if (isPrivateHost(tokenPayload.host)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Connection to private/internal hosts is not allowed' }));
            ws.close(1008, 'SSRF protection');
            return;
        }

        // ── Route to protocol handler ─────────────────────────────────────
        if (protocol === 'ssh') {
```

Then the existing SSH block (starting with `const resolvedSessionId = ...`) continues exactly as before. After the `return; // SSH handled` line, the non-SSH block also continues unchanged.

Close the `onAuthMessage` function and register it:

```typescript
    }; // end onAuthMessage

    ws.on('message', onAuthMessage);
}); // end wss.on('connection')
```

Note: The outer `wss.on('connection')` handler is now **synchronous** (no `async`). All async work happens inside `onAuthMessage`.

- [ ] **Step 2: Remove the `token` check from required params**

In the new preamble above, `token` is no longer parsed from URL params, so the check `if (!token || !protocol || !serverId)` becomes `if (!protocol || !serverId)`. Make sure the old `token` variable is fully removed.

- [ ] **Step 3: TypeScript check**

```bash
cd apps/gateway && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Run tests**

```bash
cd apps/gateway && npx vitest run
```
Expected: 19 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/index.ts
git commit -m "feat: WS auth handshake — token in first message, not URL query string

Token is no longer logged in gateway access logs. Gateway expects
{type:\"auth\",token} as first WS message within 5s. Closes 1008 on
timeout or non-auth first message. All protocol handling unchanged.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: SSHTerminal — Auth Handshake + Token Renewal

**Files:**
- Modify: `apps/web/src/components/terminal/SSHTerminal.tsx`

Changes:
- Remove `token` from WS URL
- On `ws.onopen`: send `{type:"auth", token: connectionTokenRef.current}`
- Add `connectionTokenRef` (always up-to-date with prop)
- Add `renewToken?: () => Promise<string>` prop
- Add `renewTokenRef` (stable ref to prop callback)
- Add `hasConnectedOnce` ref (false initially, true after first open)
- `connect` becomes `async`: if `hasConnectedOnce.current && renewTokenRef.current`, call renewToken first and update `connectionTokenRef.current`
- Remove `connectionToken` from `connect` deps — use ref instead
- Add `onReconnectReady?: (fn: () => void) => void` prop so page can trigger reconnect
- Expose `triggerReconnect` via `onReconnectReady` in the terminal setup effect

- [ ] **Step 1: Update the props interface**

Find the `SSHTerminalProps` interface and add two new props:

```typescript
interface SSHTerminalProps {
    sessionId: string;
    serverId: string;
    connectionToken: string;
    gatewayUrl?: string;
    onDisconnect?: () => void;
    onError?: (error: string) => void;
    onKeyHandlerReady?: (handler: (key: string) => void) => void;
    onWebSocketCreated?: (ws: WebSocket | null) => void;
    onSessionNotFound?: () => void;
    renewToken?: () => Promise<string>;          // NEW
    onReconnectReady?: (fn: () => void) => void; // NEW
}
```

Also destructure the new props in the function signature:
```typescript
export default function SSHTerminal({
    sessionId,
    serverId,
    connectionToken,
    gatewayUrl,
    onDisconnect,
    onError,
    onKeyHandlerReady,
    onWebSocketCreated,
    onSessionNotFound,
    renewToken,          // NEW
    onReconnectReady,    // NEW
}: SSHTerminalProps) {
```

- [ ] **Step 2: Add connectionTokenRef, renewTokenRef, hasConnectedOnce**

After the existing `onSessionNotFoundRef` declaration, add:

```typescript
const connectionTokenRef = useRef(connectionToken);
connectionTokenRef.current = connectionToken; // keep in sync with prop

const renewTokenRef = useRef(renewToken);
renewTokenRef.current = renewToken;

const onReconnectReadyRef = useRef(onReconnectReady);
onReconnectReadyRef.current = onReconnectReady;

const hasConnectedOnce = useRef(false);
```

- [ ] **Step 3: Rewrite the `connect` useCallback**

Replace the entire `connect` useCallback with an async version. Key changes:
- Remove `connectionToken` from the dependency array
- Remove `token` from WS URL
- Call `renewToken` if this is a reconnect
- Send auth message on `ws.onopen`

```typescript
const connect = useCallback(async () => {
    // On reconnects, refresh the token before opening the socket
    if (hasConnectedOnce.current && renewTokenRef.current) {
        try {
            const newToken = await renewTokenRef.current();
            connectionTokenRef.current = newToken;
        } catch {
            terminalInstance.current?.writeln('\r\n\x1b[31mFailed to renew connection token.\x1b[0m');
            updateStatus('error');
            return;
        }
    }

    const gatewayBase = gatewayUrl || process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:22081';
    // Token is NO LONGER in the URL — sent as first WS message instead
    const wsUrl = `${gatewayBase}/connect?protocol=ssh&serverId=${encodeURIComponent(serverId)}&sessionId=${encodeURIComponent(sessionId)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    onWebSocketCreatedRef.current?.(ws);

    ws.onopen = () => {
        hasConnectedOnce.current = true;
        // Send auth token as first message (not in URL)
        ws.send(JSON.stringify({ type: 'auth', token: connectionTokenRef.current }));
    };

    ws.onmessage = (event) => {
        // ... UNCHANGED — copy entire existing onmessage block here ...
    };

    ws.onclose = () => {
        // ... UNCHANGED — copy entire existing onclose block here ...
    };

    ws.onerror = () => {
        // ... UNCHANGED — copy entire existing onerror block here ...
    };
}, [serverId, sessionId, gatewayUrl, updateStatus]); // connectionToken removed from deps
```

Keep all the existing `onmessage`, `onclose`, `onerror` logic exactly as-is. Only the `connect` function signature changes.

- [ ] **Step 4: Update the retry setTimeout call to handle async connect**

In `ws.onclose`, the retry setTimeout calls `connect()`. Since `connect` is now async, wrap it to avoid unhandled rejection:

```typescript
retryTimerRef.current = setTimeout(() => {
    connect().catch(() => {/* handled inside connect */});
}, delayMs);
```

- [ ] **Step 5: Expose triggerReconnect via onReconnectReady in the terminal setup effect**

In the second `useEffect` (the one that sets up xterm), after `retryCountRef.current = 0; connect();`, add:

```typescript
// Expose reconnect trigger to parent (for the header Reconnect button)
const triggerReconnect = () => {
    if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
    }
    retryCountRef.current = 0;
    intentionalCloseRef.current = false;
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
    terminal.clear();
    terminal.write('Reconnecting...\r\n');
    connect().catch(() => {/* handled inside connect */});
};
onReconnectReadyRef.current?.(triggerReconnect);
```

- [ ] **Step 6: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 7: Run gateway tests**

```bash
cd apps/gateway && npx vitest run
```
Expected: 19 passed.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/terminal/SSHTerminal.tsx
git commit -m "feat: SSHTerminal auth handshake — token in ws.onopen message, renewToken prop

Token removed from WS URL. Sent as {type:\"auth\",token} on socket open.
connectionTokenRef keeps token fresh for reconnects. renewToken() called
before each reconnect attempt. onReconnectReady exposes trigger to parent.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: page.tsx — Parallel Fetches, Token Renewal, UX Handlers

**Files:**
- Modify: `apps/web/src/app/dashboard/connect/[id]/ssh/page.tsx`

Changes:
- Parallel `Promise.all` for server info + token fetch
- `renewToken` callback passed to SSHTerminal
- `onDisconnect`: show disconnected state in header (amber "Disconnected" text + Reconnect button)
- `onError`: show dismissable error banner above terminal
- `onSessionNotFound`: call the reconnect trigger (which calls renewToken automatically)
- Store the reconnect trigger in a ref (`reconnectTriggerRef`)
- `RotateCcw` button calls `reconnectTriggerRef.current?.()` instead of `window.location.reload()`

- [ ] **Step 1: Add new state variables**

After the existing state declarations, add:

```typescript
const [terminalStatus, setTerminalStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
const [terminalError, setTerminalError] = useState<string | null>(null);
const reconnectTriggerRef = useRef<(() => void) | null>(null);
```

- [ ] **Step 2: Parallelize the API calls in `initConnection`**

Replace the sequential fetch calls with `Promise.all`:

```typescript
useEffect(() => {
    async function initConnection() {
        try {
            const [serverResponse, tokenResponse] = await Promise.all([
                fetch(`/api/servers/${serverId}`),
                fetch('/api/connection/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ serverId, protocol: 'ssh' }),
                }),
            ]);

            const [serverData, tokenData] = await Promise.all([
                serverResponse.json(),
                tokenResponse.json(),
            ]);

            if (!serverData.success) {
                setError('Server not found');
                setLoading(false);
                return;
            }

            if (!tokenData.success) {
                setError('Failed to get connection token');
                setLoading(false);
                return;
            }

            setServer(serverData.data.server);
            setConnectionToken(tokenData.data.token);
            setGatewayUrl(tokenData.data.gatewayUrl ?? null);
            setLoading(false);
        } catch (err) {
            console.error('Connection error:', err);
            setError('Failed to initialize connection');
            setLoading(false);
        }
    }

    initConnection();
}, [serverId]);
```

- [ ] **Step 3: Add the renewToken callback**

After `handleDisconnect` and `handleError`, add:

```typescript
const renewToken = useCallback(async (): Promise<string> => {
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

- [ ] **Step 4: Update handleDisconnect, handleError, and add handleSessionNotFound**

Replace the no-op `handleDisconnect` and console-only `handleError`:

```typescript
const handleDisconnect = useCallback(() => {
    setTerminalStatus('disconnected');
}, []);

const handleError = useCallback((err: string) => {
    setTerminalError(err);
}, []);

const handleSessionNotFound = useCallback(() => {
    // Triggers triggerReconnect() in SSHTerminal which calls renewToken() first
    reconnectTriggerRef.current?.();
}, []);
```

- [ ] **Step 5: Pass new props to SSHTerminal**

Update the `<SSHTerminal>` JSX to include the new props:

```tsx
<SSHTerminal
    sessionId={sessionIdRef.current}
    serverId={serverId}
    connectionToken={connectionToken}
    gatewayUrl={gatewayUrl ?? undefined}
    onDisconnect={handleDisconnect}
    onError={handleError}
    onKeyHandlerReady={(handler) => { terminalKeyHandler.current = handler; }}
    onSessionNotFound={handleSessionNotFound}
    renewToken={renewToken}
    onReconnectReady={(fn) => { reconnectTriggerRef.current = fn; }}
/>
```

- [ ] **Step 6: Update the Reconnect (RotateCcw) button**

Find the `RotateCcw` button and replace `window.location.reload()` with the reconnect trigger:

```tsx
<Button
    variant="ghost"
    size="icon"
    onClick={() => {
        setTerminalError(null);
        setTerminalStatus('connecting');
        reconnectTriggerRef.current?.();
    }}
    title="Reconnect"
>
    <RotateCcw className="w-4 h-4" />
</Button>
```

- [ ] **Step 7: Add disconnect status indicator and error banner to the JSX**

In the header, after the server name `<h1>`, show disconnect state:

```tsx
<div className="min-w-0">
    <h1 className="font-medium truncate">{server?.name}</h1>
    <span className={`text-sm ${terminalStatus === 'disconnected' ? 'text-amber-500' : 'text-muted-foreground'}`}>
        {terminalStatus === 'disconnected' ? 'Disconnected' : 'SSH Terminal'}
    </span>
</div>
```

Above the `{/* Main area: terminal + optional file panel */}` div, add the error banner:

```tsx
{terminalError && (
    <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive shrink-0">
        <span>{terminalError}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setTerminalError(null)}>
            <X className="w-3 h-3" />
        </Button>
    </div>
)}
```

- [ ] **Step 8: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/panel/connect/[id]/ssh/page.tsx
git commit -m "feat: parallel token fetch, renewToken, disconnect UX and proper reconnect

- Promise.all for server+token fetches cuts load time in half
- renewToken() re-issues JWE before each reconnect attempt
- onDisconnect shows amber Disconnected state in header
- onError shows dismissable error banner above terminal
- onSessionNotFound triggers reconnect (which auto-renews token)
- RotateCcw button calls triggerReconnect() instead of location.reload()

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: SSHTerminal Performance Fixes

**Files:**
- Modify: `apps/web/src/components/terminal/SSHTerminal.tsx`

- [ ] **Step 1: Add module-level TEXT_ENCODER and bytesToBase64**

At the very top of the file, after the imports, add:

```typescript
// Module-level encoder — avoid allocating a new instance on every keystroke
const TEXT_ENCODER = new TextEncoder();

// Safe base64 encoding for arbitrary-length byte arrays.
// String.fromCharCode(...bytes) with spread can overflow the call stack
// when pasting large text (> ~65k bytes).
function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
```

- [ ] **Step 2: Use TEXT_ENCODER and bytesToBase64 in terminal.onData**

In the second `useEffect` (terminal setup), find the `terminal.onData` handler:

Replace:
```typescript
terminal.onData((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        const bytes = new TextEncoder().encode(data);
        const encoded = btoa(String.fromCharCode(...bytes));
        wsRef.current.send(JSON.stringify({ type: 'data', data: encoded }));
    }
});
```

With:
```typescript
terminal.onData((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        const encoded = bytesToBase64(TEXT_ENCODER.encode(data));
        wsRef.current.send(JSON.stringify({ type: 'data', data: encoded }));
    }
});
```

- [ ] **Step 3: Debounce the resize handler (100ms)**

In the terminal setup effect, replace the `handleResize` function and its cleanup:

Replace:
```typescript
const handleResize = () => {
    fit.fit();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        const { cols, rows } = terminal;
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
};
window.addEventListener('resize', handleResize);
```

With:
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
window.addEventListener('resize', handleResize);
```

In the cleanup `return () => { ... }` at the bottom of the effect, add `resizeTimer` cleanup:

```typescript
return () => {
    window.removeEventListener('resize', handleResize);
    if (resizeTimer) clearTimeout(resizeTimer);
    // ... rest of existing cleanup unchanged ...
};
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Run gateway tests to verify nothing broken**

```bash
cd apps/gateway && npx vitest run
```
Expected: 19 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/terminal/SSHTerminal.tsx
git commit -m "perf: SSHTerminal — module-level TextEncoder, safe base64, debounced resize

- TEXT_ENCODER at module level: no allocation per keystroke
- bytesToBase64 loop: safe for large pastes (no call-stack limit)
- handleResize debounced 100ms: single resize WS message per drag gesture

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review Checklist

- [x] **Auth handshake** — gateway Task 1 covers 5s timeout, first-message auth, close on failure
- [x] **Token not in URL** — Task 2 removes `token` from WS URL construction
- [x] **Send auth on open** — Task 2 sends `{type:"auth",token}` in `ws.onopen`
- [x] **connectionTokenRef** — Task 2 adds ref + keeps in sync with prop
- [x] **renewToken prop** — Task 2 defines prop and calls it in `connect()` on reconnects
- [x] **hasConnectedOnce** — Task 2 distinguishes initial connect from reconnects
- [x] **Parallel fetches** — Task 3 uses `Promise.all`
- [x] **renewToken in page** — Task 3 implements callback that re-fetches `/api/connection/token`
- [x] **onDisconnect UI** — Task 3 shows amber "Disconnected" in header subtitle
- [x] **onError banner** — Task 3 adds dismissable error banner
- [x] **onSessionNotFound → reconnect** — Task 3 calls `reconnectTriggerRef.current?.()`
- [x] **RotateCcw fixed** — Task 3 replaces `location.reload()` with trigger
- [x] **TEXT_ENCODER** — Task 4 module-level constant
- [x] **bytesToBase64** — Task 4 loop-based encoding
- [x] **Debounced resize** — Task 4 100ms debounce with cleanup
- [x] **connect() async** — Task 2 marks connect as async, wraps setTimeout calls
- [x] **auth timeout cleared on socket close** — Task 1 uses `ws.once('close')` to clear auth timeout
