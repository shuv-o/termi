/**
 * Termi WebSocket Gateway
 *
 * Handles WebSocket connections and proxies them to SSH.
 * SSH sessions outlive their WebSocket connections — they are keyed by a
 * stable sessionId UUID and stay alive until explicitly closed, idle (no
 * output or input) for GATEWAY_IDLE_TTL_HOURS, or older than
 * GATEWAY_MAX_SESSION_DAYS — see PersistentSessionStore.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { isIP } from 'net';
import dns from 'dns/promises';

import { SSHHandler, type SSHOutputSink } from './handlers/ssh.js';
import { SCPHandler } from './handlers/scp.js';
import { GuacamoleHandler } from './handlers/guacamole.js';
import { LocalHandler } from './handlers/local.js';
import { TelnetHandler } from './handlers/telnet.js';
import { TunnelHandler } from './handlers/tunnel.js';
import { TunnelMuxHandler } from './handlers/tunnel-mux.js';
import { validateToken, TokenPayload } from './auth/token.js';
import { RingBuffer } from './sessions/RingBuffer.js';
import { AsciicastRecorder } from './sessions/AsciicastRecorder.js';
import { TunnelSlotLimiter } from './sessions/TunnelSlotLimiter.js';
import {
    PersistentSessionStore,
    type PersistentSession,
} from './sessions/PersistentSessionStore.js';
import {
    announceGuests,
    answerJoin,
    fanOut,
    kickGuest,
    removeGuest,
    requestJoin,
} from './sessions/guests.js';
import { startAccessChecks, webAccessAsker, type LiveConnection } from './sessions/access-check.js';

dotenv.config({ path: '../../.env' });
dotenv.config();

const PORT = parseInt(process.env.GATEWAY_PORT || '22081', 10);
const HOST = process.env.GATEWAY_HOST || '0.0.0.0';

const ALLOWED_ORIGINS: Set<string> = new Set(
    (process.env.ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:22080')
        .split(',')
        .map((o) => o.trim().toLowerCase())
        .filter(Boolean),
);

// Idle timeout for non-persistent (RDP/VNC/SCP) connections
const CONNECTION_TIMEOUT = 300000; // 5 minutes

function ip4ToInt(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

// Private / reserved IPv4 CIDR ranges (kept in sync with apps/web ssrf.ts).
const BLOCKED_V4_RANGES: Array<[number, number]> = [
    [ip4ToInt('0.0.0.0'), ip4ToInt('0.255.255.255')], // 0.0.0.0/8
    [ip4ToInt('10.0.0.0'), ip4ToInt('10.255.255.255')], // 10.0.0.0/8
    [ip4ToInt('100.64.0.0'), ip4ToInt('100.127.255.255')], // 100.64.0.0/10 (CGNAT)
    [ip4ToInt('127.0.0.0'), ip4ToInt('127.255.255.255')], // 127.0.0.0/8 (loopback)
    [ip4ToInt('169.254.0.0'), ip4ToInt('169.254.255.255')], // 169.254.0.0/16 (link-local / metadata)
    [ip4ToInt('172.16.0.0'), ip4ToInt('172.31.255.255')], // 172.16.0.0/12
    [ip4ToInt('192.0.0.0'), ip4ToInt('192.0.0.255')], // 192.0.0.0/24
    [ip4ToInt('192.168.0.0'), ip4ToInt('192.168.255.255')], // 192.168.0.0/16
    [ip4ToInt('198.18.0.0'), ip4ToInt('198.19.255.255')], // 198.18.0.0/15 (benchmarking)
    [ip4ToInt('224.0.0.0'), ip4ToInt('255.255.255.255')], // multicast + reserved
];

function isPrivateHost(host: string): boolean {
    let h = host.trim().toLowerCase();
    // Strip IPv6 brackets: [::1] → ::1
    if (h.startsWith('[') && h.endsWith(']')) {
        h = h.slice(1, -1);
    }
    // Unwrap IPv4-mapped IPv6: ::ffff:192.168.1.1 → 192.168.1.1
    if (h.startsWith('::ffff:')) {
        h = h.slice(7);
    }
    if (h === 'localhost') return true;
    if (h === 'metadata.google.internal') return true;
    if (h === '::1' || h === '::') return true;
    if (h === '168.63.129.16') return true; // Azure Instance Metadata Service

    // IPv4: integer range check covers every private/reserved block.
    if (isIP(h) === 4) {
        const int = ip4ToInt(h);
        if (BLOCKED_V4_RANGES.some(([start, end]) => int >= start && int <= end)) return true;
    }

    if (h.startsWith('fe80:')) return true;
    if ((h.startsWith('fc') || h.startsWith('fd')) && h.includes(':')) return true;
    return false;
}

/**
 * Resolve the host the gateway will dial and return the address to connect
 * to, or null if any resolved address is private. Connecting to this exact
 * address — instead of the hostname, which ssh2/net/guacd would look up again —
 * closes the DNS-rebinding window between the check and the connect.
 */
