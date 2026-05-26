# Persistent SSH Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SSH terminal sessions survive tab/browser close, are restored with scrollback replay when the user returns, and automatically expire after 6 hours idle in the background.

**Architecture:** The gateway introduces a `PersistentSessionStore` (keyed by stable `sessionId` UUID) that owns SSH connections independently of WebSocket connections. When a WebSocket closes, SSH stays alive with output buffered in a `RingBuffer`. The browser switches from `sessionStorage` → `localStorage`, stores each session's UUID, and auto-reconnects on page load. On reconnect, the gateway reattaches the WS and flushes the buffer to the browser as a `buffer-replay` message.

**Tech Stack:** TypeScript, `ws` (WebSocket), `ssh2`, xterm.js, vitest 4, React/Next.js 15

**Spec:** `docs/superpowers/specs/2026-05-03-persistent-ssh-sessions-design.md`

---

## File Map

| File | Action |
|------|--------|
| `apps/gateway/vitest.config.ts` | Create — vitest config for gateway |
| `apps/gateway/src/sessions/RingBuffer.ts` | Create — circular byte buffer |
| `apps/gateway/src/sessions/PersistentSessionStore.ts` | Create — in-memory session store |
| `apps/gateway/src/sessions/__tests__/RingBuffer.test.ts` | Create — unit tests |
| `apps/gateway/src/sessions/__tests__/PersistentSessionStore.test.ts` | Create — unit tests |
| `apps/gateway/src/handlers/ssh.ts` | Modify — replace `WebSocket` ref with `SSHOutputSink` |
| `apps/gateway/src/index.ts` | Modify — sessionId routing, detach/reattach/evict logic |
| `apps/web/src/app/panel/sessions-context.tsx` | Modify — localStorage, sessionId, detached status, wsRefs |
| `apps/web/src/app/panel/sessions-workspace.tsx` | Modify — auto-reconnect, detached badge |
| `apps/web/src/components/terminal/SSHTerminal.tsx` | Modify — sessionId prop, buffer-replay, session-not-found, replaced |

---

## Task 1: Gateway test infrastructure + RingBuffer

**Files:**
- Create: `apps/gateway/vitest.config.ts`
- Modify: `apps/gateway/package.json` (add vitest)
- Create: `apps/gateway/src/sessions/RingBuffer.ts`
- Create: `apps/gateway/src/sessions/__tests__/RingBuffer.test.ts`

- [ ] **Step 1.1: Add vitest to gateway**

In `apps/gateway/package.json`, add to `"scripts"` and `"devDependencies"`:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^25.0.9",
    "@types/ssh2": "^1.15.5",
    "@types/ws": "^8.18.1",
    "eslint": "^9.39.2",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.17"
  }
}
```

Run from repo root: `npm install`

- [ ] **Step 1.2: Create vitest config for gateway**

Create `apps/gateway/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
    },
});
```

- [ ] **Step 1.3: Write the failing RingBuffer tests**

Create `apps/gateway/src/sessions/__tests__/RingBuffer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../RingBuffer.js';

