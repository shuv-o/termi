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
    X,
    Scan,
    ZoomIn,
    ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const GuacamoleDisplay = dynamic(
    () => import('@/components/terminal/GuacamoleDisplay'),
    { ssr: false }
);

const PRESETS = [
    { label: 'Auto', value: 'auto' },
    { label: '1280×720', value: '1280x720' },
    { label: '1920×1080', value: '1920x1080' },
    { label: '2560×1440', value: '2560x1440' },
    { label: '3840×2160', value: '3840x2160' },
] as const;

function parsePreset(value: string): { w: number; h: number } | null {
    if (value === 'auto') return null;
    const [w, h] = value.split('x').map(Number);
    return { w, h };
}

const ZOOM_LEVELS = [
    { label: 'Fit', value: 'fit' },
    { label: '50%',  value: '0.5' },
    { label: '75%',  value: '0.75' },
    { label: '100%', value: '1' },
    { label: '125%', value: '1.25' },
    { label: '150%', value: '1.5' },
    { label: '200%', value: '2' },
] as const;

export default function RDPConnectionPage() {
    const params = useParams();
    const router = useRouter();
    const serverId = params.id as string;

    const [server, setServer] = useState<{ name: string } | null>(null);
    const [connectionToken, setConnectionToken] = useState<string | null>(null);
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [toolbarVisible, setToolbarVisible] = useState(true);

    const [zoom, setZoom] = useState<number | undefined>(undefined);
    const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);
    const [reconnectKey, setReconnectKey] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleHide = useCallback(() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setToolbarVisible(false), 2000);
    }, []);

    const cancelHide = useCallback(() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }, []);

    // Hide toolbar when entering fullscreen; always show when leaving
    useEffect(() => {
        if (!isFullscreen) {
            setToolbarVisible(true);
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            return;
        }
        setToolbarVisible(false);
    }, [isFullscreen]);

    useEffect(() => {
        async function initConnection() {
            try {
                const serverResponse = await fetch(`/api/servers/${serverId}`);
                const serverData = await serverResponse.json();

                if (!serverData.success) {
                    setError('Server not found');
                    setLoading(false);
                    return;
                }

                setServer(serverData.data.server);

                const tokenResponse = await fetch(`/api/connection/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ serverId, protocol: 'rdp' }),
                });

                const tokenData = await tokenResponse.json();

                if (!tokenData.success) {
                    setError('Failed to get connection token');
                    setLoading(false);
                    return;
                }

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
        } else {
            await document.exitFullscreen();
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            const entered = !!document.fullscreenElement;
            setIsFullscreen(entered);
            if (resolution === null) {
                setReconnectKey(k => k + 1);
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolution]);

    const selectValue = resolution
        ? (PRESETS.find(p => p.value !== 'auto' && p.value === `${resolution.w}x${resolution.h}`)?.value ?? `${resolution.w}x${resolution.h}`)
        : 'auto';

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100dvh-8rem)]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !connectionToken) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100dvh-8rem)] gap-4">
                <p className="text-destructive">{error || 'Connection failed'}</p>
                <Button asChild>
                    <Link href="/panel">Back to Dashboard</Link>
                </Button>
            </div>
        );
    }

    // Shared toolbar buttons — rendered in both normal and fullscreen mode
    const toolbar = (
        <>
            <div className="flex items-center gap-2 min-w-0">
                <Button variant="ghost" size="icon" asChild className={`shrink-0 ${isFullscreen ? 'h-8 w-8' : 'h-7 w-7'}`}>
                    <Link href="/panel">
                        <ArrowLeft className={isFullscreen ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                    </Link>
                </Button>
                <span className={`font-medium truncate ${isFullscreen ? 'text-white text-sm max-w-xs' : 'text-sm max-w-[120px] sm:max-w-xs'}`}>
                    {server?.name}
                </span>
                {!isFullscreen && (
                    <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">— RDP</span>
                )}
            </div>

            <div className={`flex items-center shrink-0 ${isFullscreen ? 'gap-1.5' : 'gap-1'}`}>
                <Select
                    value={selectValue}
                    onValueChange={(v) => setResolution(parsePreset(v))}
                >
                    <SelectTrigger className={`w-auto gap-1 border-0 bg-transparent hover:bg-accent text-xs px-2 focus:ring-0 [&>svg]:hidden ${isFullscreen ? 'h-8 text-white hover:bg-white/20' : 'h-7'}`}>
                        <Scan className={`shrink-0 ${isFullscreen ? 'w-3.5 h-3.5 text-white/70' : 'w-3 h-3 text-muted-foreground'}`} />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-card border-border">
                        {PRESETS.map(p => (
                            <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select
                    value={zoom !== undefined ? String(zoom) : 'fit'}
                    onValueChange={(v) => setZoom(v === 'fit' ? undefined : parseFloat(v))}
                >
                    <SelectTrigger className={`w-auto gap-1 border-0 bg-transparent hover:bg-accent text-xs px-2 focus:ring-0 [&>svg]:hidden ${isFullscreen ? 'h-8 text-white hover:bg-white/20' : 'h-7'}`}>
                        <ZoomIn className={`shrink-0 ${isFullscreen ? 'w-3.5 h-3.5 text-white/70' : 'w-3 h-3 text-muted-foreground'}`} />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" className="bg-card border-border">
                        {ZOOM_LEVELS.map(z => (
                            <SelectItem key={z.value} value={z.value} className="text-xs">{z.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setReconnectKey(k => k + 1)}
                    title="Reconnect / Fit to current window"
                    className={isFullscreen ? 'h-8 w-8 text-white hover:bg-white/20' : 'h-7 w-7'}
                >
                    <RotateCcw className={isFullscreen ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen — auto-fits to screen size'}
                    className={isFullscreen ? 'h-8 w-8 text-white hover:bg-white/20' : 'h-7 w-7 hidden sm:flex'}
                >
                    {isFullscreen
                        ? <Minimize2 className="w-4 h-4" />
                        : <Maximize2 className="w-3.5 h-3.5" />
                    }
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/panel')}
                    title="Disconnect"
                    className={isFullscreen
                        ? 'h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20'
                        : 'h-7 w-7 text-destructive hover:text-destructive'
                    }
                >
                    <X className={isFullscreen ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                </Button>
            </div>
        </>
    );

    return (
        <div
            ref={containerRef}
            className="flex flex-col h-[calc(100dvh-8rem)]"
        >
            {/* Normal header (hidden when fullscreen — browser's fullscreen API takes over the element) */}
            {!isFullscreen && (
                <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                    {toolbar}
                </div>
            )}

            {/* Display */}
            <div className="flex-1 min-h-0 bg-card rounded-lg overflow-hidden relative">
                <GuacamoleDisplay
                    key={`${connectionToken}-${reconnectKey}`}
                    serverId={serverId}
                    connectionToken={connectionToken}
                    protocol="rdp"
                    gatewayUrl={gatewayUrl ?? undefined}
                    preferredWidth={resolution?.w}
                    preferredHeight={resolution?.h}
                    scale={zoom}
                    onDisconnect={() => { console.log('RDP disconnected'); }}
                    onError={(err) => { console.error('RDP error:', err); }}
                />

                {/* Pill — always visible in fullscreen; click to show controls */}
                {isFullscreen && (
                    <button
                        onClick={() => setToolbarVisible(true)}
                        onMouseEnter={cancelHide}
                        onMouseLeave={scheduleHide}
                        className="absolute top-0 left-1/2 -translate-x-1/2 z-[51] flex items-center justify-center w-10 h-4 bg-white/20 hover:bg-white/35 rounded-b-full transition-colors"
                        title="Show controls"
                    >
                        <ChevronDown className="w-3 h-3 text-white/80" />
                    </button>
                )}

                {/* Floating toolbar — hides automatically when mouse leaves */}
                {isFullscreen && (
                    <div
                        onMouseEnter={cancelHide}
                        onMouseLeave={scheduleHide}
                        className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-3 py-2 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${toolbarVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    >
                        {toolbar}
                    </div>
                )}
            </div>
        </div>
    );
}
