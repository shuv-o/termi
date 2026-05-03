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
import { randomUUID } from 'crypto';
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
            if (session.isClosing) return;
            session.lastActivityAt = Date.now();
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
            sshSessions: persistentSessions.size,
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
    const token         = url.searchParams.get('token');
    const protocol      = url.searchParams.get('protocol') as 'ssh' | 'scp' | 'rdp' | 'vnc';
    const serverId      = url.searchParams.get('serverId');
    const sessionId     = url.searchParams.get('sessionId');   // required for SSH

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
        // If client doesn't send a sessionId (e.g. stale cached JS), generate one.
        // The session will still work but won't be reattachable by this browser.
        const resolvedSessionId = sessionId || randomUUID();
        if (!sessionId) {
            console.warn(`[gateway] SSH connection missing sessionId — generated fallback ${resolvedSessionId}`);
        }

        const existing = persistentSessions.get(resolvedSessionId);

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

            // Replay buffered output (non-destructive snapshot)
            const buffered = existing.buffer.snapshot();
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
                sessionId: resolvedSessionId,
                userId: tokenPayload.userId,
                serverId,
                handler: null as any, // set below after sink is created
                buffer: new RingBuffer(),
                lastActivityAt: Date.now(),
                createdAt: Date.now(),
                attachedWs: ws,
                isClosing: false,
            };

            const sink = createSink(session);
            session.handler = new SSHHandler(tokenPayload, sink);
            
            // tryAdd is the atomic safety net — rejects if concurrent connect sneaked in
            if (!persistentSessions.tryAdd(session)) {
                session.isClosing = true;
                session.handler.close();
                ws.send(JSON.stringify({ type: 'error', message: 'Too many connections' }));
                ws.close(4029, 'Too Many Requests');
                return;
            }
        }

        // ── Heartbeat: detect silently-dropped WS connections ──────────────────────
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

        // ── WS message routing for SSH ──
        ws.on('message', (data) => {
            const session = persistentSessions.get(resolvedSessionId);
            if (!session) return;

            try {
                const message = JSON.parse(data.toString());
                switch (message.type) {
                    case 'data':
                        if (message.data) {
                            session.lastActivityAt = Date.now();
                            session.handler.write(Buffer.from(message.data, 'base64'));
                        }
                        break;
                    case 'resize':
                        if (message.cols && message.rows) {
                            session.handler.resize(message.rows, message.cols);
                        }
                        break;
                    case 'pong':
                        // Client acknowledged heartbeat — cancel the pong timeout
                        if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
                        break;
                    case 'close-session':
                        persistentSessions.delete(resolvedSessionId);
                        ws.close(1000, 'Session closed');
                        break;
                }
            } catch (err) {
                console.error('[gateway] Invalid SSH message:', err);
            }
        });

        // ── WS close: detach only (SSH stays alive) ──
        ws.on('close', () => {
            stopHeartbeat();
            const session = persistentSessions.get(resolvedSessionId);
            if (session && session.attachedWs === ws) {
                session.attachedWs = null;
            }
        });

        ws.on('error', (err) => {
            stopHeartbeat();
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
        meta.handler = new GuacamoleHandler(ws, tokenPayload, protocol as 'rdp' | 'vnc');
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
