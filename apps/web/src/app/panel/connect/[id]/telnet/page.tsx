'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Maximize2, Minimize2, RotateCcw, X, Keyboard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TelnetTerminal = dynamic(() => import('@/components/terminal/TelnetTerminal'), {
    ssr: false,
});

const VirtualKeyboard = dynamic(() => import('@/components/terminal/VirtualKeyboard'), {
    ssr: false,
});

export default function TelnetConnectionPage() {
    const params = useParams();
    const router = useRouter();
    const serverId = params.id as string;

    const [server, setServer] = useState<{ name: string } | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [visualH, setVisualH] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const keyHandlerRef = useRef<((key: string) => void) | null>(null);
    const reconnectRef = useRef<(() => void) | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const fetchToken = useCallback(async () => {
        const res = await fetch('/api/connection/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverId, protocol: 'telnet' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to get token');
        return { token: data.data.token as string, gatewayUrl: data.data.gatewayUrl as string };
    }, [serverId]);

    const renewToken = useCallback(async (): Promise<string> => {
        const result = await fetchToken();
        if (result.gatewayUrl) setGatewayUrl(result.gatewayUrl);
        return result.token;
    }, [fetchToken]);

    const disconnect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'close-session' }));
        }
        router.push('/panel');
    }, [router]);

    // Responsive
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

    useEffect(() => {
        const update = () => {
            const vv = window.visualViewport;
            setVisualH(vv ? vv.height : window.innerHeight);
        };
        update();
        window.visualViewport?.addEventListener('resize', update);
        return () => window.visualViewport?.removeEventListener('resize', update);
    }, []);

    useEffect(() => {
        if (visualH > 0) window.dispatchEvent(new Event('resize'));
    }, [visualH]);

    // Initial load
    useEffect(() => {
        let cancelled = false;
        async function init() {
            try {
                const [serverRes, tokenResult] = await Promise.all([
                    fetch(`/api/servers/${serverId}`).then((r) => r.json()),
                    fetchToken(),
                ]);
                if (cancelled) return;
                if (!serverRes.success) {
                    setError('Server not found');
                } else {
                    setServer(serverRes.data.server);
                    setToken(tokenResult.token);
                    setGatewayUrl(tokenResult.gatewayUrl);
                }
            } catch {
                if (!cancelled) setError('Failed to initialize connection');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        init();
        return () => {
            cancelled = true;
        };
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
            <div className="flex items-center justify-center h-dvh lg:h-screen">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !token) {
        return (
            <div className="flex flex-col items-center justify-center h-dvh lg:h-screen gap-4">
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
            style={
                isMobile
                    ? {
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          zIndex: 50,
                          height: visualH > 0 ? `${visualH}px` : '100dvh',
                      }
                    : { height: '100dvh' }
            }
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 border-b border-border bg-card">
                <div className="flex items-center gap-2 min-w-0">
                    <Button variant="ghost" size="icon" asChild className="shrink-0 h-7 w-7">
                        <Link href="/panel">
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                    </Button>
                    <span className="font-medium text-sm truncate max-w-[120px] sm:max-w-xs">
                        {server?.name}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">
                        — Telnet
                    </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => reconnectRef.current?.()}
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
                        {isFullscreen ? (
                            <Minimize2 className="w-3.5 h-3.5" />
                        ) : (
                            <Maximize2 className="w-3.5 h-3.5" />
                        )}
                    </Button>

                    <Button
                        variant={showKeyboard ? 'default' : 'ghost'}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                            setShowKeyboard((k) => !k);
                            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
                        }}
                        title={showKeyboard ? 'Hide keyboard' : 'Show keyboard'}
                    >
                        <Keyboard className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={disconnect}
                        title="Disconnect"
                    >
                        <X className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* Terminal */}
            <div className="flex-1 min-h-0">
                {token ? (
                    <TelnetTerminal
                        serverId={serverId}
                        connectionToken={token}
                        renewToken={renewToken}
                        gatewayUrl={gatewayUrl ?? undefined}
                        disableNativeKeyboard={isMobile}
                        onDisconnect={() => {}}
                        onError={(err) => console.error('[TelnetPage]', err)}
                        onKeyHandlerReady={(handler) => {
                            keyHandlerRef.current = handler;
                        }}
                        onWebSocketCreated={(ws) => {
                            wsRef.current = ws;
                        }}
                        onReconnectReady={(fn) => {
                            reconnectRef.current = fn;
                        }}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground gap-3">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Establishing connection…</span>
                    </div>
                )}
            </div>

            {showKeyboard && <VirtualKeyboard onKey={(key) => keyHandlerRef.current?.(key)} />}
        </div>
    );
}
