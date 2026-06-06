'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface LocalTerminalProps {
    tabId: string;
    /** Cloud mode: JWE token from /api/connection/token with protocol=local */
    connectionToken?: string;
    /** Cloud mode: gateway WebSocket base URL */
    gatewayUrl?: string;
    onReady?: () => void;
    onExit?: (code: number) => void;
}

const THEME = {
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
};

type SetStatus = (s: 'starting' | 'ready' | 'exited' | 'error') => void;

//   Electron IPC path                             ─

function setupElectronTerminal(
    tabId: string,
    terminal: Terminal,
    fit: FitAddon,
    setStatus: SetStatus,
    onReadyRef: MutableRefObject<(() => void) | undefined>,
    onExitRef: MutableRefObject<((code: number) => void) | undefined>,
): () => void {
    const api = window.electronAPI?.localTerminal;
    if (!api) {
        setStatus('error');
        return () => {};
    }

    const { cols, rows } = terminal;

    api.create(tabId, { cols, rows }).then((result) => {
        if (result.success) {
            setStatus('ready');
            onReadyRef.current?.();
        } else {
            setStatus('error');
            terminal.write(
                `\r\n\x1b[31mFailed to start shell: ${result.error ?? 'unknown error'}\x1b[0m\r\n`,
            );
        }
    });

    const unsubData = api.onData(tabId, (data: string) => terminal.write(data));
    const unsubExit = api.onExit(tabId, (code: number) => {
        setStatus('exited');
        terminal.write(`\r\n\x1b[33mShell exited (code ${code}).\x1b[0m\r\n`);
        onExitRef.current?.(code);
    });

    terminal.onData((data: string) => api.write(tabId, data));

    const handleResize = () => {
        fit.fit();
        api.resize(tabId, terminal.cols, terminal.rows);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        unsubData();
        unsubExit();
        api.kill(tabId);
    };
}

//   Cloud WebSocket path

function setupWebSocketTerminal(
    _tabId: string,
    terminal: Terminal,
    fit: FitAddon,
    connectionToken: string,
    gatewayUrl: string,
    setStatus: SetStatus,
    onReadyRef: MutableRefObject<(() => void) | undefined>,
    onExitRef: MutableRefObject<((code: number) => void) | undefined>,
): () => void {
    const wsUrl = `${gatewayUrl.replace(/\/$/, '')}/connect?protocol=local&serverId=local`;
    const ws = new WebSocket(wsUrl);
    let connected = false;

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: connectionToken }));
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data as string);
            switch (msg.type) {
                case 'connected':
                    connected = true;
                    setStatus('ready');
                    onReadyRef.current?.();
                    ws.send(
                        JSON.stringify({
                            type: 'resize',
                            cols: terminal.cols,
                            rows: terminal.rows,
                        }),
                    );
                    break;
                case 'data':
                    if (msg.data) {
                        terminal.write(
                            Uint8Array.from(atob(msg.data), (c: string) => c.charCodeAt(0)),
                        );
                    }
                    break;
                case 'disconnected':
                    setStatus('exited');
                    terminal.write(
                        `\r\n\x1b[33mShell exited (code ${msg.exitCode ?? 0}).\x1b[0m\r\n`,
                    );
                    onExitRef.current?.(msg.exitCode ?? 0);
                    break;
                case 'error':
                    setStatus('error');
                    terminal.write(`\r\n\x1b[31m${msg.message ?? 'Connection error'}\x1b[0m\r\n`);
                    break;
            }
        } catch {
            /* ignore parse errors */
        }
    };

    ws.onerror = () => {
        if (!connected) {
            setStatus('error');
            terminal.write('\r\n\x1b[31mFailed to connect to gateway.\x1b[0m\r\n');
        }
    };

    terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
            const bytes = new TextEncoder().encode(data);
            const encoded = btoa(String.fromCharCode(...bytes));
            ws.send(JSON.stringify({ type: 'data', data: encoded }));
        }
    });

    const handleResize = () => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'close-session' }));
            ws.close(1000);
        }
    };
}

//   Component                                 ─

export default function LocalTerminal({
    tabId,
    connectionToken,
    gatewayUrl,
    onReady,
    onExit,
}: LocalTerminalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'starting' | 'ready' | 'exited' | 'error'>('starting');

    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onExitRef = useRef(onExit);
    onExitRef.current = onExit;

    useEffect(() => {
        if (!containerRef.current) return;

        const isElectron = Boolean(window.electronAPI?.isElectron);
        const hasWsPath = Boolean(connectionToken && gatewayUrl);

        if (!isElectron && !hasWsPath) {
            setStatus('error');
            return;
        }

        const terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 14,
            lineHeight: 1.2,
            theme: THEME,
            allowProposedApi: true,
        });

        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.loadAddon(new WebLinksAddon());
        terminal.open(containerRef.current);
        fit.fit();

        const cleanup = isElectron
            ? setupElectronTerminal(tabId, terminal, fit, setStatus, onReadyRef, onExitRef)
            : setupWebSocketTerminal(
                  tabId,
                  terminal,
                  fit,
                  connectionToken!,
                  gatewayUrl!,
                  setStatus,
                  onReadyRef,
                  onExitRef,
              );

        return () => {
            cleanup();
            terminal.dispose();
        };
        // tabId, connectionToken and gatewayUrl are stable for the session lifetime
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabId]);

    return (
        <div className="relative h-full">
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <span
                    className={`w-2 h-2 rounded-full ${
                        status === 'ready'
                            ? 'bg-green-500'
                            : status === 'starting'
                              ? 'bg-yellow-500 animate-pulse'
                              : 'bg-red-500'
                    }`}
                />
                <span className="text-xs text-muted-foreground capitalize">{status}</span>
            </div>
            <div
                ref={containerRef}
                className="h-full terminal-container rounded-lg overflow-hidden"
            />
        </div>
    );
}