/** Cloud metadata endpoints: refused even with ALLOW_PRIVATE_NETWORKS=true. */
function isMetadataAddress(address: string): boolean {
    let a = address.trim().toLowerCase().replace(/\.$/, '');
    if (a.startsWith('[') && a.endsWith(']')) a = a.slice(1, -1);
    if (a.startsWith('::ffff:')) a = a.slice(7);
    if (
        [
            'metadata',
            'metadata.google.internal',
            'metadata.goog',
            'instance-data',
            'instance-data.ec2.internal',
        ].includes(a)
    )
        return true;
    if (isIP(a) === 4)
        return a.startsWith('169.254.') || a === '168.63.129.16' || a === '100.100.100.200';
    if (isIP(a) === 6) return a.startsWith('fe80:') || a === 'fd00:ec2::254';
    return false;
}

/** Private networks allowed: still refuse metadata, by name or by what it resolves to. */
async function resolveAllowingPrivate(host: string): Promise<string | null> {
    if (isMetadataAddress(host)) return null;
    const stripped = host
        .trim()
        .toLowerCase()
        .replace(/^\[|]$/g, '');
    if (isIP(stripped) !== 0) return host;
    try {
        const addrs = await dns.lookup(stripped, { all: true });
        if (addrs.some((a) => isMetadataAddress(a.address))) return null;
        return addrs[0]?.address ?? host;
    } catch {
        return host; // labs without DNS: let the connect resolve it
    }
}

async function resolvePublicAddress(host: string): Promise<string | null> {
    if (isPrivateHost(host)) return null;
    const stripped = host
        .trim()
        .toLowerCase()
        .replace(/^\[|]$/g, '')
        .replace(/^::ffff:/i, '');
    if (isIP(stripped) !== 0) return host;
    try {
        const addrs = await dns.lookup(stripped, { all: true });
        if (addrs.length === 0 || addrs.some((a) => isPrivateHost(a.address))) return null;
        return addrs[0].address;
    } catch {
        return null; // unresolvable — block rather than let the connect resolve it
    }
}

/** Persistent SSH sessions (survive WS disconnect). */
const persistentSessions = new PersistentSessionStore();

/** Active non-SSH WebSocket connections (for cleanup on error/close). */
interface NonSshMeta {
    userId: string;
    /** Web sign-in behind the token (see sessions/access-check.ts). */
    sid: string | null;
    protocol: 'scp' | 'rdp' | 'vnc' | 'telnet' | 'local' | 'tunnel';
    serverId: string;
    handler?:
        | SCPHandler
        | GuacamoleHandler
        | LocalHandler
        | TelnetHandler
        | TunnelHandler
        | TunnelMuxHandler;
}
const nonSshConnections = new Map<WebSocket, NonSshMeta>();

