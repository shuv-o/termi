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

export default function SSHConnectionPage() {
    const params = useParams();
    const router = useRouter();
    const serverId = params.id as string;

    const [server, setServer] = useState<{ name: string; hasPassword?: boolean } | null>(null);
    const [revealField, setRevealField] = useState<RevealField | null>(null);
    const [connectionToken, setConnectionToken] = useState<string | null>(null);
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const terminalKeyHandler = useRef<((key: string) => void) | null>(null);
    const triggerReconnectRef = useRef<(() => void) | null>(null);
    const sessionIdRef = useRef(crypto.randomUUID());

    // Tracks the actual visible height — shrinks when native keyboard opens
    const [visualH, setVisualH] = useState(0);

    const handleDisconnect = useCallback(() => {
        console.log('[SSHConnectionPage] Terminal disconnected');
    }, []);
    const handleError = useCallback((err: string) => {
        console.error('Terminal error:', err);
    }, []);

    const renewToken = useCallback(async (): Promise<string> => {
        const res = await fetch('/api/connection/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverId, protocol: 'ssh' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error('Failed to renew connection token');
        const newToken = data.data.token as string;
        setConnectionToken(newToken);
        return newToken;
    }, [serverId]);

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

    useEffect(() => {
        async function initConnection() {
            try {
                const [serverResponse, tokenResponse] = await Promise.all([
                    fetch(`/api/servers/${serverId}`),
                    fetch(`/api/connection/token`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ serverId, protocol: 'ssh' }),
                    }),
                ]);

                const [serverData, tokenData] = await Promise.all([
                    serverResponse.json(),
                    tokenResponse.json(),
                ]);

                if (!serverData.success) {
                    setError('Server not found');
                    setLoading(false);
                    return;
                }

                if (!tokenData.success) {
                    setError('Failed to get connection token');
                    setLoading(false);
                    return;
                }

                setServer(serverData.data.server);
                setConnectionToken(tokenData.data.token);
                setGatewayUrl(tokenData.data.gatewayUrl ?? null);
                setLoading(false);
            } catch (err) {
                console.error('Connection error:', err);
                setError('Failed to initialize connection');
                setLoading(false);
            }
        }

        initConnection();
    }, [serverId]);

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

    if (error || !connectionToken) {
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
            <div className="flex items-center justify-between gap-4 mb-3 px-3 pt-3 shrink-0 lg:px-0 lg:pt-0 lg:mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <Button variant="ghost" size="icon" asChild className="shrink-0 h-8 w-8">
                        <Link href="/panel">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                    </Button>
                    <div className="min-w-0">
                        <h1 className="font-medium truncate">{server?.name}</h1>
                        <span className="text-sm text-muted-foreground">SSH Terminal</span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {server?.hasPassword && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRevealField('password')}
                            title="Copy password (passkey required)"
                        >
                            <KeyRound className="w-4 h-4" />
                        </Button>
                    )}

                    <Button
                        variant={showFiles ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setShowFiles(f => !f)}
                        className="gap-1.5"
                        title={showFiles ? 'Hide file manager' : 'Open file manager'}
                    >
                        <FolderOpen className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Files</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => triggerReconnectRef.current?.()}
                        title="Reconnect"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFullscreen}
                        className="hidden sm:flex"
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </Button>

                    <Button
                        variant={showKeyboard ? 'default' : 'ghost'}
                        size="icon"
                        onClick={() => setShowKeyboard(!showKeyboard)}
                        title={showKeyboard ? 'Hide keyboard' : 'Show keyboard'}
                    >
                        <Keyboard className="w-4 h-4" />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/panel')}
                        className="text-destructive hover:text-destructive"
                        title="Disconnect"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* ── Main area: terminal + optional file panel ── */}
            <div className="flex flex-1 min-h-0 gap-3 px-3 lg:px-0">
                {/* Terminal */}
                <div className="flex-1 min-w-0 min-h-0">
                    <SSHTerminal
                        sessionId={sessionIdRef.current}
                        serverId={serverId}
                        connectionToken={connectionToken}
                        renewToken={renewToken}
                        gatewayUrl={gatewayUrl ?? undefined}
                        disableNativeKeyboard={isMobile}
                        onDisconnect={handleDisconnect}
                        onError={handleError}
                        onKeyHandlerReady={(handler) => { terminalKeyHandler.current = handler; }}
                        onSessionNotFound={() => router.push('/panel')}
                        onReconnectReady={(fn) => { triggerReconnectRef.current = fn; }}
                    />
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
                <VirtualKeyboard onKey={(key) => { terminalKeyHandler.current?.(key); }} />
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
