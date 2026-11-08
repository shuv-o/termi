'use client';

import { useTerminalLook } from '@/lib/appearance/useTerminalLook';
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export type GuestStatus = 'connecting' | 'waiting' | 'joined' | 'ended';

/**
 * A guest's view of someone else's live session (see the gateway's
 * sessions/guests.ts). Output only, unless the owner allowed typing.
 */
export default function GuestTerminal({
    gatewayUrl,
    serverId,
    token,
    onStatus,
}: {
    gatewayUrl: string;
    serverId: string;
    token: string;
    onStatus: (status: GuestStatus, detail?: string) => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const { look, lookRef } = useTerminalLook(termRef, () => fitRef.current?.fit());
    const statusRef = useRef(onStatus);
    statusRef.current = onStatus;
    const [canType, setCanType] = useState(false);

    useEffect(() => {
        if (!box.current) return;
        const term = new Terminal({
            ...lookRef.current,
            cursorBlink: false,
            disableStdin: true,
        });
        termRef.current = term;
        const fit = new FitAddon();
        fitRef.current = fit;
        term.loadAddon(fit);
        term.open(box.current);
        fit.fit();
        const observer = new ResizeObserver(() => fit.fit());
        observer.observe(box.current);

        const ws = new WebSocket(
            `${gatewayUrl}/connect?protocol=ssh&serverId=${encodeURIComponent(serverId)}`,
        );
        ws.binaryType = 'arraybuffer';
        let mode: 'view' | 'control' = 'view';
        let ended = false;
        const end = (detail: string) => {
            if (ended) return;
            ended = true;
            statusRef.current('ended', detail);
        };
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
        ws.onmessage = (e) => {
            if (typeof e.data !== 'string') {
                term.write(new Uint8Array(e.data as ArrayBuffer));
                return;
            }
            const msg = JSON.parse(e.data);
            if (msg.type === 'waiting') statusRef.current('waiting');
            else if (msg.type === 'joined') {
                mode = msg.mode === 'control' ? 'control' : 'view';
                term.options.disableStdin = mode !== 'control';
                setCanType(mode === 'control');
                if (mode === 'control') term.focus();
                statusRef.current('joined');
            } else if (msg.type === 'session-ended' || msg.type === 'error') {
                end(String(msg.message ?? 'The session ended'));
            }
        };
        ws.onclose = () => end('Disconnected from the session');
        const input = term.onData((data) => {
            if (mode === 'control' && ws.readyState === WebSocket.OPEN) {
                ws.send(new TextEncoder().encode(data));
            }
        });
        return () => {
            input.dispose();
            observer.disconnect();
            ws.close();
            term.dispose();
        };
    }, [gatewayUrl, serverId, token, lookRef]);

    return (
        <div className="relative h-full">
            <div
                ref={box}
                data-testid="guest-terminal"
                className="h-full overflow-hidden rounded-lg"
                style={{ background: look.theme.background }}
            />
            {!canType && (
                <span className="pointer-events-none absolute right-2 top-2 rounded bg-secondary/80 px-2 py-0.5 text-[11px] text-muted-foreground">
                    Watching
                </span>
            )}
        </div>
    );
}