/** Every live connection and what it relies on — see sessions/access-check.ts. */
function liveConnections(): LiveConnection[] {
    const out: LiveConnection[] = [];
    for (const s of persistentSessions.values()) {
        if (s.isClosing) continue;
        out.push({
            grant: { sid: s.sid, userId: s.userId, kind: 'server', serverId: s.serverId },
            close: (message) => persistentSessions.delete(s.sessionId, message),
        });
        for (const g of s.guests.values()) {
            out.push({
                grant: {
                    sid: g.sid,
                    userId: g.userId,
                    kind: 'guest',
                    serverId: s.serverId,
                    ...(g.shareId ? { shareId: g.shareId } : {}),
                },
                close: (message) => removeGuest(s, g.id, message),
            });
        }
    }
    for (const [ws, meta] of nonSshConnections) {
        out.push({
            grant: {
                sid: meta.sid,
                userId: meta.userId,
                kind: meta.protocol === 'local' ? 'local' : 'server',
                ...(meta.protocol === 'local' ? {} : { serverId: meta.serverId }),
            },
            close: (message) => {
                // A desktop's socket carries raw Guacamole frames by now, so it
                // only gets the close reason.
                if (
                    meta.protocol !== 'rdp' &&
                    meta.protocol !== 'vnc' &&
                    ws.readyState === WebSocket.OPEN
                ) {
                    ws.send(JSON.stringify({ type: 'error', message }));
                }
                ws.close(4003, message.slice(0, 120));
            },
        });
    }
    return out;
}

const ACCESS_CHECK_MS = (() => {
    const sec = parseInt(process.env.GATEWAY_ACCESS_CHECK_SEC || '', 10);
    return Number.isFinite(sec) && sec >= 0 ? sec * 1000 : 30_000;
})();
const WEB_INTERNAL_URL =
    process.env.WEB_INTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:22080';
const stopAccessChecks = startAccessChecks(
    liveConnections,
    webAccessAsker(WEB_INTERNAL_URL),
    ACCESS_CHECK_MS,
);

/** Per-user cap on concurrent tunnel connections — see TunnelSlotLimiter. */
const MAX_TUNNELS_PER_USER = 10;
const tunnelSlotLimiter = new TunnelSlotLimiter(MAX_TUNNELS_PER_USER);

/**
 * Creates the SSHOutputSink for a PersistentSession.
 * Data is always appended to the ring buffer.
 * When the session has an attached WS, data is also forwarded to it.
 */
function createSink(session: PersistentSession): SSHOutputSink {
    return {
        onData(data: Buffer) {
            if (session.isClosing) return;
            persistentSessions.touch(session);
            session.buffer.append(data);
            session.recording?.append(data);
            // Terminal output is sent as a raw binary frame — no base64/JSON
            // overhead on the hot path. Control messages stay JSON (see onMessage).
            if (session.attachedWs?.readyState === WebSocket.OPEN) {
                session.attachedWs.send(data, { binary: true });
            }
            fanOut(session, data);
        },
        onMessage(type: string, extra?: Record<string, unknown>) {
            if (session.isClosing) return;

            // A recording in progress when the session ends would otherwise be
            // silently lost — fold its content into the same close message so
            // the browser can still save what was captured.
            if (
                session.recording &&
                (type === 'disconnected' || type === 'closed' || type === 'error')
            ) {
                extra = { ...extra, ...session.recording.serialize() };
                session.recording = null;
            }

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

const server = createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                status: 'healthy',
                sshSessions: persistentSessions.size,
                nonSshConnections: nonSshConnections.size,
                uptime: process.uptime(),
            }),
        );
        return;
    }
    res.writeHead(404);
    res.end('Not Found');
});