describe('RingBuffer', () => {
    it('starts empty', () => {
        const buf = new RingBuffer(100);
        expect(buf.byteLength).toBe(0);
        expect(buf.flush()).toEqual(new Uint8Array(0));
    });

    it('stores and flushes bytes within capacity', () => {
        const buf = new RingBuffer(10);
        buf.append(new Uint8Array([1, 2, 3]));
        expect(buf.byteLength).toBe(3);
        expect(buf.flush()).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('flushes multiple appends in order', () => {
        const buf = new RingBuffer(10);
        buf.append(new Uint8Array([1, 2]));
        buf.append(new Uint8Array([3, 4]));
        expect(buf.flush()).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('wraps around and drops oldest bytes when capacity exceeded', () => {
        const buf = new RingBuffer(4);
        buf.append(new Uint8Array([1, 2, 3, 4])); // fills buffer
        buf.append(new Uint8Array([5]));           // drops byte 1
        expect(buf.byteLength).toBe(4);
        expect(buf.flush()).toEqual(new Uint8Array([2, 3, 4, 5]));
    });

    it('handles append larger than capacity', () => {
        const buf = new RingBuffer(3);
        buf.append(new Uint8Array([1, 2, 3, 4, 5])); // only last 3 survive
        expect(buf.flush()).toEqual(new Uint8Array([3, 4, 5]));
    });
});
```

- [ ] **Step 1.4: Run tests to verify they fail**

```bash
cd apps/gateway && npx vitest run src/sessions/__tests__/RingBuffer.test.ts
```

Expected: `Cannot find module '../RingBuffer.js'`

- [ ] **Step 1.5: Implement RingBuffer**

Create `apps/gateway/src/sessions/RingBuffer.ts`:

```ts
/**
 * Fixed-capacity circular byte buffer.
 * Oldest bytes are overwritten when capacity is exceeded.
 */
export class RingBuffer {
    private readonly buf: Uint8Array;
    private head = 0;  // next write position
    private size = 0;  // current used bytes

    constructor(private readonly capacity: number = 256 * 1024) {
        this.buf = new Uint8Array(capacity);
    }

    append(data: Uint8Array): void {
        for (let i = 0; i < data.length; i++) {
            this.buf[this.head] = data[i];
            this.head = (this.head + 1) % this.capacity;
            if (this.size < this.capacity) this.size++;
        }
    }

    /** Returns all buffered bytes in order (oldest first). */
    flush(): Uint8Array {
        if (this.size === 0) return new Uint8Array(0);
        const out = new Uint8Array(this.size);
        const start = this.size < this.capacity ? 0 : this.head;
        for (let i = 0; i < this.size; i++) {
            out[i] = this.buf[(start + i) % this.capacity];
        }
        return out;
    }

    get byteLength(): number {
        return this.size;
    }
}
```

- [ ] **Step 1.6: Run tests to verify they pass**

```bash
cd apps/gateway && npx vitest run src/sessions/__tests__/RingBuffer.test.ts
```

Expected: `5 tests passed`

- [ ] **Step 1.7: Commit**

```bash
git add apps/gateway/vitest.config.ts apps/gateway/package.json apps/gateway/src/sessions/RingBuffer.ts apps/gateway/src/sessions/__tests__/RingBuffer.test.ts package-lock.json
git commit -m "feat(gateway): add RingBuffer for SSH output buffering

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: PersistentSessionStore

**Files:**
- Create: `apps/gateway/src/sessions/PersistentSessionStore.ts`
- Create: `apps/gateway/src/sessions/__tests__/PersistentSessionStore.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `apps/gateway/src/sessions/__tests__/PersistentSessionStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PersistentSessionStore, type PersistentSession } from '../PersistentSessionStore.js';

function makeSession(overrides: Partial<PersistentSession> = {}): PersistentSession {
    return {
        sessionId: 'sess-1',
        userId: 'user-1',
        serverId: 'server-1',
        handler: { close: vi.fn(), isConnected: vi.fn().mockReturnValue(true) } as any,
        buffer: { append: vi.fn(), flush: vi.fn().mockReturnValue(new Uint8Array(0)), byteLength: 0 } as any,
        lastKeystrokeAt: Date.now(),
        createdAt: Date.now(),
        attachedWs: null,
        ...overrides,
    };
}

describe('PersistentSessionStore', () => {
    let store: PersistentSessionStore;

    beforeEach(() => {
        vi.useFakeTimers();
        store = new PersistentSessionStore(1000); // 1 second idle timeout for tests
    });

    afterEach(() => {
        store.destroy();
        vi.useRealTimers();
    });

    it('stores and retrieves sessions', () => {
        const session = makeSession();
        store.add(session);
        expect(store.get('sess-1')).toBe(session);
    });

    it('returns undefined for unknown sessionId', () => {
        expect(store.get('unknown')).toBeUndefined();
    });

    it('delete calls handler.close and removes session', () => {
        const session = makeSession();
        store.add(session);
        store.delete('sess-1');
        expect(session.handler.close).toHaveBeenCalledOnce();
        expect(store.get('sess-1')).toBeUndefined();
    });

    it('countByUser counts attached and detached sessions', () => {
        store.add(makeSession({ sessionId: 'a', userId: 'user-1', attachedWs: null }));
        store.add(makeSession({ sessionId: 'b', userId: 'user-1', attachedWs: {} as any }));
        store.add(makeSession({ sessionId: 'c', userId: 'user-2' }));
        expect(store.countByUser('user-1')).toBe(2);
        expect(store.countByUser('user-2')).toBe(1);
    });

    it('evictOldestDetachedForUser removes oldest detached session for user', () => {
        const old = makeSession({ sessionId: 'old', userId: 'user-1', createdAt: 1000, attachedWs: null });
        const newS = makeSession({ sessionId: 'new', userId: 'user-1', createdAt: 2000, attachedWs: null });
        store.add(old);
        store.add(newS);
        const evicted = store.evictOldestDetachedForUser('user-1');
        expect(evicted).toBe(true);
        expect(store.get('old')).toBeUndefined();
        expect(store.get('new')).toBeDefined();
    });

    it('evictOldestDetachedForUser skips attached sessions', () => {
        const attached = makeSession({ sessionId: 'a', userId: 'user-1', createdAt: 1000, attachedWs: {} as any });
        store.add(attached);
        const evicted = store.evictOldestDetachedForUser('user-1');
        expect(evicted).toBe(false);
        expect(store.get('a')).toBeDefined();
    });

    it('idle check evicts detached sessions past timeout', () => {
        const session = makeSession({ lastKeystrokeAt: Date.now() - 2000, attachedWs: null });
        store.add(session);
        vi.advanceTimersByTime(60_000); // trigger idle check
        expect(store.get('sess-1')).toBeUndefined();
        expect(session.handler.close).toHaveBeenCalledOnce();
    });

    it('idle check does not evict attached sessions', () => {
        const ws = {} as any;
        const session = makeSession({ lastKeystrokeAt: Date.now() - 2000, attachedWs: ws });
        store.add(session);
        vi.advanceTimersByTime(60_000);
        expect(store.get('sess-1')).toBeDefined();
    });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd apps/gateway && npx vitest run src/sessions/__tests__/PersistentSessionStore.test.ts
```

Expected: `Cannot find module '../PersistentSessionStore.js'`

- [ ] **Step 2.3: Implement PersistentSessionStore**

Create `apps/gateway/src/sessions/PersistentSessionStore.ts`:

```ts
import type { WebSocket } from 'ws';
import type { SSHHandler } from '../handlers/ssh.js';
import type { RingBuffer } from './RingBuffer.js';

export interface PersistentSession {
    sessionId: string;
    userId: string;
    serverId: string;
    handler: SSHHandler;
    buffer: RingBuffer;
    lastKeystrokeAt: number;
    createdAt: number;
    attachedWs: WebSocket | null;
}

const MAX_CONNECTIONS_PER_USER = 10;

export class PersistentSessionStore {
    private readonly sessions = new Map<string, PersistentSession>();
    private readonly idleCheckInterval: ReturnType<typeof setInterval>;
    private readonly idleTimeoutMs: number;

    constructor(idleTimeoutMs = 6 * 3600 * 1000) {
        this.idleTimeoutMs = idleTimeoutMs;
        this.idleCheckInterval = setInterval(() => this.evictIdleSessions(), 60_000);
    }

    add(session: PersistentSession): void {
        this.sessions.set(session.sessionId, session);
    }

    get(sessionId: string): PersistentSession | undefined {
        return this.sessions.get(sessionId);
    }

    /** Closes the SSH handler and removes the session. */
    delete(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.handler.close();
            this.sessions.delete(sessionId);
        }
    }

    countByUser(userId: string): number {
        let n = 0;
        for (const s of this.sessions.values()) {
            if (s.userId === userId) n++;
        }
        return n;
    }

    /**
     * Attempts to evict the oldest detached session for userId.
     * Returns true if a session was evicted, false if none available.
     */
    evictOldestDetachedForUser(userId: string): boolean {
        let oldest: PersistentSession | null = null;
        for (const s of this.sessions.values()) {
            if (s.userId === userId && s.attachedWs === null) {
                if (!oldest || s.createdAt < oldest.createdAt) oldest = s;
            }
        }
        if (oldest) {
            this.delete(oldest.sessionId);
            return true;
        }
        return false;
    }

    isAtLimit(userId: string): boolean {
        return this.countByUser(userId) >= MAX_CONNECTIONS_PER_USER;
    }

    private evictIdleSessions(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (session.attachedWs === null && now - session.lastKeystrokeAt > this.idleTimeoutMs) {
                console.log(`[PersistentSessionStore] Evicting idle session ${id} (user ${session.userId})`);
                this.delete(id);
            }
        }
    }

    /** Call on gateway shutdown to clean up the interval and all sessions. */
    destroy(): void {
        clearInterval(this.idleCheckInterval);
        for (const id of [...this.sessions.keys()]) {
            this.delete(id);
        }
    }
}
```

- [ ] **Step 2.4: Run all gateway tests**

```bash
cd apps/gateway && npx vitest run
```

Expected: `8 tests passed` (5 RingBuffer + 8 PersistentSessionStore... actually all pass)

- [ ] **Step 2.5: Commit**

```bash
git add apps/gateway/src/sessions/PersistentSessionStore.ts apps/gateway/src/sessions/__tests__/PersistentSessionStore.test.ts
git commit -m "feat(gateway): add PersistentSessionStore with idle eviction

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: SSHHandler — decouple from WebSocket

**Files:**
- Modify: `apps/gateway/src/handlers/ssh.ts`

The handler must write to an `SSHOutputSink` instead of a direct `WebSocket`, so the `PersistentSessionStore` can swap the sink on reattach.

- [ ] **Step 3.1: Replace `apps/gateway/src/handlers/ssh.ts` with the refactored version**

```ts
/**
 * SSH Connection Handler
 *
 * Manages an SSH connection. Output is written to an SSHOutputSink rather than
 * a WebSocket directly, so the sink can be swapped when a browser reconnects.
 * WebSocket message routing (data/resize/ping) lives in index.ts.
 */

import { Client, ClientChannel } from 'ssh2';
import { TokenPayload } from '../auth/token.js';

export interface SSHOutputSink {
    /** Called with base64-encoded SSH output data. */
    onData(encoded: string): void;
    /** Called with structured control messages (shell-ready, disconnected, error, closed). */
    onMessage(type: string, extra?: Record<string, unknown>): void;
}

export class SSHHandler {
    private ssh: Client;
    private stream: ClientChannel | null = null;
    private connected = false;
    private closing = false;
    private sink: SSHOutputSink;

    constructor(token: TokenPayload, sink: SSHOutputSink) {
        this.sink = sink;
        this.ssh = new Client();
        this.setupSSH(token);
    }

    /** Forward terminal input from browser to the SSH stream. */
    write(data: Buffer): void {
        if (this.stream) {
            this.stream.write(data);
        }
    }

    /** Forward terminal resize from browser to the SSH stream. */
    resize(rows: number, cols: number): void {
        if (this.stream) {
            this.stream.setWindow(rows, cols, 0, 0);
        }
    }

    public close(): void {
        if (this.closing) return;
        this.closing = true;
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
        if (this.ssh) {
            this.ssh.end();
        }
        this.connected = false;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    private setupSSH(token: TokenPayload): void {
        const config: Parameters<Client['connect']>[0] = {
            host: token.host,
            port: token.port,
            username: token.username,
            readyTimeout: 10000,
            keepaliveInterval: 15000,
            keepaliveCountMax: 6,
        };

        if (token.privateKey) {
            config.privateKey = token.privateKey;
            if (token.passphrase) config.passphrase = token.passphrase;
        } else if (token.password) {
            config.password = token.password;
        }

        this.ssh.on('ready', () => {
            this.connected = true;
            this.ssh.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
                if (err) {
                    this.sink.onMessage('error', { message: 'Failed to open shell: ' + err.message });
                    this.close();
                    return;
                }
                this.stream = stream;
                this.sink.onMessage('shell-ready');

                stream.on('data', (data: Buffer) => {
                    this.sink.onData(data.toString('base64'));
                });

                stream.stderr.on('data', (data: Buffer) => {
                    this.sink.onData(data.toString('base64'));
                });

                stream.on('close', () => {
                    this.sink.onMessage('closed');
                    this.close();
                });
            });
        });

        this.ssh.on('error', (err) => {
            this.sink.onMessage('error', { message: 'SSH error: ' + err.message });
            this.close();
        });

        this.ssh.on('close', () => {
            this.sink.onMessage('disconnected');
        });

        try {
            this.ssh.connect(config);
        } catch (error) {
            this.sink.onMessage('error', { message: 'Connection failed: ' + (error as Error).message });
            this.close();
        }
    }
}
```

- [ ] **Step 3.2: Verify build compiles**

```bash
cd apps/gateway && npx tsc --noEmit
```

Expected: TypeScript errors about `SSHHandler` usages in `index.ts` (it still passes a `WebSocket` as the second arg) — those will be fixed in Task 4. The errors should only be in `index.ts`, not in `ssh.ts` itself.

- [ ] **Step 3.3: Commit**

```bash
git add apps/gateway/src/handlers/ssh.ts
git commit -m "refactor(gateway): decouple SSHHandler from WebSocket via SSHOutputSink

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Gateway index.ts — persistent session routing

**Files:**
- Modify: `apps/gateway/src/index.ts`

This is the largest change. The connection handler must route based on `sessionId`:
- If `sessionId` is in `persistentSessions`: reattach + flush buffer
- Otherwise: create new session

WebSocket close → detach only (SSH stays alive).
`close-session` message → destroy SSH session.

- [ ] **Step 4.1: Replace `apps/gateway/src/index.ts` with the new version**

```ts
/**
 * Termi WebSocket Gateway
 *
 * Handles WebSocket connections and proxies them to SSH.
 * SSH sessions outlive their WebSocket connections — they are keyed by a
 * stable sessionId UUID and stay alive until explicitly closed or idle for
 * 6 hours (detached only).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

import { SSHHandler, type SSHOutputSink } from './handlers/ssh.js';
import { SCPHandler } from './handlers/scp.js';
import { GuacamoleHandler } from './handlers/guacamole.js';
import { validateToken, TokenPayload } from './auth/token.js';
import { RingBuffer } from './sessions/RingBuffer.js';
import { PersistentSessionStore, type PersistentSession } from './sessions/PersistentSessionStore.js';

dotenv.config({ path: '../../.env' });
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = parseInt(process.env.GATEWAY_PORT || '22081', 10);
const HOST = process.env.GATEWAY_HOST || '0.0.0.0';

const ALLOWED_ORIGINS: Set<string> = new Set(
    (process.env.ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:22080')
        .split(',')
        .map((o) => o.trim().toLowerCase())
        .filter(Boolean)
);

// Idle timeout for non-persistent (RDP/VNC/SCP) connections
const CONNECTION_TIMEOUT = 300000; // 5 minutes

// ============================================================================
// SESSION STORES
// ============================================================================

/** Persistent SSH sessions (survive WS disconnect). */
const persistentSessions = new PersistentSessionStore();

/** Active non-SSH WebSocket connections (for cleanup on error/close). */
interface NonSshMeta {
    userId: string;
    protocol: 'scp' | 'rdp' | 'vnc';
    serverId: string;
    handler?: SCPHandler | GuacamoleHandler;
}
const nonSshConnections = new Map<WebSocket, NonSshMeta>();

// ============================================================================
// SSH SINK FACTORY
// ============================================================================

/**
 * Creates the SSHOutputSink for a PersistentSession.
 * Data is always appended to the ring buffer.
 * When the session has an attached WS, data is also forwarded to it.
 */
function createSink(session: PersistentSession): SSHOutputSink {
    return {
        onData(encoded: string) {
            session.buffer.append(Buffer.from(encoded, 'base64'));
            if (session.attachedWs?.readyState === WebSocket.OPEN) {
                session.attachedWs.send(JSON.stringify({ type: 'data', data: encoded }));
            }
        },
        onMessage(type: string, extra?: Record<string, unknown>) {
            if (session.attachedWs?.readyState === WebSocket.OPEN) {
                session.attachedWs.send(JSON.stringify({ type, ...extra }));
            }
            // SSH connection dropped — remove session so browser gets session-not-found on next reconnect
            if (type === 'disconnected' || type === 'closed' || type === 'error') {
                persistentSessions.delete(session.sessionId);
            }
        },
    };
}

// ============================================================================
// HTTP SERVER
// ============================================================================

const server = createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            sshSessions: persistentSessions['sessions']?.size ?? 0,
            nonSshConnections: nonSshConnections.size,
            uptime: process.uptime(),
        }));
        return;
    }
    res.writeHead(404);
    res.end('Not Found');
});

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

