'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface LocalTerminalProps {
    tabId: string;
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

export default function LocalTerminal({ tabId, onReady, onExit }: LocalTerminalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'starting' | 'ready' | 'exited' | 'error'>('starting');

    // Keep callbacks in refs so the effect closure never goes stale
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onExitRef = useRef(onExit);
    onExitRef.current = onExit;

    useEffect(() => {
        if (!containerRef.current) return;

        const api = window.electronAPI?.localTerminal;
        if (!api) {
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

        const { cols, rows } = terminal;

        api.create(tabId, { cols, rows }).then(result => {
            if (result.success) {
                setStatus('ready');
                onReadyRef.current?.();
            } else {
                setStatus('error');
                terminal.write(`\r\n\x1b[31mFailed to start shell: ${result.error ?? 'unknown error'}\x1b[0m\r\n`);
            }
        });

        const unsubData = api.onData(tabId, data => terminal.write(data));

        const unsubExit = api.onExit(tabId, code => {
            setStatus('exited');
            terminal.write(`\r\n\x1b[33mShell exited (code ${code}).\x1b[0m\r\n`);
            onExitRef.current?.(code);
        });

        terminal.onData(data => api.write(tabId, data));

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
            terminal.dispose();
        };
    // tabId is stable for the lifetime of a session tab — intentionally no other deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabId]);

    return (
        <div className="relative h-full">
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <span
                    className={`w-2 h-2 rounded-full ${
                        status === 'ready'    ? 'bg-green-500' :
                        status === 'starting' ? 'bg-yellow-500 animate-pulse' :
                                               'bg-red-500'
                    }`}
                />
                <span className="text-xs text-dark-400 capitalize">{status}</span>
            </div>
            <div
                ref={containerRef}
                className="h-full terminal-container rounded-lg overflow-hidden"
            />
        </div>
    );
}