const wss = new WebSocketServer({ server, path: '/connect', maxPayload: 1024 * 1024 });

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const origin = (req.headers['origin'] || '').toLowerCase();
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Origin not allowed' }));
        ws.close(4403, 'Forbidden');
        return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    // token is NO LONGER in the URL — it arrives in the first WS message
    const protocol = url.searchParams.get('protocol') as
        'ssh' | 'scp' | 'rdp' | 'vnc' | 'telnet' | 'local' | 'tunnel';
    const serverId = url.searchParams.get('serverId');
    const sessionId = url.searchParams.get('sessionId');
    // Bounded: guacd/FreeRDP allocate a framebuffer of this size.
    const clampDim = (v: string | null) => Math.min(Math.max(parseInt(v || '0', 10) || 0, 0), 8192);
    const browserWidth = clampDim(url.searchParams.get('width'));
    const browserHeight = clampDim(url.searchParams.get('height'));

    if (!protocol || !serverId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing required parameters' }));
        ws.close(4000, 'Bad Request');
        return;
    }

    if (!['ssh', 'scp', 'rdp', 'vnc', 'telnet', 'local', 'tunnel'].includes(protocol)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid protocol' }));
        ws.close(4000, 'Bad Request');
        return;
    }

    // Local terminal requires explicit opt-in via environment variable
    if (protocol === 'local' && process.env.ALLOW_LOCAL_TERMINAL !== 'true') {
        ws.send(
            JSON.stringify({
                type: 'error',
                message: 'Local terminal is not enabled on this server',
            }),
        );
        ws.close(4403, 'Forbidden');
        return;
    }

    //   Auth handshake: expect {type:"auth",token} within 5 seconds
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

        // Guard: abort if the socket was closed while we awaited validateToken
        if (ws.readyState !== WebSocket.OPEN) return;

        // Token payload cross-checks
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

        //   Jump hosts work for the SSH-based handlers and, through the relay,
        //   RDP/VNC can also use one, via the guacd relay (GUACD_TUNNEL_HOST).
        if (tokenPayload.jump && !['ssh', 'scp', 'tunnel', 'rdp', 'vnc'].includes(protocol)) {
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: 'Jump hosts are not supported for this protocol',
                }),
            );
            ws.close(1008, 'Invalid jump host');
            return;
        }

        //   SSRF guard (skipped for local protocol — no remote host involved).
        //   It applies to the host the gateway itself dials: the bastion when
        //   there is one. The target behind a bastion is dialed by the bastion
        //   (like `ssh -J`), so a private address there is expected.
        const dialedHost = tokenPayload.jump ? tokenPayload.jump.host : tokenPayload.host;
        // A guest joining a live session dials nothing (sessions/guests.ts).
        const isGuest = protocol === 'ssh' && !!tokenPayload.join;
        if (protocol !== 'local' && !isGuest) {
            const address =
                process.env.ALLOW_PRIVATE_NETWORKS === 'true'
                    ? await resolveAllowingPrivate(dialedHost)
                    : await resolvePublicAddress(dialedHost);
            if (!address) {
                ws.send(
                    JSON.stringify({
                        type: 'error',
                        message: 'Connection to private/internal hosts is not allowed',
                    }),
                );
                ws.close(1008, 'SSRF protection');
                return;
            }
            // Pin the dial to the address that was just checked.
            tokenPayload = tokenPayload.jump
                ? { ...tokenPayload, jump: { ...tokenPayload.jump, host: address } }
                : { ...tokenPayload, host: address };
        }

        //   Local terminal: PTY on this machine              ─
        if (protocol === 'local') {
            const meta: NonSshMeta = {
                userId: tokenPayload.userId,
                sid: tokenPayload.sid ?? null,
                protocol: 'local',
                serverId,
            };
            nonSshConnections.set(ws, meta);

            meta.handler = new LocalHandler(ws, tokenPayload.userId);

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    const handler = meta.handler as LocalHandler;
                    switch (message.type) {
                        case 'data':
                            if (message.data) {
                                handler.write(Buffer.from(message.data, 'base64'));
                            }
                            break;
                        case 'resize':
                            if (message.cols && message.rows) {
                                handler.resize(message.rows, message.cols);
                            }
                            break;
                        case 'close-session':
                            handler.close();
                            ws.close(1000, 'Session closed');
                            break;
                    }
                } catch (err) {
                    console.error('[gateway] Invalid local terminal message:', err);
                }
            });

            ws.on('close', () => {
                meta.handler?.close();
                nonSshConnections.delete(ws);
            });

            ws.on('error', (err) => {
                console.error('[gateway] Local terminal WebSocket error:', err);
                meta.handler?.close();
                nonSshConnections.delete(ws);
            });

            return; // local handled
        }

        //   SSH: persistent sessions

        if (protocol === 'ssh' && tokenPayload.join) {
            //   Guest joining someone else's live session (sessions/guests.ts)
            const join = tokenPayload.join;
            const target = persistentSessions.get(join.sessionId);
            if (
                !target ||
                target.isClosing ||
                target.userId !== join.ownerId ||
                target.serverId !== serverId
            ) {
                ws.send(
                    JSON.stringify({ type: 'error', message: 'This shared session has ended' }),
                );
                ws.close(1000, 'Session not found');
                return;
            }
            requestJoin(target, ws, {
                userId: tokenPayload.userId,
                email: join.email,
                mode: join.mode,
                sid: tokenPayload.sid ?? null,
                shareId: join.shareId ?? null,
            });
            return;
        }

        if (protocol === 'ssh') {
            // If client doesn't send a sessionId (e.g. stale cached JS), generate one.
            // The session will still work but won't be reattachable by this browser.
            const resolvedSessionId = sessionId || randomUUID();
            if (!sessionId) {
                console.warn(
                    `[gateway] SSH connection missing sessionId — generated fallback ${resolvedSessionId}`,
                );
            }

            const existing = persistentSessions.get(resolvedSessionId);

            if (existing) {
                //   Reattach to existing session
                // The token must be for this session's own server too: otherwise a
                // user whose share was revoked could keep reattaching to a live
                // session on it with a token minted for any other server.
                if (
                    existing.userId !== tokenPayload.userId ||
                    existing.serverId !== tokenPayload.serverId
                ) {
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
                // The access check now follows the sign-in that reattached it.
                existing.sid = tokenPayload.sid ?? null;
                // The owner's new tab learns who's watching.
                if (existing.guests.size) setTimeout(() => announceGuests(existing), 0);

                // Replay buffered output as a raw binary frame (non-destructive
                // snapshot). The client writes any binary frame straight to the
                // terminal, so replay and live output share one efficient path.
                const buffered = existing.buffer.snapshot();
                if (buffered.length > 0) {
                    ws.send(buffered, { binary: true });
                }

                // Signal ready (shell already open)
                ws.send(JSON.stringify({ type: 'shell-ready' }));
            } else {
                //   New session
                if (persistentSessions.isAtLimit(tokenPayload.userId)) {
                    const evicted = persistentSessions.evictOldestDetachedForUser(
                        tokenPayload.userId,
                    );
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
                    sid: tokenPayload.sid ?? null,
                    // Placeholder: the real handler is assigned on the next lines,
                    // once `sink` (which needs `session`) has been created.
                    handler: null as unknown as PersistentSession['handler'],
                    buffer: new RingBuffer(),
                    lastActivityAt: Date.now(),
                    createdAt: Date.now(),
                    attachedWs: ws,
                    isClosing: false,
                    recording: null,
                    guests: new Map(),
                    joinRequests: new Map(),
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

            //   Heartbeat: detect silently-dropped WS connections         ─
            const HEARTBEAT_INTERVAL_MS = 30_000;
            const HEARTBEAT_TIMEOUT_MS = 15_000;
            let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
            let pongTimer: ReturnType<typeof setTimeout> | null = null;

            function startHeartbeat() {
                heartbeatTimer = setInterval(() => {
                    if (ws.readyState !== WebSocket.OPEN) return;
                    ws.send(JSON.stringify({ type: 'ping' }));
                    pongTimer = setTimeout(() => {
                        console.warn(
                            `[gateway] SSH WS pong timeout for session ${resolvedSessionId} — closing`,
                        );
                        ws.close(1001, 'Heartbeat timeout');
                    }, HEARTBEAT_TIMEOUT_MS);
                }, HEARTBEAT_INTERVAL_MS);
            }

            function stopHeartbeat() {
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer);
                    heartbeatTimer = null;
                }
                if (pongTimer) {
                    clearTimeout(pongTimer);
                    pongTimer = null;
                }
            }

            startHeartbeat();

            ws.on('message', (data: Buffer, isBinary: boolean) => {
                const session = persistentSessions.get(resolvedSessionId);
                if (!session) return;

                // Binary frame == raw terminal input (keystrokes / pastes).
                if (isBinary) {
                    persistentSessions.touch(session);
                    session.handler.write(data);
                    return;
                }

                // Text frame == JSON control message.
                try {
                    const message = JSON.parse(data.toString());
                    switch (message.type) {
                        case 'data':
                            // Legacy base64 input path (pre-binary clients).
                            if (message.data) {
                                persistentSessions.touch(session);
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
                            if (pongTimer) {
                                clearTimeout(pongTimer);
                                pongTimer = null;
                            }
                            break;
                        case 'record-start':
                            if (!session.recording) {
                                session.recording = new AsciicastRecorder();
                                ws.send(JSON.stringify({ type: 'record-started' }));
                            }
                            break;
                        case 'record-stop': {
                            const recording = session.recording;
                            session.recording = null;
                            if (recording) {
                                ws.send(
                                    JSON.stringify({
                                        type: 'record-stopped',
                                        ...recording.serialize(),
                                    }),
                                );
                            }
                            break;
                        }
                        case 'join-response':
                            answerJoin(session, message.id, message.allow);
                            break;
                        case 'kick':
                            kickGuest(session, message.id);
                            break;
                        case 'sk-response':
                            session.handler.answerSecurityKey(message);
                            break;
                        case 'agent-response':
                            session.handler.answerAgentRequest(
                                message.id,
                                message.allow,
                                message.forSession,
                            );
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

            //   WS close: detach only (SSH stays alive)
            ws.on('close', () => {
                stopHeartbeat();
                const session = persistentSessions.get(resolvedSessionId);
                if (session && session.attachedWs === ws) {
                    // Detach only: the shell keeps running and is closed by
                    // the store once idle or too old.
                    session.attachedWs = null;
                }
            });

            ws.on('error', (err) => {
                stopHeartbeat();
                console.error('[gateway] SSH WebSocket error:', err);
            });

            return; // SSH handled
        }

        //   Non-SSH: SCP / RDP / VNC / Telnet                      ─

        const meta: NonSshMeta = {
            userId: tokenPayload.userId,
            sid: tokenPayload.sid ?? null,
            protocol: protocol as 'scp' | 'rdp' | 'vnc' | 'telnet' | 'tunnel',
            serverId,
        };
        nonSshConnections.set(ws, meta);

        // Idle timeout for non-persistent connections
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const resetTimeout = () => {
            if (timeoutId) clearTimeout(timeoutId);
            const idleLimit =
                protocol === 'rdp' || protocol === 'vnc'
                    ? CONNECTION_TIMEOUT * 2
                    : CONNECTION_TIMEOUT;
            timeoutId = setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Connection timed out due to inactivity',
                        }),
                    );
                    ws.close(4008, 'Idle timeout');
                }
            }, idleLimit);
        };
        resetTimeout();

        ws.on('message', () => resetTimeout());

        if (protocol === 'scp') {
            meta.handler = new SCPHandler(ws, tokenPayload);
        } else if (protocol === 'telnet') {
            //   Telnet: raw TCP with IAC negotiation, binary I/O like SSH

            const sink: SSHOutputSink = {
                onData(data: Buffer) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(data, { binary: true });
                    }
                },
                onMessage(type: string, extra?: Record<string, unknown>) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type, ...extra }));
                    }
                },
            };

            const telnetHandler = new TelnetHandler(tokenPayload, sink);
            meta.handler = telnetHandler;

            ws.on('message', (data: Buffer, isBinary: boolean) => {
                if (isBinary) {
                    resetTimeout();
                    telnetHandler.write(data);
                    return;
                }
                try {
                    const msg = JSON.parse(data.toString());
                    switch (msg.type) {
                        case 'resize':
                            if (msg.cols && msg.rows) telnetHandler.resize(msg.rows, msg.cols);
                            break;
                        case 'close-session':
                            telnetHandler.close();
                            ws.close(1000, 'Session closed');
                            break;
                    }
                } catch {
                    /* ignore malformed control messages */
                }
            });
        } else if (protocol === 'tunnel') {
            //   Tunnel: forwardOut to an internal address, raw binary I/O like SSH/Telnet

            if (!tunnelSlotLimiter.tryAcquire(tokenPayload.userId)) {
                // Registered into nonSshConnections above (shared non-SSH preamble) —
                // clean that up ourselves since we're returning before the shared
                // close/error listeners further down ever get attached.
                if (timeoutId) clearTimeout(timeoutId);
                nonSshConnections.delete(ws);
                ws.send(
                    JSON.stringify({ type: 'error', message: 'Too many concurrent tunnels open' }),
                );
                ws.close(4029, 'Too Many Requests');
                return;
            }

            const legacyTunnel = () => {
                const sink: SSHOutputSink = {
                    onData(data: Buffer) {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(data, { binary: true });
                        }
                    },
                    onMessage(type: string, extra?: Record<string, unknown>) {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type, ...extra }));
                        }
                    },
                };

                const tunnelHandler = new TunnelHandler(tokenPayload, sink);
                meta.handler = tunnelHandler;

                ws.on('message', (data: Buffer, isBinary: boolean) => {
                    if (isBinary) {
                        resetTimeout();
                        tunnelHandler.write(data);
                        return;
                    }
                    try {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === 'close-session') {
                            tunnelHandler.close();
                            ws.close(1000, 'Session closed');
                        }
                    } catch {
                        /* ignore malformed control messages */
                    }
                });
            };

            if (url.searchParams.get('mux') === '1') {
                // Multiplexed: one WS + one SSH connection for many streams,
                // and the only path for dynamic (SOCKS) and remote forwarding.
                const mux = new TunnelMuxHandler(tokenPayload, ws);
                meta.handler = mux;
                ws.on('message', (data: Buffer, isBinary: boolean) => {
                    resetTimeout();
                    mux.handleMessage(data, isBinary);
                });
            } else if (tokenPayload.forward && tokenPayload.forward.kind !== 'local') {
                // An older desktop app or bridge script: it can only do -L.
                if (timeoutId) clearTimeout(timeoutId);
                nonSshConnections.delete(ws);
                tunnelSlotLimiter.release(tokenPayload.userId);
                ws.send(
                    JSON.stringify({
                        type: 'error',
                        message: 'This tunnel needs a newer Termi app or bridge script',
                    }),
                );
                ws.close(4000, 'Bad Request');
                return;
            } else {
                legacyTunnel();
            }
        } else {
            // Override stored display dimensions with the browser's actual viewport
            const payloadWithDims =
                browserWidth > 0 && browserHeight > 0
                    ? { ...tokenPayload, displayWidth: browserWidth, displayHeight: browserHeight }
                    : tokenPayload;
            meta.handler = new GuacamoleHandler(ws, payloadWithDims, protocol as 'rdp' | 'vnc');
        }

        // ws emits 'close' after 'error', and both release — without this flag
        // one errored tunnel freed two slots, defeating the per-user cap.
        let tunnelSlotReleased = false;
        const releaseTunnelSlot = () => {
            if (meta.protocol !== 'tunnel' || tunnelSlotReleased) return;
            tunnelSlotReleased = true;
            tunnelSlotLimiter.release(meta.userId);
        };

        ws.on('close', () => {
            if (timeoutId) clearTimeout(timeoutId);
            meta.handler?.close();
            nonSshConnections.delete(ws);
            releaseTunnelSlot();
        });

        ws.on('error', (err) => {
            console.error('[gateway] Non-SSH WebSocket error:', err);
            if (timeoutId) clearTimeout(timeoutId);
            meta.handler?.close();
            nonSshConnections.delete(ws);
            releaseTunnelSlot();
        });
    };

    ws.once('message', onAuthMessage);
});

