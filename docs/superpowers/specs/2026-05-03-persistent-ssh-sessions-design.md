# Persistent SSH Sessions

**Date:** 2026-05-03  
**Status:** Approved

## Problem

SSH terminal sessions are currently tied to a browser tab. Closing the tab or browser terminates the WebSocket, which immediately closes the SSH connection. Users lose their terminal context on every navigation away or accidental tab close.

## Goal

SSH sessions must survive tab/browser close and only terminate when:
1. The user explicitly closes the session, or
2. No keystrokes have been received for 6 continuous hours (background idle timeout).

When a user returns, they see the last ~500 lines of buffered output and reconnect to the live SSH stream.

## Scope

- **In scope**: SSH protocol only. RDP/VNC/SCP are unchanged.
- **Out of scope**: Session persistence across gateway restarts (in-memory only).

---

## Architecture

Four components are changed. Each has one clear responsibility.

### 1. `PersistentSessionStore` (gateway — new file)

An in-memory `Map<sessionId, PersistentSession>`. Owns the SSH connection lifetime independently of any WebSocket. The gateway's existing `connections` map (keyed by `WebSocket`) is kept for per-WS tracking; the new store is keyed by the stable `sessionId`.

```ts
interface PersistentSession {
  sessionId: string;          // UUID v4, generated on first connect
  userId: string;
  serverId: string;
  handler: SSHHandler;
  buffer: RingBuffer;         // circular byte buffer, 256 KB cap
  lastKeystrokeAt: number;    // updated on every WS→SSH input message
  createdAt: number;
  attachedWs: WebSocket | null; // null = detached
}
```

A `setInterval` runs every 60 seconds and terminates any session where:
- `attachedWs === null` (detached), AND
- `now - lastKeystrokeAt > 6 * 3600 * 1000` (6 hours)

### 2. `RingBuffer` (gateway — new file)

A fixed-capacity (256 KB) circular byte buffer. SSH output is appended as it arrives. On capacity overflow, the oldest bytes are dropped. On reconnect, the entire buffer is flushed to the new WebSocket as one or more `data` frames.

### 3. `SSHHandler` refactor (gateway)

Currently holds a direct `WebSocket` reference for writing output. This is replaced with an `AttachableSink` interface:

```ts
interface AttachableSink {
  send(data: string): void;   // base64-encoded output chunk
  isOpen(): boolean;
}
```

The handler writes to the sink. The `PersistentSessionStore` wires the sink: when detached, sink → buffer only; when attached, sink → buffer + WS.

The existing WS idle timeout (`CONNECTION_TIMEOUT`) is **removed** for persistent sessions — SSH keepalive (15 s interval, 6 missed = ~90 s) handles real SSH-level disconnection. The 6-hour background idle check applies only to **detached** sessions (no WebSocket attached). Connected sessions stay alive as long as the user's tab is open; the SSH keepalive handles truly dead SSH connections.

### 4. Gateway connection handler refactor (`index.ts`)

**New connection with `sessionId`** (browser sends fresh UUID):
1. Validate JWE token.
2. Create `PersistentSession`, store in `PersistentSessionStore`.
3. Attach WS, initialize `SSHHandler`.

**Reconnect** (browser sends existing `sessionId`):
1. Validate JWE token (fresh, issued just before reconnect).
2. Look up `sessionId` in store.
   - **Found**: attach new WS, flush ring buffer, update `attachedWs`.
   - **Not found** (gateway restarted or session expired): send `{"type":"session-not-found"}`, browser creates a new session.
3. If the old WS is still open (duplicate tab), send `{"type":"replaced"}` and detach it.

**Explicit close** (`{"type":"close-session"}` message):
1. Remove session from `PersistentSessionStore`.
2. Call `handler.close()` → SSH terminates.

**WS disconnect** (tab/browser close):
- `ws.on('close')`: set `attachedWs = null` on the session. SSH stays alive. Session enters detached state.

---

## WebSocket Protocol Changes

New message types (gateway → browser):

| Type | Meaning |
|------|---------|
| `session-not-found` | Requested `sessionId` not in store; browser should create new session |
| `replaced` | Another tab attached to this session; this WS is now detached |
| `buffer-replay` | Contains buffered output to be written to terminal on reconnect |

New message type (browser → gateway):

| Type | Meaning |
|------|---------|
| `close-session` | User explicitly closed the session; gateway destroys SSH |

The `sessionId` is passed as a query parameter: `ws://gateway/connect?token=...&sessionId=<uuid>&protocol=ssh&serverId=<id>`.

---

## Browser Changes

### `sessions-context.tsx`

- **Storage**: switch from `sessionStorage` to `localStorage` so sessions survive browser close.
- **Persisted shape**: add `sessionId: string` (UUID) to `PersistedSession`.
- **`addSession`**: generates a new UUID `sessionId` and stores it in the session object.
- **`reconnectSession`**: uses the existing `sessionId` from the session object (not generating a new one).
- **Status addition**: `'detached'` is added to `SessionStatus`.

On page load, restored sessions start in `'detached'` status and immediately trigger reconnect.

### `sessions-workspace.tsx`

- **Auto-reconnect**: a `useEffect` watches for sessions with status `'detached'` and calls `reconnectSession` automatically.

### Session tab UI

Detached sessions display an amber pulsing indicator (●) and a tooltip "Session running in background". Connected/connecting/error states are unchanged.

---

## LocalStorage Schema

```ts
// Key: 'termi-sessions'
interface PersistedSession {
  sessionId: string;   // NEW: stable UUID
  serverId: string;
  serverName: string;
}
interface PersistedState {
  sessions: PersistedSession[];
  activeServerId: string | null;
}
```

---

## Connection Limits

`MAX_CONNECTIONS_PER_USER = 10` applies to all sessions in `PersistentSessionStore` (attached + detached), since each holds a real SSH connection. If a new session would exceed the limit, the oldest detached session is evicted first before rejecting.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Gateway restarts | Sessions lost; browser gets `session-not-found`; creates new session automatically |
| Token expired on reconnect | Browser fetches fresh JWE before each reconnect attempt |
| Two tabs open same session | Second attach wins; first tab receives `replaced` and transitions to `detached` |
| SSH connection drops (server unreachable) | `handler` sends `disconnected` event; session removed from store; browser status → `error` |
| 6-hour idle (detached) | `PersistentSessionStore` interval closes session; next reconnect gets `session-not-found` |

---

## Files Changed

| File | Change |
|------|--------|
| `apps/gateway/src/sessions/PersistentSessionStore.ts` | New — session store with idle timeout |
| `apps/gateway/src/sessions/RingBuffer.ts` | New — circular output buffer |
| `apps/gateway/src/handlers/ssh.ts` | Refactor — replace WS reference with `AttachableSink` |
| `apps/gateway/src/index.ts` | Update — handle `sessionId` param, reconnect flow, WS-only disconnect |
| `apps/web/src/app/dashboard/sessions-context.tsx` | Update — localStorage, sessionId, detached status |
| `apps/web/src/app/dashboard/sessions-workspace.tsx` | Update — auto-reconnect on detached, detached UI badge |
| `apps/web/src/components/terminal/SSHTerminal.tsx` | Update — accept `sessionId` prop; handle `session-not-found`, `replaced`, `buffer-replay` messages |
