'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Laptop, Loader2, RotateCcw, WifiOff, Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LocalTerminal = dynamic(() => import('@/components/terminal/LocalTerminal'), { ssr: false });

type Env = 'electron' | 'cloud';
type Status = 'connecting' | 'connected' | 'disconnected' | 'error';

/** One local shell tab. `id` doubles as the node-pty / gateway session id. */
interface LocalTab {
    id: string;
    token: string | null;
    gatewayUrl: string | null;
    status: Status;
    error: string | null;
}

let tabCounter = 0;
function makeTabId() {
    tabCounter += 1;
    return `local-${Date.now()}-${tabCounter}`;
}

function freshTab(): LocalTab {
    return { id: makeTabId(), token: null, gatewayUrl: null, status: 'connecting', error: null };
}

/**
 * Dedicated, full-page local terminal — separate from the multi-tab sessions
 * workspace. Supports multiple shell tabs. In the Electron desktop app each tab
 * is a node-pty shell over IPC; in the browser each is a shell on the gateway
 * host over WebSocket.
 */
export default function LocalTerminalPage() {
    const [env, setEnv] = useState<Env | null>(null);
    const envRef = useRef<Env | null>(null);
    const [tabs, setTabs] = useState<LocalTab[]>([]);
    const [activeId, setActiveId] = useState<string>('');

    // ── Helpers ──

    const fetchLocalToken = useCallback(async (): Promise<{ token: string; gatewayUrl: string | null } | null> => {
        try {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ protocol: 'local' }),
            });
            const data = await res.json();
            if (!data.success) return null;
            return { token: data.data.token, gatewayUrl: data.data.gatewayUrl ?? null };
        } catch {
            return null;
        }
    }, []);

    const loadCloudToken = useCallback((id: string) => {
        fetchLocalToken().then((result) => {
            setTabs(prev => prev.map(t => {
                if (t.id !== id) return t;
                return result
                    ? { ...t, token: result.token, gatewayUrl: result.gatewayUrl }
                    : { ...t, status: 'error', error: 'Local terminal is not available on this server.' };
            }));
        });
    }, [fetchLocalToken]);

    const setTabStatus = useCallback((id: string, status: Status) => {
        setTabs(prev => prev.map(t => (t.id === id ? { ...t, status } : t)));
    }, []);

    const activateTab = useCallback((id: string) => {
        setActiveId(id);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    }, []);

    const addTab = useCallback(() => {
        const tab = freshTab();
        setTabs(prev => [...prev, tab]);
        setActiveId(tab.id);
        if (envRef.current === 'cloud') loadCloudToken(tab.id);
    }, [loadCloudToken]);

    const closeTab = useCallback((id: string) => {
        setTabs(prev => {
            const remaining = prev.filter(t => t.id !== id);
            setActiveId(curr => {
                if (curr !== id) return curr;
                return remaining.length > 0 ? remaining[remaining.length - 1].id : '';
            });
            return remaining;
        });
    }, []);

    const restartTab = useCallback((id: string) => {
        const replacement = freshTab();
        setTabs(prev => prev.map(t => (t.id === id ? replacement : t)));
        setActiveId(curr => (curr === id ? replacement.id : curr));
        if (envRef.current === 'cloud') loadCloudToken(replacement.id);
    }, [loadCloudToken]);

    // ── Detect environment and open the first tab ──
    useEffect(() => {
        const isElectron = Boolean(window.electronAPI?.isElectron);
        const e: Env = isElectron ? 'electron' : 'cloud';
        setEnv(e);
        envRef.current = e;

        const tab = freshTab();
        setTabs([tab]);
        setActiveId(tab.id);
        if (e === 'cloud') loadCloudToken(tab.id);
    }, [loadCloudToken]);

    const title = env === 'electron' ? 'Local Terminal' : 'Gateway Shell';
    const subtitle = env === 'electron' ? 'Running on this device' : 'Shell on the gateway host';
    const activeTab = tabs.find(t => t.id === activeId) ?? null;
    const activeStatus: Status = activeTab?.status ?? 'connecting';

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
                            activeStatus === 'connected'  ? 'bg-green-500'
                            : activeStatus === 'connecting' ? 'bg-yellow-500 animate-pulse'
                                                            : 'bg-red-500'
                        }`}
                    />
                    <span className="text-xs text-muted-foreground capitalize hidden sm:inline">{activeStatus}</span>
                </div>
                <div className="flex-1" />
                <Button
                    variant="ghost" size="sm" onClick={() => activeTab && restartTab(activeTab.id)}
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                    title="Restart terminal"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Restart</span>
                </Button>
            </div>

            {/* Tab strip */}
            <div className="shrink-0 flex items-center gap-1 px-2 sm:px-3 py-1.5 border-b border-border bg-card/20 overflow-x-auto no-scrollbar">
                {tabs.map((tab, i) => {
                    const isActive = tab.id === activeId;
                    return (
                        <div
                            key={tab.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => activateTab(tab.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') activateTab(tab.id); }}
                            className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-colors select-none ${
                                isActive
                                    ? 'bg-violet-500/15 text-violet-300'
                                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                        >
                            <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{env === 'electron' ? 'Shell' : 'Session'} {i + 1}</span>
                            {tabs.length > 1 && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                    className="rounded p-0.5 opacity-50 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-colors"
                                    title="Close shell"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    );
                })}
                <button
                    onClick={addTab}
                    title="New shell"
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground shrink-0 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Body — stacked panes, all mounted, only active visible */}
            <div className="relative flex-1 min-h-0 p-2 sm:p-3">
                {env === null ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground gap-3">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Starting…</span>
                    </div>
                ) : (
                    tabs.map((tab) => {
                        const isActive = tab.id === activeId;
                        const ready = env === 'electron' || Boolean(tab.token && tab.gatewayUrl);
                        return (
                            <div
                                key={tab.id}
                                className="absolute inset-2 sm:inset-3"
                                style={{
                                    visibility: isActive ? 'visible' : 'hidden',
                                    pointerEvents: isActive ? 'auto' : 'none',
                                }}
                            >
                                {tab.status === 'error' ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                                            <WifiOff className="w-6 h-6 text-destructive/70" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-destructive">Could not start the terminal</p>
                                            {tab.error && <p className="text-xs text-muted-foreground mt-1 max-w-sm px-4 break-words">{tab.error}</p>}
                                        </div>
                                        <Button variant="secondary" size="sm" onClick={() => restartTab(tab.id)} className="gap-1.5">
                                            <RotateCcw className="w-3.5 h-3.5" /> Try again
                                        </Button>
                                    </div>
                                ) : ready ? (
                                    <LocalTerminal
                                        tabId={tab.id}
                                        connectionToken={tab.token ?? undefined}
                                        gatewayUrl={tab.gatewayUrl ?? undefined}
                                        onReady={() => setTabStatus(tab.id, 'connected')}
                                        onExit={() => setTabStatus(tab.id, 'disconnected')}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span className="text-sm">Connecting…</span>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
