'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Laptop, Loader2, RotateCcw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LocalTerminal = dynamic(() => import('@/components/terminal/LocalTerminal'), { ssr: false });

type Env = 'electron' | 'cloud';
type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Dedicated, full-page local terminal — separate from the multi-tab sessions
 * workspace. In the Electron desktop app it talks to a node-pty shell over IPC;
 * in the browser it opens a shell on the gateway host over WebSocket.
 */
export default function LocalTerminalPage() {
    const [env, setEnv] = useState<Env | null>(null);
    const [tabId, setTabId] = useState(() => `local-page-${Date.now()}`);
    const [token, setToken] = useState<string | null>(null);
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>('connecting');
    const [error, setError] = useState<string | null>(null);

    // Detect the environment and, for the cloud path, fetch a gateway token.
    // Re-runs whenever tabId changes (i.e. on Restart).
    useEffect(() => {
        const isElectron = Boolean(window.electronAPI?.isElectron);
        if (isElectron) {
            setEnv('electron');
            setStatus('connecting');
            return;
        }

        setEnv('cloud');
        setStatus('connecting');
        setError(null);

        let cancelled = false;
        fetch('/api/connection/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ protocol: 'local' }),
        })
            .then((r) => r.json())
            .then((d) => {
                if (cancelled) return;
                if (d.success) {
                    setToken(d.data.token);
                    setGatewayUrl(d.data.gatewayUrl);
                } else {
                    setStatus('error');
                    setError(d.error || 'Local terminal is not available on this server.');
                }
            })
            .catch(() => {
                if (cancelled) return;
                setStatus('error');
                setError('Failed to reach the gateway.');
            });

        return () => { cancelled = true; };
    }, [tabId]);

    const restart = useCallback(() => {
        setToken(null);
        setGatewayUrl(null);
        setError(null);
        setStatus('connecting');
        setTabId(`local-page-${Date.now()}`);
    }, []);

    const title = env === 'electron' ? 'Local Terminal' : 'Gateway Shell';
    const subtitle = env === 'electron' ? 'Running on this device' : 'Shell on the gateway host';
    const ready = env === 'electron' || Boolean(token && gatewayUrl);

    return (
        <div className="flex flex-col h-[calc(100vh-7.5rem)] lg:h-screen -m-4 lg:-m-8 bg-background">
            {/* Header */}
            <div className="shrink-0 flex items-center gap-2.5 px-3 sm:px-4 py-2.5 border-b border-border bg-card/40">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 shrink-0">
                    <Laptop className="w-4 h-4 text-violet-400" />
                </span>
                <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold leading-tight truncate">{title}</span>
                    <span className="text-[11px] text-muted-foreground leading-tight truncate">{subtitle}</span>
                </div>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    <span
                        className={`w-2 h-2 rounded-full ${
                            status === 'connected'  ? 'bg-green-500'
                            : status === 'connecting' ? 'bg-yellow-500 animate-pulse'
                                                      : 'bg-red-500'
                        }`}
                    />
                    <span className="text-xs text-muted-foreground capitalize hidden sm:inline">{status}</span>
                </div>
                <div className="flex-1" />
                <Button
                    variant="ghost" size="sm" onClick={restart}
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    title="Restart terminal"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Restart</span>
                </Button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 p-2 sm:p-3">
                {env === null ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground gap-3">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Starting…</span>
                    </div>
                ) : status === 'error' ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                            <WifiOff className="w-6 h-6 text-destructive/70" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-destructive">Could not start the terminal</p>
                            {error && <p className="text-xs text-muted-foreground mt-1 max-w-sm px-4 break-words">{error}</p>}
                        </div>
                        <Button variant="secondary" size="sm" onClick={restart} className="gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" /> Try again
                        </Button>
                    </div>
                ) : ready ? (
                    <LocalTerminal
                        key={tabId}
                        tabId={tabId}
                        connectionToken={token ?? undefined}
                        gatewayUrl={gatewayUrl ?? undefined}
                        onReady={() => setStatus('connected')}
                        onExit={() => setStatus('disconnected')}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground gap-3">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Connecting…</span>
                    </div>
                )}
            </div>
        </div>
    );
}
