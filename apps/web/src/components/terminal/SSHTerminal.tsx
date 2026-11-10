'use client';

import { useTerminalLook } from '@/lib/appearance/useTerminalLook';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { isDeviceUrl, openGatewaySocket } from '@/lib/gateway/connect';
import { useTerminalSearch } from './TerminalSearch';
import { useCommandSuggestions } from './CommandSuggestions';

import '@xterm/xterm/css/xterm.css';

const TEXT_ENCODER = new TextEncoder();

/**
 * Wait before reconnect attempt `attempt`. A dropped connection never gives up
 * on its own: the gateway keeps the shell for hours (GATEWAY_IDLE_TTL_HOURS),
 * and a laptop waking from sleep can take far longer than a few seconds to
 * get its network back. Only the gateway saying the session is gone starts a
 * new one.
 */
const getBackoffMs = (attempt: number) => Math.min(Math.pow(1.5, attempt) * 1000, 30_000);

interface SSHTerminalProps {
    /** Hands the parent a function that opens the find-in-output bar. */
    onSearchReady?: (open: () => void) => void;
    sessionId: string;
    serverId: string;
    connectionToken: string;
    renewToken?: () => Promise<string>;
    gatewayUrl?: string;
    disableNativeKeyboard?: boolean;
    onDisconnect?: () => void;
    onError?: (error: string) => void;
    onKeyHandlerReady?: (handler: (key: string) => void) => void;
    onWebSocketCreated?: (ws: WebSocket | null) => void;
    onSessionNotFound?: () => void;
    onReconnectReady?: (fn: () => void) => void;
    onRecordingChange?: (recording: boolean) => void;
    /** Everything the user types, after it was sent (for broadcast typing). */
    onInput?: (data: string) => void;
    /** Hands the parent a function that reads the recent output (Ask AI). */
    onScreenReaderReady?: (read: () => string) => void;
    /**
     * Connecting from this computer (desktop app) failed before the shell
     * opened, and the session may fall back: the parent switches it to the
     * Termi server. Absent when there is no fallback.
     */
    onDeviceUnreachable?: () => void;
}

