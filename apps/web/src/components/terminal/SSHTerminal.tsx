'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

import '@xterm/xterm/css/xterm.css';

const MAX_AUTO_RETRIES = 5;
const getBackoffMs = (attempt: number) =>
    Math.min(Math.pow(1.5, attempt) * 1000, 30_000);

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

    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intentionalCloseRef = useRef(false);

    const updateStatus = useCallback((newStatus: typeof status) => {
        statusRef.current = newStatus;
        setStatus(newStatus);
    }, []);

    const connect = useCallback(() => {
        retryCountRef.current = 0;
        const gatewayBase = gatewayUrl || process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:22081';
        const wsUrl = `${gatewayBase}/connect?token=${encodeURIComponent(connectionToken)}&protocol=ssh&serverId=${encodeURIComponent(serverId)}&sessionId=${encodeURIComponent(sessionId)}`;

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
                        retryCountRef.current = 0;
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
            if (intentionalCloseRef.current) {
                intentionalCloseRef.current = false;
                return; // don't retry intentional closes
            }
            onWebSocketCreatedRef.current?.(null);
            if (retryCountRef.current < MAX_AUTO_RETRIES) {
                const attempt = retryCountRef.current;
                retryCountRef.current += 1;
                const delayMs = getBackoffMs(attempt);
                const delaySec = Math.round(delayMs / 1000);
                updateStatus('connecting');
                terminalInstance.current?.writeln(`\r\n\x1b[33mConnection lost. Reconnecting in ${delaySec}s (attempt ${attempt + 1}/${MAX_AUTO_RETRIES})…\x1b[0m`);
                retryTimerRef.current = setTimeout(() => {
                    connect();
                }, delayMs);
            } else {
                updateStatus('disconnected');
                terminalInstance.current?.writeln(`\r\n\x1b[31mCould not reconnect after ${MAX_AUTO_RETRIES} attempts.\x1b[0m`);
                onSessionNotFoundRef.current?.();
            }
        };

        ws.onerror = () => {
            if (wsRef.current !== ws) return;
            updateStatus('error');
            if (retryCountRef.current >= MAX_AUTO_RETRIES) {
                onErrorRef.current?.('WebSocket connection failed');
            }
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
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
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