server.listen(PORT, HOST, () => {
    console.log(`[gateway] Listening on ${HOST}:${PORT}`);
});

// Listen errors (e.g. EADDRINUSE) happen before the server is useful — fail fast.
server.on('error', (err) => {
    console.error('[gateway] HTTP server error:', err);
    process.exit(1);
});

let isShuttingDown = false;
function shutdown(signal: string): void {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[gateway] Received ${signal} — shutting down gracefully`);
    stopAccessChecks();
    persistentSessions.destroy();
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.close(1001, 'Server shutting down');
        }
    });
    server.close(() => {
        console.log('[gateway] HTTP server closed');
        process.exit(signal === 'SIGTERM' || signal === 'SIGINT' ? 0 : 1);
    });
    setTimeout(() => {
        console.error('[gateway] Forced exit after 5s timeout');
        process.exit(1);
    }, 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A single stray rejection (e.g. a socket error that escaped a handler) must NOT
// take down the whole gateway and every user's session with it. A rejected
// promise does not corrupt global state, so log it and keep serving.
process.on('unhandledRejection', (reason) => {
    console.error('[gateway] Unhandled rejection (continuing):', reason);
});

// uncaughtException can leave the process in an undefined state, but for a
// long-running proxy serving many independent sessions, tearing everyone down
// for one stray sync error is worse than continuing. We log loudly and keep
// running; the per-connection error handlers already isolate most failures.
process.on('uncaughtException', (err) => {
    console.error('[gateway] Uncaught exception (continuing):', err);
});