export default function SSHTerminal({
    sessionId,
    serverId,
    connectionToken,
    renewToken,
    gatewayUrl,
    disableNativeKeyboard,
    onDisconnect,
    onError,
    onKeyHandlerReady,
    onWebSocketCreated,
    onSessionNotFound,
    onReconnectReady,
    onRecordingChange,
    onInput,
    onSearchReady,
    onScreenReaderReady,
    onDeviceUnreachable,
}: SSHTerminalProps) {
    const onDeviceUnreachableRef = useRef(onDeviceUnreachable);
    onDeviceUnreachableRef.current = onDeviceUnreachable;
    // Set once the shell has opened: after that, failures are ordinary drops.
    const shellOpenedRef = useRef(false);
    const search = useTerminalSearch();
    const attachSearchRef = useRef(search.attach);
    attachSearchRef.current = search.attach;
    const suggestions = useCommandSuggestions(serverId);
    const suggestionsRef = useRef(suggestions);
    suggestionsRef.current = suggestions;
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        onSearchReady?.(search.openSearch);
    }, [onSearchReady, search.openSearch]);
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstance = useRef<Terminal | null>(null);
    useEffect(() => {
        onScreenReaderReady?.(() => readRecentOutput(terminalInstance.current));
    }, [onScreenReaderReady]);
    const fitAddon = useRef<FitAddon | null>(null);
    // The user's terminal look (Settings → Appearance), applied live.
    const { look, lookRef } = useTerminalLook(terminalInstance, () => fitAddon.current?.fit());
    const wsRef = useRef<WebSocket | null>(null);
    const statusRef = useRef<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    // The server asking to use a forwarded key ("ask each time" agent forwarding).
    const [agentPrompts, setAgentPrompts] = useState<
        { id: string; comment: string; fingerprint: string }[]
    >([]);
    // Shared session: people asking to join, and people connected.
    const [joinRequests, setJoinRequests] = useState<{ id: string; email: string; mode: string }[]>(
        [],
    );
    // Signing in with a FIDO2 security key: waiting for the user's touch.
    const [skPending, setSkPending] = useState(false);
    const [guests, setGuests] = useState<{ id: string; email: string; mode: string }[]>([]);
    const sendControl = (msg: Record<string, unknown>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
    };
    const answerAgent = (id: string, allow: boolean, forSession = false) => {
        setAgentPrompts((list) => list.filter((p) => p.id !== id));
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'agent-response', id, allow, forSession }));
        }
    };
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(
        'connecting',
    );

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
    const onReconnectReadyRef = useRef(onReconnectReady);
    onReconnectReadyRef.current = onReconnectReady;
    const onRecordingChangeRef = useRef(onRecordingChange);
    onRecordingChangeRef.current = onRecordingChange;
    const onInputRef = useRef(onInput);
    onInputRef.current = onInput;

    const connectionTokenRef = useRef(connectionToken);
    connectionTokenRef.current = connectionToken;
    const renewTokenRef = useRef(renewToken);
    renewTokenRef.current = renewToken;
    const hasConnectedOnceRef = useRef(false);

    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Reconnecting, but paused until the browser is online again. */
    const waitingForNetworkRef = useRef(false);
    const intentionalCloseRef = useRef(false);
    const isRecordingRef = useRef(false);

    const updateStatus = useCallback((newStatus: typeof status) => {
        statusRef.current = newStatus;
        setStatus(newStatus);
    }, []);

    /** Uploads a completed asciicast recording. Never surfaced as a hard error —
     *  losing a recording shouldn't disrupt the session it was taken of. */
    const saveRecording = useCallback(
        (cast: unknown, durationSec: unknown, sizeBytes: unknown) => {
            if (typeof cast !== 'string' || cast.length === 0) return;
            fetch('/api/recordings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serverId,
                    content: cast,
                    durationSec: typeof durationSec === 'number' ? durationSec : 0,
                    sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : cast.length,
                }),
            }).catch((err) => console.error('[SSHTerminal] Failed to save recording:', err));
            terminalInstance.current?.write('\r\n\x1b[36m● Recording saved\x1b[0m\r\n');
        },
        [serverId],
    );

    const connect = useCallback(async () => {
        const gatewayBase =
            gatewayUrl || process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:22080/gateway';
        const wsUrl = `${gatewayBase}/connect?protocol=ssh&serverId=${encodeURIComponent(serverId)}&sessionId=${encodeURIComponent(sessionId)}`;

        const ws = openGatewaySocket(wsUrl);
        ws.binaryType = 'arraybuffer'; // terminal output arrives as raw binary frames
        const fromDevice = isDeviceUrl(gatewayBase);
        /** A device connection that never opened a shell: hand over to the gateway. */
        const fallBack = () => {
            if (!fromDevice || shellOpenedRef.current || !onDeviceUnreachableRef.current) {
                return false;
            }
            intentionalCloseRef.current = true;
            terminalInstance.current?.write(
                '\r\n\x1b[33mCould not connect from this computer. Connecting through Termi…\x1b[0m\r\n',
            );
            const handOver = onDeviceUnreachableRef.current;
            onDeviceUnreachableRef.current = undefined;
            handOver();
            return true;
        };
        wsRef.current = ws;
        onWebSocketCreatedRef.current?.(ws);

        ws.onopen = async () => {
            let token: string;
            try {
                if (!hasConnectedOnceRef.current) {
                    token = connectionTokenRef.current;
                } else {
                    token = renewTokenRef.current
                        ? await renewTokenRef.current()
                        : connectionTokenRef.current;
                }
            } catch (err) {
                console.error('[SSHTerminal] Failed to renew token:', err);
                // Signed out or no longer allowed: retrying won't help.
                intentionalCloseRef.current = true;
                ws.close(1008, 'Token renewal failed');
                onErrorRef.current?.('Failed to renew connection token. Please reconnect.');
                return;
            }
            hasConnectedOnceRef.current = true;
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'auth', token }));
            }
        };

        ws.onmessage = (event) => {
            if (wsRef.current !== ws) return;

            // Binary frame == raw terminal output (live data or buffer replay).
            // Write the bytes straight to xterm — no JSON/base64 decode.
            if (typeof event.data !== 'string') {
                terminalInstance.current?.write(new Uint8Array(event.data as ArrayBuffer));
                return;
            }

            try {
                const message = JSON.parse(event.data);

                switch (message.type) {
                    case 'connected':
                        updateStatus('connecting');
                        break;

                    case 'shell-ready':
                        shellOpenedRef.current = true;
                        retryCountRef.current = 0;
                        updateStatus('connected');
                        if (terminalInstance.current && fitAddon.current) {
                            fitAddon.current.fit();
                            const { cols, rows } = terminalInstance.current;
                            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
                        }
                        break;

                    case 'session-not-found':
                        // Gateway lost the session (restart/expiry) — trigger new session creation
                        intentionalCloseRef.current = true;
                        retryCountRef.current = 0; // reset for future manual reconnects
                        onSessionNotFoundRef.current?.();
                        break;

                    case 'ping':
                        // Gateway heartbeat — respond immediately
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'pong' }));
                        }
                        break;

                    case 'replaced':
                        // Another tab claimed this session; treat as a clean disconnect
                        intentionalCloseRef.current = true;
                        updateStatus('disconnected');
                        onDisconnectRef.current?.();
                        break;

                    case 'closed':
                    case 'disconnected':
                        intentionalCloseRef.current = true;
                        updateStatus('disconnected');
                        // The gateway explains closes it decides on (idle, too old).
                        terminalInstance.current?.write(
                            `\r\n\x1b[33m${
                                typeof message.message === 'string'
                                    ? message.message.replace(/[\x00-\x1f\x7f]/g, '')
                                    : 'Connection closed.'
                            }\x1b[0m\r\n`,
                        );
                        isRecordingRef.current = false;
                        onRecordingChangeRef.current?.(false);
                        saveRecording(message.cast, message.durationSec, message.sizeBytes);
                        onDisconnectRef.current?.();
                        break;

                    case 'error':
                        if (fallBack()) break;
                        // The gateway refused (login, host key, access): retrying
                        // would only repeat it. Reconnect stays available.
                        intentionalCloseRef.current = true;
                        updateStatus('error');
                        terminalInstance.current?.write(
                            `\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`,
                        );
                        isRecordingRef.current = false;
                        onRecordingChangeRef.current?.(false);
                        saveRecording(message.cast, message.durationSec, message.sizeBytes);
                        if (message.code === 'HOST_KEY_MISMATCH') {
                            terminalInstance.current?.write(
                                '\x1b[33mOpen this server\'s details page and use "Host key" to review the new key.\x1b[0m\r\n',
                            );
                        }
                        onErrorRef.current?.(message.message);
                        break;

                    case 'agent-request':
                        if (typeof message.id === 'string') {
                            setAgentPrompts((list) => [
                                ...list.filter((p) => p.id !== message.id),
                                {
                                    id: message.id,
                                    comment: String(message.comment ?? 'a key'),
                                    fingerprint: String(message.fingerprint ?? ''),
                                },
                            ]);
                        }
                        break;

                    case 'sk-sign':
                        if (typeof message.id === 'string') {
                            setSkPending(true);
                            void signWithSecurityKey(message).then((assertion) => {
                                setSkPending(false);
                                ws.send(
                                    JSON.stringify({
                                        type: 'sk-response',
                                        id: message.id,
                                        assertion,
                                    }),
                                );
                            });
                        }
                        break;

                    case 'join-request':
                        if (typeof message.id === 'string') {
                            setJoinRequests((list) => [
                                ...list.filter((r) => r.id !== message.id),
                                {
                                    id: message.id,
                                    email: String(message.email ?? 'someone'),
                                    mode: message.mode === 'control' ? 'control' : 'view',
                                },
                            ]);
                        }
                        break;

                    case 'join-request-closed':
                        setJoinRequests((list) => list.filter((r) => r.id !== message.id));
                        break;

                    case 'participants':
                        setGuests(Array.isArray(message.guests) ? message.guests : []);
                        break;

                    case 'agent-request-expired':
                        setAgentPrompts((list) => list.filter((p) => p.id !== message.id));
                        break;

                    case 'record-started':
                        isRecordingRef.current = true;
                        onRecordingChangeRef.current?.(true);
                        terminalInstance.current?.write(
                            '\r\n\x1b[36m● Recording started\x1b[0m\r\n',
                        );
                        break;

                    case 'record-stopped':
                        isRecordingRef.current = false;
                        onRecordingChangeRef.current?.(false);
                        saveRecording(message.cast, message.durationSec, message.sizeBytes);
                        break;
                }
            } catch (e) {
                console.error('[SSHTerminal] Failed to parse message:', e);
            }
        };

        ws.onclose = () => {
            if (wsRef.current !== ws) return;
            if (!intentionalCloseRef.current && fallBack()) return;
            if (intentionalCloseRef.current) {
                intentionalCloseRef.current = false;
                onWebSocketCreatedRef.current?.(null);
                wsRef.current = null;
                return; // don't retry intentional closes
            }
            onWebSocketCreatedRef.current?.(null);
            scheduleReconnectRef.current();
        };

        ws.onerror = () => {
            if (wsRef.current !== ws) return;
            updateStatus('connecting');
        };
    }, [serverId, sessionId, gatewayUrl, updateStatus, saveRecording]);

    /**
     * After a dropped connection: try again with backoff, forever. While the
     * browser is offline, wait for it to come back instead of burning attempts.
     */
    const scheduleReconnectRef = useRef<() => void>(() => {});
    scheduleReconnectRef.current = () => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const attempt = retryCountRef.current;
        retryCountRef.current += 1;
        updateStatus('connecting');
        if (attempt === 0) {
            terminalInstance.current?.writeln('\r\n\x1b[33mConnection lost. Reconnecting…\x1b[0m');
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            retryTimerRef.current = null;
            waitingForNetworkRef.current = true;
            return;
        }
        retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            connect().catch((err) => console.error('[SSHTerminal] reconnect error:', err));
        }, getBackoffMs(attempt));
    };

    const reconnect = useCallback(() => {
        intentionalCloseRef.current = false;
        retryCountRef.current = 0;
        waitingForNetworkRef.current = false;
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
        } else {
            connect().catch((err) => console.error('[SSHTerminal] manual reconnect error:', err));
        }
    }, [connect]);

    useEffect(() => {
        onReconnectReadyRef.current?.(reconnect);
    }, [reconnect]);

    // Back online, or back to this tab after sleep: retry now rather than
    // waiting out the backoff.
    useEffect(() => {
        const retryNow = () => {
            if (document.visibilityState === 'hidden') return;
            if (!retryTimerRef.current && !waitingForNetworkRef.current) return;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
            waitingForNetworkRef.current = false;
            retryCountRef.current = 1; // keep the "lost" notice from repeating
            connect().catch((err) => console.error('[SSHTerminal] reconnect error:', err));
        };
        window.addEventListener('online', retryNow);
        document.addEventListener('visibilitychange', retryNow);
        return () => {
            window.removeEventListener('online', retryNow);
            document.removeEventListener('visibilitychange', retryNow);
        };
    }, [connect]);

    // App lock: close the connection (the gateway keeps the session running)
    // and stay closed — reconnecting needs a fresh token, which a locked
    // session can't get. Unlocking reattaches.
    useEffect(() => {
        const onLock = () => {
            waitingForNetworkRef.current = false;
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
            if (wsRef.current) {
                intentionalCloseRef.current = true;
                wsRef.current.close();
                terminalInstance.current?.writeln('\r\n\x1b[33mTermi is locked.\x1b[0m');
            }
        };
        const onUnlock = () => reconnect();
        window.addEventListener('termi-lock', onLock);
        window.addEventListener('termi-unlock', onUnlock);
        return () => {
            window.removeEventListener('termi-lock', onLock);
            window.removeEventListener('termi-unlock', onUnlock);
        };
    }, [reconnect]);

    useEffect(() => {
        if (!terminalRef.current) return;

        const terminal = new Terminal({
            ...lookRef.current,
            allowProposedApi: true,
        });

        terminalInstance.current = terminal;

        const fit = new FitAddon();
        fitAddon.current = fit;
        terminal.loadAddon(fit);
        terminal.loadAddon(new WebLinksAddon());
        attachSearchRef.current(terminal, (e) => suggestionsRef.current.onKey(e));
        terminal.open(terminalRef.current);
        fit.fit();
        const detachSuggestions = rootRef.current
            ? suggestionsRef.current.attach(terminal, rootRef.current, (text) => {
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                      wsRef.current.send(TEXT_ENCODER.encode(text));
                      onInputRef.current?.(text);
                  }
              })
            : () => {};

        // Prevent native mobile keyboard from opening when terminal is tapped
        if (disableNativeKeyboard) {
            const ta = terminalRef.current.querySelector('textarea');
            if (ta) {
                ta.setAttribute('inputmode', 'none');
                ta.setAttribute('autocomplete', 'off');
                ta.setAttribute('autocorrect', 'off');
                ta.setAttribute('autocapitalize', 'off');
                (ta as HTMLTextAreaElement).spellcheck = false;
            }
        }

        terminal.onData((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                // Send keystrokes as a raw binary frame; the gateway treats any
                // binary frame as terminal input. Control stays JSON (resize/pong).
                wsRef.current.send(TEXT_ENCODER.encode(data));
                onInputRef.current?.(data);
            }
            suggestionsRef.current.onUserData(data);
        });

        onKeyHandlerReadyRef.current?.((key) => terminal.input(key));

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
        // Panes resize without the window doing so (split dividers, side panels).
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(terminalRef.current);

        terminal.write('Connecting to server...\r\n');
        retryCountRef.current = 0;
        connect().catch((err) => console.error('[SSHTerminal] initial connect error:', err));

        return () => {
            detachSuggestions();
            window.removeEventListener('resize', handleResize);
            resizeObserver.disconnect();
            if (resizeTimer) clearTimeout(resizeTimer);
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
            const ws = wsRef.current;
            wsRef.current = null;
            if (ws) onWebSocketCreatedRef.current?.(null);
            ws?.close();
            terminal.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 'disableNativeKeyboard' must not re-trigger terminal setup/teardown
    }, [connect]);

    return (
        <div ref={rootRef} className="relative h-full">
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <span
                    className={`w-2 h-2 rounded-full ${
                        status === 'connected'
                            ? 'bg-success'
                            : status === 'connecting'
                              ? 'bg-warning animate-pulse'
                              : 'bg-danger'
                    }`}
                />
                <span className="text-xs text-muted-foreground capitalize">{status}</span>
            </div>
            <div
                ref={terminalRef}
                className="h-full terminal-container rounded-lg overflow-hidden"
                style={{ background: look.theme.background }}
            />
            {search.bar}
            {suggestions.overlay}
            {skPending && (
                <div
                    role="status"
                    className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-lg border border-primary/40 bg-card/95 px-4 py-3 text-sm shadow-lg backdrop-blur"
                >
                    Touch your security key to sign in…
                </div>
            )}
            {guests.length > 0 && (
                <div
                    data-testid="session-guests"
                    className="absolute left-2 top-2 z-20 flex max-w-[60%] flex-wrap items-center gap-1 rounded-md border border-border bg-card/90 px-2 py-1 text-[11px] backdrop-blur"
                >
                    <span className="text-muted-foreground">In this session:</span>
                    {guests.map((g) => (
                        <span
                            key={g.id}
                            className="flex items-center gap-1 rounded bg-secondary px-1.5"
                        >
                            {g.email}
                            <span className="text-muted-foreground">
                                {g.mode === 'control' ? '(can type)' : '(watching)'}
                            </span>
                            <button
                                type="button"
                                aria-label={`Remove ${g.email}`}
                                onClick={() => sendControl({ type: 'kick', id: g.id })}
                                className="text-danger hover:underline"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}
            {joinRequests[0] && (
                <div
                    role="alertdialog"
                    aria-label="Join request"
                    className="absolute left-1/2 top-3 z-30 w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-primary/40 bg-card/95 p-3 shadow-lg backdrop-blur"
                >
                    <p className="text-sm font-medium">
                        {joinRequests[0].email} wants to{' '}
                        {joinRequests[0].mode === 'control' ? 'join and type in' : 'watch'} this
                        session
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        They&apos;ll see everything in this terminal
                        {joinRequests[0].mode === 'control' ? ' and can type commands' : ''}. You
                        can remove them at any time.
                    </p>
                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                sendControl({
                                    type: 'join-response',
                                    id: joinRequests[0].id,
                                    allow: true,
                                });
                                setJoinRequests((l) => l.slice(1));
                            }}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                        >
                            Let in
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                sendControl({
                                    type: 'join-response',
                                    id: joinRequests[0].id,
                                    allow: false,
                                });
                                setJoinRequests((l) => l.slice(1));
                            }}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                        >
                            Deny
                        </button>
                    </div>
                </div>
            )}
            {agentPrompts[0] && (
                <div
                    role="alertdialog"
                    aria-label="Allow key use"
                    className="absolute left-1/2 top-3 z-20 w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-warning/40 bg-card/95 p-3 shadow-lg backdrop-blur"
                >
                    <p className="text-sm font-medium">The server wants to use your key</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        <span className="text-foreground">{agentPrompts[0].comment}</span>{' '}
                        <span className="break-all font-mono">{agentPrompts[0].fingerprint}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        Only allow it if you just ran something that needs it (git, ssh to another
                        host).
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => answerAgent(agentPrompts[0].id, true)}
                            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                        >
                            Allow once
                        </button>
                        <button
                            type="button"
                            onClick={() => answerAgent(agentPrompts[0].id, true, true)}
                            className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium"
                        >
                            Allow for this session
                        </button>
                        <button
                            type="button"
                            onClick={() => answerAgent(agentPrompts[0].id, false)}
                            className="rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                        >
                            Deny
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

const fromB64url = (s: string) => {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const toB64url = (buf: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

/**
 * Sign the gateway's SSH challenge with a FIDO2 security key (WebAuthn). The
 * challenge *is* the SSH data, which is what lets OpenSSH verify it.
 */
async function signWithSecurityKey(req: {
    challenge?: unknown;
    credentialId?: unknown;
    rpId?: unknown;
}): Promise<{ authenticatorData: string; clientDataJSON: string; signature: string } | null> {
    if (typeof req.challenge !== 'string' || typeof req.credentialId !== 'string') return null;
    try {
        const cred = (await navigator.credentials.get({
            publicKey: {
                challenge: fromB64url(req.challenge),
                allowCredentials: [{ type: 'public-key', id: fromB64url(req.credentialId) }],
                rpId: typeof req.rpId === 'string' ? req.rpId : undefined,
                userVerification: 'discouraged',
                timeout: 60_000,
            },
        })) as PublicKeyCredential | null;
        const r = cred?.response as AuthenticatorAssertionResponse | undefined;
        if (!r) return null;
        return {
            authenticatorData: toB64url(r.authenticatorData),
            clientDataJSON: toB64url(r.clientDataJSON),
            signature: toB64url(r.signature),
        };
    } catch {
        return null;
    }
}

const SCREEN_LINES = 200;

/** The last lines of the terminal, as plain text (wrapped lines rejoined). */
function readRecentOutput(terminal: Terminal | null): string {
    if (!terminal) return '';
    const buffer = terminal.buffer.active;
    const lines: string[] = [];
    for (let i = Math.max(0, buffer.length - SCREEN_LINES * 2); i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (!line) continue;
        const text = line.translateToString(true);
        if (line.isWrapped && lines.length) lines[lines.length - 1] += text;
        else lines.push(text);
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.slice(-SCREEN_LINES).join('\n');
}