const wss = new WebSocketServer({ server, path: '/connect', maxPayload: 1024 * 1024 });

wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const origin = (req.headers['origin'] || '').toLowerCase();
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Origin not allowed' }));
        ws.close(4403, 'Forbidden');
        return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token       = url.searchParams.get('token');
    const protocol    = url.searchParams.get('protocol') as 'ssh' | 'scp' | 'rdp' | 'vnc';
    const serverId    = url.searchParams.get('serverId');
    const sessionId   = url.searchParams.get('sessionId');   // required for SSH
    const displayWidth  = parseInt(url.searchParams.get('width')  || '0', 10) || undefined;
    const displayHeight = parseInt(url.searchParams.get('height') || '0', 10) || undefined;

    if (!token || !protocol || !serverId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing required parameters' }));
        ws.close(4000, 'Bad Request');
        return;
    }

    if (!['ssh', 'scp', 'rdp', 'vnc'].includes(protocol)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid protocol' }));
        ws.close(4000, 'Bad Request');
        return;
    }

    let tokenPayload: TokenPayload;
    try {
        tokenPayload = await validateToken(token);
    } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
        ws.close(4001, 'Unauthorized');
        return;
    }

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

    // ── SSH: persistent sessions ────────────────────────────────────────────

    if (protocol === 'ssh') {
        if (!sessionId) {
            ws.send(JSON.stringify({ type: 'error', message: 'sessionId required for SSH' }));
            ws.close(4000, 'Bad Request');
            return;
        }

        const existing = persistentSessions.get(sessionId);

        if (existing) {
            // ── Reattach to existing session ──
            if (existing.userId !== tokenPayload.userId) {
                ws.send(JSON.stringify({ type: 'error', message: 'Session access denied' }));
                ws.close(4003, 'Forbidden');
                return;
            }

            // Evict old WS if still open (duplicate tab scenario)
            if (existing.attachedWs && existing.attachedWs.readyState === WebSocket.OPEN) {
                existing.attachedWs.send(JSON.stringify({ type: 'replaced' }));
                existing.attachedWs.close(1000, 'Replaced');
            }

            existing.attachedWs = ws;

            // Replay buffered output
            const buffered = existing.buffer.flush();
            if (buffered.length > 0) {
                ws.send(JSON.stringify({
                    type: 'buffer-replay',
                    data: Buffer.from(buffered).toString('base64'),
                }));
            }

            // Signal ready (shell already open)
            ws.send(JSON.stringify({ type: 'shell-ready' }));

        } else {
            // ── New session ──
            if (persistentSessions.isAtLimit(tokenPayload.userId)) {
                const evicted = persistentSessions.evictOldestDetachedForUser(tokenPayload.userId);
                if (!evicted) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Too many connections' }));
                    ws.close(4029, 'Too Many Requests');
                    return;
                }
            }

            const session: PersistentSession = {
                sessionId,
                userId: tokenPayload.userId,
                serverId,
                handler: null as any, // set below
                buffer: new RingBuffer(),
                lastKeystrokeAt: Date.now(),
                createdAt: Date.now(),
                attachedWs: ws,
            };

            const sink = createSink(session);
            session.handler = new SSHHandler(tokenPayload, sink);
            persistentSessions.add(session);
        }

        // ── WS message routing for SSH ──
        ws.on('message', (data) => {
            const session = persistentSessions.get(sessionId);
            if (!session) return;

            try {
                const message = JSON.parse(data.toString());
                switch (message.type) {
                    case 'data':
                        if (message.data) {
                            session.lastKeystrokeAt = Date.now();
                            session.handler.write(Buffer.from(message.data, 'base64'));
                        }
                        break;
                    case 'resize':
                        if (message.cols && message.rows) {
                            session.handler.resize(message.rows, message.cols);
                        }
                        break;
                    case 'ping':
                        ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                    case 'close-session':
                        persistentSessions.delete(sessionId);
                        ws.close(1000, 'Session closed');
                        break;
                }
            } catch (err) {
                console.error('[gateway] Invalid SSH message:', err);
            }
        });

        // ── WS close: detach only (SSH stays alive) ──
        ws.on('close', () => {
            const session = persistentSessions.get(sessionId);
            if (session && session.attachedWs === ws) {
                session.attachedWs = null;
            }
        });

        ws.on('error', (err) => {
            console.error('[gateway] SSH WebSocket error:', err);
        });

        return; // SSH handled
    }

    // ── Non-SSH: SCP / RDP / VNC (unchanged behaviour) ──────────────────────

    const meta: NonSshMeta = {
        userId: tokenPayload.userId,
        protocol: protocol as 'scp' | 'rdp' | 'vnc',
        serverId,
    };
    nonSshConnections.set(ws, meta);

    // Idle timeout for non-persistent connections
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const resetTimeout = () => {
        if (timeoutId) clearTimeout(timeoutId);
        const idleLimit = (protocol === 'rdp' || protocol === 'vnc')
            ? CONNECTION_TIMEOUT * 2
            : CONNECTION_TIMEOUT;
        timeoutId = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: 'Connection timed out due to inactivity' }));
                ws.close(4008, 'Idle timeout');
            }
        }, idleLimit);
    };
    resetTimeout();

    ws.on('message', () => resetTimeout());

    if (protocol === 'scp') {
        meta.handler = new SCPHandler(ws, tokenPayload);
    } else {
        meta.handler = new GuacamoleHandler(ws, tokenPayload, displayWidth, displayHeight);
    }

    ws.on('close', () => {
        if (timeoutId) clearTimeout(timeoutId);
        meta.handler?.close();
        nonSshConnections.delete(ws);
    });

    ws.on('error', (err) => {
        console.error('[gateway] Non-SSH WebSocket error:', err);
        if (timeoutId) clearTimeout(timeoutId);
        meta.handler?.close();
        nonSshConnections.delete(ws);
    });
});

