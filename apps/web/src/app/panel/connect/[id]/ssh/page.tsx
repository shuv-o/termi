'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
    ArrowLeft,
    Maximize2,
    Minimize2,
    RotateCcw,
    FolderOpen,
    X,
    KeyRound,
    Keyboard,
    Plus,
    Terminal as TerminalIcon,
    Loader2,
} from 'lucide-react';
import FileManagerPanel from '@/components/scp/FileManagerPanel';
import type { RevealField } from '@/components/auth/PasskeyRevealModal';
import { Button } from '@/components/ui/button';

const PasskeyRevealModal = dynamic(
    () => import('@/components/auth/PasskeyRevealModal'),
    { ssr: false }
);

const SSHTerminal = dynamic(
    () => import('@/components/terminal/SSHTerminal'),
    { ssr: false }
);

const VirtualKeyboard = dynamic(
    () => import('@/components/terminal/VirtualKeyboard'),
    { ssr: false }
);

/** One SSH shell tab against the same server. */
interface TermTab {
    id: string;        // stable tab identity (React key)
    sessionId: string; // unique gateway session — must differ per tab
    token: string | null;
}

export default function SSHConnectionPage() {
    const params = useParams();
    const router = useRouter();
    const serverId = params.id as string;

    const [server, setServer] = useState<{ name: string; hasPassword?: boolean } | null>(null);
    const [revealField, setRevealField] = useState<RevealField | null>(null);
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // ── Tabs ──
    const [tabs, setTabs] = useState<TermTab[]>([]);
    const [activeId, setActiveId] = useState<string>('');

    const containerRef = useRef<HTMLDivElement>(null);
    // Per-tab handlers so the shared toolbar / keyboard target the active tab.
    const keyHandlers = useRef(new Map<string, (key: string) => void>());
    const reconnectFns = useRef(new Map<string, () => void>());
    const wsRefs = useRef(new Map<string, WebSocket>());

    // Tracks the actual visible height — shrinks when native keyboard opens
    const [visualH, setVisualH] = useState(0);

    const handleError = useCallback((err: string) => {
        console.error('Terminal error:', err);
    }, []);

    // ── Token helpers ──

    const fetchToken = useCallback(async (): Promise<{ token: string; gatewayUrl: string | null } | null> => {
        try {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'ssh' }),
            });
            const data = await res.json();
            if (!data.success) return null;
            return { token: data.data.token, gatewayUrl: data.data.gatewayUrl ?? null };
        } catch {
            return null;
        }
    }, [serverId]);

    /** Used by each terminal to refresh its credential token on reconnect. */
    const renewToken = useCallback(async (): Promise<string> => {
        const result = await fetchToken();
        if (!result) throw new Error('Failed to renew connection token');
        if (result.gatewayUrl) setGatewayUrl(result.gatewayUrl);
        return result.token;
    }, [fetchToken]);

    // ── Tab actions ──

    const activateTab = useCallback((id: string) => {
        setActiveId(id);
        // Let the now-visible terminal refit to its container.
        setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    }, []);

    const addTab = useCallback(async () => {
        const id = crypto.randomUUID();
        setTabs(prev => [...prev, { id, sessionId: crypto.randomUUID(), token: null }]);
        setActiveId(id);
        const result = await fetchToken();
        if (result?.gatewayUrl) setGatewayUrl(result.gatewayUrl);
        setTabs(prev => prev.map(t => (t.id === id ? { ...t, token: result?.token ?? null } : t)));
    }, [fetchToken]);

    const closeTab = useCallback((id: string) => {
        // Tell the gateway to tear down this session before unmounting.
        const ws = wsRefs.current.get(id);
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'close-session' }));
        }
        wsRefs.current.delete(id);
        keyHandlers.current.delete(id);
        reconnectFns.current.delete(id);

        setTabs(prev => {
            const remaining = prev.filter(t => t.id !== id);
            if (remaining.length === 0) {
                router.push('/panel');
                return prev;
            }
            setActiveId(curr => (curr === id ? remaining[remaining.length - 1].id : curr));
            return remaining;
        });
    }, [router]);

    /** Gateway lost the session — start a fresh one for this tab. */
    const renewTab = useCallback(async (id: string) => {
        setTabs(prev => prev.map(t => (t.id === id ? { ...t, sessionId: crypto.randomUUID(), token: null } : t)));
        const result = await fetchToken();
        if (result?.gatewayUrl) setGatewayUrl(result.gatewayUrl);
        setTabs(prev => prev.map(t => (t.id === id ? { ...t, token: result?.token ?? null } : t)));
    }, [fetchToken]);

    /** Disconnect everything and leave. */
    const disconnectAll = useCallback(() => {
        for (const ws of wsRefs.current.values()) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'close-session' }));
            }
        }
        router.push('/panel');
    }, [router]);

    // ── Responsive / viewport ──

    useEffect(() => {
        const check = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile) setShowKeyboard(true);
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Keep visualH in sync with the visual viewport (shrinks when native keyboard opens)
    useEffect(() => {
        const update = () => {
            const vv = window.visualViewport;
            setVisualH(vv ? vv.height : window.innerHeight);
        };
        update();
        window.visualViewport?.addEventListener('resize', update);
        return () => window.visualViewport?.removeEventListener('resize', update);
    }, []);

    // After React re-renders with the new visualH, tell xterm to refit
    useEffect(() => {
        if (visualH > 0) window.dispatchEvent(new Event('resize'));
    }, [visualH]);

    // ── Initial load: server info + first tab ──

    useEffect(() => {
        let cancelled = false;
        async function initConnection() {
            try {
                const [serverResponse, tokenResult] = await Promise.all([
                    fetch(`/api/servers/${serverId}`),
                    fetchToken(),
                ]);
                const serverData = await serverResponse.json();
                if (cancelled) return;

                if (!serverData.success) {
                    setError('Server not found');
                    setLoading(false);
                    return;
                }
                if (!tokenResult) {
                    setError('Failed to get connection token');
                    setLoading(false);
                    return;
                }

                const id = crypto.randomUUID();
                setServer(serverData.data.server);
                setGatewayUrl(tokenResult.gatewayUrl);
                setTabs([{ id, sessionId: crypto.randomUUID(), token: tokenResult.token }]);
                setActiveId(id);
                setLoading(false);
            } catch (err) {
                if (cancelled) return;
                console.error('Connection error:', err);
                setError('Failed to initialize connection');
                setLoading(false);
            }
        }
        initConnection();
        return () => { cancelled = true; };
    }, [serverId, fetchToken]);

    const toggleFullscreen = async () => {
        if (!document.fullscreenElement) {
            await containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            await document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || tabs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4">
                <p className="text-destructive">{error || 'Connection failed'}</p>
                <Button asChild>
                    <Link href="/panel">Back to Dashboard</Link>
                </Button>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="flex flex-col bg-background"
            style={isMobile
                ? { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: visualH > 0 ? `${visualH}px` : '100dvh' }
                : { height: 'calc(100dvh - 8rem)' }
            }
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-2 mb-2 px-3 pt-2 shrink-0 lg:px-0 lg:pt-0 lg:mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Button variant="ghost" size="icon" asChild className="shrink-0 h-7 w-7">
                        <Link href="/panel">
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                    </Button>
                    <span className="font-medium text-sm truncate max-w-[120px] sm:max-w-xs">{server?.name}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">— SSH</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {server?.hasPassword && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setRevealField('password')}
                            title="Copy password (passkey required)"
                        >
                            <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                    )}

                    <Button
                        variant={showFiles ? 'default' : 'ghost'}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setShowFiles(f => !f)}
                        title={showFiles ? 'Hide file manager' : 'Open file manager'}
                    >
                        <FolderOpen className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => reconnectFns.current.get(activeId)?.()}
                        title="Reconnect"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="hidden sm:flex h-7 w-7"
                        onClick={toggleFullscreen}
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </Button>

                    <Button
                        variant={showKeyboard ? 'default' : 'ghost'}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setShowKeyboard(!showKeyboard)}
                        title={showKeyboard ? 'Hide keyboard' : 'Show keyboard'}
                    >
                        <Keyboard className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={disconnectAll}
                        title="Disconnect"
                    >
                        <X className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* ── Tab strip ── */}
            <div className="flex items-center gap-1 px-3 lg:px-0 mb-2 shrink-0 overflow-x-auto no-scrollbar">
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
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                        >
                            <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>Shell {i + 1}</span>
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

            {/* ── Main area: terminal tabs + optional file panel ── */}
            <div className="flex flex-1 min-h-0 gap-2 px-3 lg:px-0">
                {/* Stacked terminal panes — all kept mounted, only active is visible */}
                <div className="relative flex-1 min-w-0 min-h-0">
                    {tabs.map((tab) => {
                        const isActive = tab.id === activeId;
                        return (
                            <div
                                key={tab.id}
                                className="absolute inset-0"
                                style={{
                                    visibility: isActive ? 'visible' : 'hidden',
                                    pointerEvents: isActive ? 'auto' : 'none',
                                }}
                            >
                                {tab.token ? (
                                    <SSHTerminal
                                        sessionId={tab.sessionId}
                                        serverId={serverId}
                                        connectionToken={tab.token}
                                        renewToken={renewToken}
                                        gatewayUrl={gatewayUrl ?? undefined}
                                        disableNativeKeyboard={isMobile}
                                        onError={handleError}
                                        onKeyHandlerReady={(handler) => { keyHandlers.current.set(tab.id, handler); }}
                                        onWebSocketCreated={(ws) => {
                                            if (ws) wsRefs.current.set(tab.id, ws);
                                            else wsRefs.current.delete(tab.id);
                                        }}
                                        onSessionNotFound={() => renewTab(tab.id)}
                                        onReconnectReady={(fn) => { reconnectFns.current.set(tab.id, fn); }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span className="text-sm">Establishing connection…</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* File manager panel — desktop: side panel | mobile: full overlay */}
                {showFiles && (
                    <>
                        <div className="hidden md:flex w-80 lg:w-96 shrink-0 flex-col rounded-xl border border-border overflow-hidden">
                            <FileManagerPanel
                                serverId={serverId}
                                onClose={() => setShowFiles(false)}
                            />
                        </div>

                        <div className="md:hidden absolute inset-0 z-20 rounded-xl overflow-hidden border border-border">
                            <FileManagerPanel
                                serverId={serverId}
                                onClose={() => setShowFiles(false)}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Virtual keyboard — always shown on mobile, toggleable on desktop */}
            {showKeyboard && (
                <VirtualKeyboard onKey={(key) => { keyHandlers.current.get(activeId)?.(key); }} />
            )}

            {/* Passkey credential reveal */}
            {revealField && server && (
                <PasskeyRevealModal
                    serverId={serverId}
                    serverName={server.name}
                    field={revealField}
                    onClose={() => setRevealField(null)}
                />
            )}
        </div>
    );
}