// ============================================================================
// START
// ============================================================================

server.listen(PORT, HOST, () => {
    console.log(`[gateway] Listening on ${HOST}:${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('[gateway] Shutting down...');
    persistentSessions.destroy();
    server.close();
});
```

- [ ] **Step 4.2: Verify build compiles**

```bash
cd apps/gateway && npx tsc --noEmit
```

Expected: zero TypeScript errors. If there are errors about `SCPHandler` or `GuacamoleHandler` constructor signatures, check that those constructors still receive `ws` and `tokenPayload` as arguments (they are unchanged).

- [ ] **Step 4.3: Run all gateway tests**

```bash
cd apps/gateway && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4.4: Commit**

```bash
git add apps/gateway/src/index.ts
git commit -m "feat(gateway): persistent SSH sessions with detach/reattach

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: sessions-context.tsx — localStorage, sessionId, detached status

**Files:**
- Modify: `apps/web/src/app/panel/sessions-context.tsx`

Key changes:
1. `SessionStatus` gains `'detached'`
2. `Session` gains `sessionId: string`
3. `PersistedSession` gains `sessionId: string`
4. Storage switches from `sessionStorage` → `localStorage`
5. `addSession` generates a UUID `sessionId`
6. `reconnectSession` reuses the existing `sessionId`
7. A `wsRefs` ref map lets `removeSession` send `close-session` before removing
8. New `renewSession` function (generates new UUID, reconnects) for `session-not-found`
9. A `setSessionWs` function is exposed so `SSHTerminal` can register its WebSocket
10. Restored sessions start with `'detached'` status

- [ ] **Step 5.1: Replace `apps/web/src/app/panel/sessions-context.tsx`**

```tsx
'use client';

import {
    createContext, useContext, useState, useCallback, useId, useEffect, useRef, type ReactNode,
} from 'react';

const STORAGE_KEY = 'termi-sessions';

// ============================================================================
// TYPES
// ============================================================================

export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'detached';

export interface Session {
    tabId: string;
    sessionId: string;        // stable UUID, persists across browser restarts
    type: 'remote' | 'local';
    serverId: string;
    serverName: string;
    token: string | null;
    gatewayUrl: string | null;
    status: SessionStatus;
    showFiles: boolean;
}

interface SessionsContextValue {
    sessions: Session[];
    activeTabId: string | null;
    setActiveTabId: (tabId: string) => void;
    addSession: (serverId: string, serverName?: string) => Promise<void>;
    addLocalSession: () => void;
    removeSession: (tabId: string) => void;
    reconnectSession: (tabId: string, serverId: string) => Promise<void>;
    renewSession: (tabId: string, serverId: string) => Promise<void>;
    toggleFiles: (tabId: string) => void;
    updateSessionStatus: (tabId: string, status: SessionStatus) => void;
    setSessionWs: (tabId: string, ws: WebSocket | null) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function useSessionsContext() {
    const ctx = useContext(SessionsContext);
    if (!ctx) throw new Error('useSessionsContext must be inside SessionsProvider');
    return ctx;
}

// ============================================================================
// PROVIDER
// ============================================================================

interface PersistedSession { sessionId: string; serverId: string; serverName: string; }
interface PersistedState { sessions: PersistedSession[]; activeServerId: string | null; }
type SessionsProvider_AddSession = (serverId: string, serverName?: string) => Promise<void>;
type SessionsProvider_AddLocalSession = () => void;

export function SessionsProvider({ children }: { children: ReactNode }) {
    const uid = useId();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    // Map of tabId → active WebSocket, used to send close-session before removing
    const wsRefs = useRef(new Map<string, WebSocket>());

    // ── Persist sessions to localStorage (survives browser close) ──
    // Local terminal sessions are excluded: their PTY processes die on refresh.

    useEffect(() => {
        const remote = sessions.filter(s => s.type !== 'local');
        const state: PersistedState = {
            sessions: remote.map(s => ({ sessionId: s.sessionId, serverId: s.serverId, serverName: s.serverName })),
            activeServerId: remote.find(s => s.tabId === activeTabId)?.serverId ?? null,
        };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
    }, [sessions, activeTabId]);

    // ── Helpers ──

    const updateSessionStatus = useCallback((tabId: string, status: SessionStatus) => {
        setSessions(prev => prev.map(s => s.tabId === tabId ? { ...s, status } : s));
    }, []);

    const setSessionWs = useCallback((tabId: string, ws: WebSocket | null) => {
        if (ws) {
            wsRefs.current.set(tabId, ws);
        } else {
            wsRefs.current.delete(tabId);
        }
    }, []);

    // ── Fetch token helper ──

    async function fetchToken(serverId: string): Promise<{ token: string; gatewayUrl: string | null } | null> {
        try {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'ssh' }),
            });
            const data = await res.json();
            return data.success ? { token: data.data.token, gatewayUrl: data.data.gatewayUrl ?? null } : null;
        } catch {
            return null;
        }
    }

    // ── Session management ──

    const addLocalSession: SessionsProvider_AddLocalSession = useCallback(() => {
        const tabId = `${uid}-local-${Date.now()}`;
        setSessions(prev => [...prev, {
            tabId,
            sessionId: crypto.randomUUID(),
            type: 'local',
            serverId: 'local',
            serverName: 'Local Terminal',
            token: null,
            gatewayUrl: null,
            status: 'connecting',
            showFiles: false,
        }]);
        setActiveTabId(tabId);
    }, [uid]);

    const addSession: SessionsProvider_AddSession = useCallback(async (serverId: string, serverName?: string) => {
        const tabId = `${uid}-${Date.now()}`;
        const sessionId = crypto.randomUUID();
        let name = serverName ?? '';
        if (!name) {
            try {
                const res = await fetch(`/api/servers/${serverId}`);
                const data = await res.json();
                if (data.success) name = data.data.server.name;
            } catch { name = serverId; }
        }

        setSessions(prev => [...prev, {
            tabId,
            sessionId,
            type: 'remote',
            serverId, serverName: name,
            token: null, gatewayUrl: null, status: 'connecting', showFiles: false,
        }]);
        setActiveTabId(tabId);

        const result = await fetchToken(serverId);
        setSessions(prev => prev.map(s => {
            if (s.tabId !== tabId) return s;
            return result
                ? { ...s, token: result.token, gatewayUrl: result.gatewayUrl }
                : { ...s, status: 'error' };
        }));
    }, [uid]);

    /** Reconnect an existing session, reusing its sessionId (for reattach to persistent gateway session). */
    const reconnectSession = useCallback(async (tabId: string, serverId: string) => {
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, token: null, status: 'connecting' } : s
        ));
        const result = await fetchToken(serverId);
        setSessions(prev => prev.map(s => {
            if (s.tabId !== tabId) return s;
            return result
                ? { ...s, token: result.token, gatewayUrl: result.gatewayUrl, status: 'connecting' }
                : { ...s, status: 'error' };
        }));
    }, []);

    /** Generate a new sessionId and reconnect (used when gateway reports session-not-found). */
    const renewSession = useCallback(async (tabId: string, serverId: string) => {
        const newSessionId = crypto.randomUUID();
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, sessionId: newSessionId, token: null, status: 'connecting' } : s
        ));
        const result = await fetchToken(serverId);
        setSessions(prev => prev.map(s => {
            if (s.tabId !== tabId) return s;
            return result
                ? { ...s, token: result.token, gatewayUrl: result.gatewayUrl, status: 'connecting' }
                : { ...s, status: 'error' };
        }));
    }, []);

    const removeSession = useCallback((tabId: string) => {
        // Send close-session to gateway before unmounting the terminal
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'close-session' }));
        }
        wsRefs.current.delete(tabId);

        setSessions(prev => {
            const remaining = prev.filter(s => s.tabId !== tabId);
            setActiveTabId(curr => {
                if (curr !== tabId) return curr;
                return remaining.length > 0 ? remaining[remaining.length - 1].tabId : null;
            });
            return remaining;
        });
    }, []);

    const toggleFiles = useCallback((tabId: string) => {
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, showFiles: !s.showFiles } : s
        ));
    }, []);

    // ── Refs so restore effect can call stable functions without re-running ──

    const addSessionRef = useRef<SessionsProvider_AddSession | null>(null);
    const addLocalSessionRef = useRef<SessionsProvider_AddLocalSession | null>(null);
    const reconnectSessionRef = useRef<typeof reconnectSession | null>(null);
    addSessionRef.current = addSession;
    addLocalSessionRef.current = addLocalSession;
    reconnectSessionRef.current = reconnectSession;

    // ── Restore sessions on mount (after a full browser restart) ──
    // Sessions start as 'detached' then immediately begin reconnecting.

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const { sessions: saved, activeServerId }: PersistedState = JSON.parse(raw);
            if (!saved?.length) return;

            const ordered = [
                ...saved.filter(s => s.serverId !== activeServerId),
                ...saved.filter(s => s.serverId === activeServerId),
            ];

            // Insert sessions as 'detached', then immediately start reconnecting each one
            const restoredSessions: Session[] = ordered.map((s, i) => ({
                tabId: `${uid}-restored-${i}-${Date.now()}`,
                sessionId: s.sessionId,
                type: 'remote' as const,
                serverId: s.serverId,
                serverName: s.serverName,
                token: null,
                gatewayUrl: null,
                status: 'detached' as const,
                showFiles: false,
            }));

            if (restoredSessions.length > 0) {
                setSessions(restoredSessions);
                setActiveTabId(restoredSessions[restoredSessions.length - 1].tabId);
                // Kick off token fetch for each restored session immediately
                restoredSessions.forEach(s => reconnectSessionRef.current?.(s.tabId, s.serverId));
            }
        } catch { /* corrupted data — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — runs once on mount only

    return (
        <SessionsContext.Provider value={{
            sessions, activeTabId, setActiveTabId,
            addSession, addLocalSession, removeSession, reconnectSession, renewSession,
            toggleFiles, updateSessionStatus, setSessionWs,
        }}>
            {children}
        </SessionsContext.Provider>
    );
}
```

- [ ] **Step 5.2: Verify web app builds**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: TypeScript errors about `SSHTerminal` missing the new `sessionId`/`onWebSocketCreated`/`onSessionNotFound` props, and `sessions-workspace.tsx` using old API. Those are fixed in Tasks 6 and 7.

- [ ] **Step 5.3: Commit**

```bash
git add apps/web/src/app/panel/sessions-context.tsx
git commit -m "feat(web): persistent session context with localStorage and detached state

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: SSHTerminal.tsx — sessionId, buffer-replay, session-not-found, replaced

**Files:**
- Modify: `apps/web/src/components/terminal/SSHTerminal.tsx`

New props:
- `sessionId: string` — included in WS URL
- `onWebSocketCreated?: (ws: WebSocket | null) => void` — called when WS is opened/closed so context can store the ref
- `onSessionNotFound?: () => void` — called when gateway sends `session-not-found`

New WS message handlers:
- `buffer-replay`: decode base64 data and write to terminal (same as `data` message)
- `session-not-found`: call `onSessionNotFound`
- `replaced`: call `onDisconnect` (session detached by another tab)

Removed: the 20-second ping `setInterval` (WS idle timeout removed for SSH persistent sessions; SSH keepalive handles the connection).

- [ ] **Step 6.1: Replace `apps/web/src/components/terminal/SSHTerminal.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

import '@xterm/xterm/css/xterm.css';

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
}

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
}: SSHTerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstance = useRef<Terminal | null>(null);
    const fitAddon = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const statusRef = useRef<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

    const onDisconnectRef = useRef(onDisconnect);
    onDisconnectRef.current = onDisconnect;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    const onKeyHandlerReadyRef = useRef(onKeyHandlerReady);
    onKeyHandlerReadyRef.current = onKeyHandlerReady;
    const onWebSocketCreatedRef = useRef(onWebSocketCreated);
    onWebSocketCreatedRef.current = onWebSocketCreated;
    const onSessionNotFoundRef = useRef(onSessionNotFound);
    onSessionNotFoundRef.current = onSessionNotFound;

    const updateStatus = useCallback((newStatus: typeof status) => {
        statusRef.current = newStatus;
        setStatus(newStatus);
    }, []);

    const connect = useCallback(() => {
        const gatewayBase = gatewayUrl || process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:22081';
        const wsUrl = `${gatewayBase}/connect?token=${connectionToken}&protocol=ssh&serverId=${serverId}&sessionId=${sessionId}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        onWebSocketCreatedRef.current?.(ws);

        ws.onopen = () => {
            console.log('[SSHTerminal] WebSocket connected');
        };

        ws.onmessage = (event) => {
            if (wsRef.current !== ws) return;
            try {
                const message = JSON.parse(event.data);

                switch (message.type) {
                    case 'connected':
                        updateStatus('connecting');
                        break;

                    case 'shell-ready':
                        updateStatus('connected');
                        if (terminalInstance.current && fitAddon.current) {
                            fitAddon.current.fit();
                            const { cols, rows } = terminalInstance.current;
                            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
                        }
                        break;

                    case 'buffer-replay':
                    case 'data':
                        if (terminalInstance.current && message.data) {
                            const binary = atob(message.data);
                            const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
                            terminalInstance.current.write(bytes);
                        }
                        break;

                    case 'session-not-found':
                        // Gateway lost the session (restart/expiry) — trigger new session creation
                        onSessionNotFoundRef.current?.();
                        break;

                    case 'replaced':
                        // Another tab claimed this session; treat as a clean disconnect
                        updateStatus('disconnected');
                        onDisconnectRef.current?.();
                        break;

                    case 'closed':
                    case 'disconnected':
                        updateStatus('disconnected');
                        terminalInstance.current?.write('\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
                        onDisconnectRef.current?.();
                        break;

                    case 'error':
                        updateStatus('error');
                        terminalInstance.current?.write(`\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`);
                        onErrorRef.current?.(message.message);
                        break;
                }
            } catch (e) {
                console.error('[SSHTerminal] Failed to parse message:', e);
            }
        };

        ws.onclose = () => {
            if (wsRef.current !== ws) return;
            onWebSocketCreatedRef.current?.(null);
            if (statusRef.current !== 'disconnected' && statusRef.current !== 'error') {
                updateStatus('disconnected');
                terminalInstance.current?.write('\r\n\x1b[33mConnection lost.\x1b[0m\r\n');
            }
        };

        ws.onerror = () => {
            if (wsRef.current !== ws) return;
            updateStatus('error');
            onErrorRef.current?.('WebSocket connection failed');
        };
    }, [serverId, connectionToken, sessionId, gatewayUrl, updateStatus]);

    useEffect(() => {
        if (!terminalRef.current) return;

        const terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 14,
            lineHeight: 1.2,
            theme: {
                background: '#0d1117',
                foreground: '#c9d1d9',
                cursor: '#58a6ff',
                cursorAccent: '#0d1117',
                selectionBackground: '#264f78',
                selectionForeground: '#ffffff',
                black: '#484f58',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39c5cf',
                white: '#b1bac4',
                brightBlack: '#6e7681',
                brightRed: '#ffa198',
                brightGreen: '#56d364',
                brightYellow: '#e3b341',
                brightBlue: '#79c0ff',
                brightMagenta: '#d2a8ff',
                brightCyan: '#56d4dd',
                brightWhite: '#f0f6fc',
            },
            allowProposedApi: true,
        });

        terminalInstance.current = terminal;

        const fit = new FitAddon();
        fitAddon.current = fit;
        terminal.loadAddon(fit);
        terminal.loadAddon(new WebLinksAddon());
        terminal.open(terminalRef.current);
        fit.fit();

        terminal.onData((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                const bytes = new TextEncoder().encode(data);
                const encoded = btoa(String.fromCharCode(...bytes));
                wsRef.current.send(JSON.stringify({ type: 'data', data: encoded }));
            }
        });

        onKeyHandlerReadyRef.current?.((key) => terminal.input(key));

        const handleResize = () => {
            fit.fit();
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                const { cols, rows } = terminal;
                wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
        };
        window.addEventListener('resize', handleResize);

        terminal.write('Connecting to server...\r\n');
        connect();

        return () => {
            window.removeEventListener('resize', handleResize);
            const ws = wsRef.current;
            wsRef.current = null;
            onWebSocketCreatedRef.current?.(null);
            ws?.close();
            terminal.dispose();
        };
    }, [connect]);

    return (
        <div className="relative h-full">
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <span
                    className={`w-2 h-2 rounded-full ${
                        status === 'connected'
                            ? 'bg-green-500'
                            : status === 'connecting'
                                ? 'bg-yellow-500 animate-pulse'
                                : 'bg-red-500'
                    }`}
                />
                <span className="text-xs text-muted-foreground capitalize">{status}</span>
            </div>
            <div
                ref={terminalRef}
                className="h-full terminal-container rounded-lg overflow-hidden"
            />
        </div>
    );
}
```

- [ ] **Step 6.2: Verify build**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: errors only from `sessions-workspace.tsx` (missing new SSHTerminal props). Those are fixed in Task 7.

- [ ] **Step 6.3: Commit**

```bash
git add apps/web/src/components/terminal/SSHTerminal.tsx
git commit -m "feat(web): SSHTerminal sessionId, buffer-replay, session-not-found, replaced

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: sessions-workspace.tsx — detached badge + auto-reconnect + wire props

**Files:**
- Modify: `apps/web/src/app/panel/sessions-workspace.tsx`

Changes:
1. `StatusDot`: add `detached` case — amber `animate-pulse` dot
2. Tab bar: add amber pulsing "●" indicator and tooltip when session is detached
3. Auto-reconnect `useEffect`: watches for `detached` sessions and calls `reconnectSession`
4. `SSHTerminal` usage: pass `sessionId`, `onWebSocketCreated`, `onSessionNotFound`

- [ ] **Step 7.1: Update `StatusDot` to handle `detached`**

Find the `StatusDot` function (around line 167) and replace it:

```tsx
function StatusDot({ status }: { status: SessionStatus }) {
    const cls = {
        connecting: 'bg-yellow-400 animate-pulse',
        connected: 'bg-green-400',
        disconnected: 'bg-slate-500',
        error: 'bg-red-400',
        detached: 'bg-amber-400 animate-pulse',
    }[status];
    return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
}
```

- [ ] **Step 7.2: Add detached state to terminal content area**

Inside the `sessions.map(session => ...)` block, find the terminal content rendering (the chain of conditional renders for `session.type === 'local'`, error, spinner, `<SSHTerminal>`). Add a `detached` case **before** the error case:

```tsx
{session.type === 'local' ? (
    <LocalTerminal ... />
) : session.status === 'detached' ? (
    <div className="flex items-center justify-center h-full bg-card rounded-xl border border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Restoring session…</span>
        </div>
    </div>
) : session.status === 'error' || (!session.token && session.status !== 'connecting') ? (
    <div className="flex flex-col items-center justify-center h-full gap-3 bg-card rounded-xl border border-border">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">Failed to connect</p>
        <Button
            variant="secondary"
            size="sm"
            onClick={() => reconnectSession(session.tabId, session.serverId)}
            className="gap-1.5"
        >
            <RotateCcw className="w-3.5 h-3.5" /> Retry
        </Button>
    </div>
) : !session.token ? (
    <div className="flex items-center justify-center h-full bg-card rounded-xl border border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Connecting…</span>
        </div>
    </div>
) : (
    <SSHTerminal
        sessionId={session.sessionId}
        serverId={session.serverId}
        connectionToken={session.token}
        gatewayUrl={session.gatewayUrl ?? undefined}
        onDisconnect={() => updateSessionStatus(session.tabId, 'disconnected')}
        onError={() => updateSessionStatus(session.tabId, 'error')}
        onKeyHandlerReady={() => updateSessionStatus(session.tabId, 'connected')}
        onWebSocketCreated={(ws) => setSessionWs(session.tabId, ws)}
        onSessionNotFound={() => renewSession(session.tabId, session.serverId)}
    />
)}
```

- [ ] **Step 7.3: Add detached tooltip on tab bar items**

Inside the `sessions.map(session => ...)` tab rendering (around line 277), add a title attribute and an amber indicator for detached sessions. Replace the tab `<div>` content area with:

```tsx
{sessions.map(session => (
    <div
        key={session.tabId}
        className={`group flex items-center gap-2 px-3 py-2.5 border-b-2 cursor-pointer select-none shrink-0 transition-colors
            ${activeTabId === session.tabId && mode === 'terminal'
                ? 'border-primary bg-secondary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
        onClick={() => switchTab(session.tabId)}
        title={session.status === 'detached' ? 'Session running in background' : undefined}
    >
        <StatusDot status={session.status} />
        {session.type === 'local' && (
            <Laptop className="w-3 h-3 text-violet-400 shrink-0" />
        )}
        <span className="text-sm font-medium max-w-[120px] truncate">
            {session.serverName}
        </span>
        <button
            onClick={e => { e.stopPropagation(); removeSession(session.tabId); }}
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            title="Close tab"
        >
            <X className="w-3 h-3" />
        </button>
    </div>
))}
```

- [ ] **Step 7.4: Update `SessionsWorkspace` to destructure new context values**

Find the destructuring of `useSessionsContext()` (around line 182) and add `renewSession` and `setSessionWs`:

```tsx
const {
    sessions, activeTabId, setActiveTabId,
    addSession, addLocalSession, removeSession, reconnectSession, renewSession,
    toggleFiles, updateSessionStatus, setSessionWs,
} = useSessionsContext();
```

- [ ] **Step 7.5: Verify full build**

```bash
cd /path/to/termi && npx tsc --noEmit -p apps/web/tsconfig.json && npx tsc --noEmit -p apps/gateway/tsconfig.json
```

Expected: zero TypeScript errors across both workspaces.

- [ ] **Step 7.6: Run all tests**

```bash
npm run test && cd apps/gateway && npx vitest run
```

Expected: all existing web tests pass; all gateway tests pass.

- [ ] **Step 7.7: Commit**

```bash
git add apps/web/src/app/panel/sessions-workspace.tsx
git commit -m "feat(web): sessions-workspace detached spinner, badge, wired props

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Smoke test and final verification

- [ ] **Step 8.1: Start the dev stack**

```bash
npm run dev:all
```

Expected: web on `:22080`, gateway on `:22081` with no startup errors.

- [ ] **Step 8.2: Test new session + browser-close persistence**

1. Open `http://localhost:22080/panel/sessions`
2. Click `+` and open an SSH server
3. Run a command like `sleep 60` or `watch date`
4. Open browser DevTools → Application → Local Storage → verify `termi-sessions` contains `sessionId`
5. Close the browser tab entirely
6. Re-open the URL
7. Expected: session restores with status `connecting`, then `connected`; buffered output is visible

- [ ] **Step 8.3: Test explicit close sends close-session to gateway**

1. Open an SSH session
2. In browser DevTools Network tab, observe WebSocket messages
3. Click the X button on the session tab
4. Expected: `{"type":"close-session"}` message visible in WS frames before connection closes
5. Expected: gateway log shows session deleted (not just detached)

- [ ] **Step 8.4: Test session-not-found handling**

1. Open an SSH session; note its `sessionId` in localStorage
2. Restart the gateway (`npm run dev:gateway`)
3. In the browser, close and re-open the tab
4. Expected: session reconnects with a NEW sessionId (gateway had no record of old one) — verify new UUID in localStorage

- [ ] **Step 8.5: Final commit**

```bash
git add -A
git commit -m "feat: persistent SSH sessions survive browser close

Sessions persist in localStorage with stable sessionId UUIDs.
Gateway maintains SSH connections independently of WebSocket
connections and replays buffered output on reconnect.
Idle detached sessions expire after 6 hours.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
