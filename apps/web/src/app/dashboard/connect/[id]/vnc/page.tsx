'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
    ArrowLeft,
    Maximize2,
    Minimize2,
    RotateCcw,
    X,
    Monitor,
    Scan,
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

export default function VNCConnectionPage() {
    const params = useParams();
    const router = useRouter();
    const serverId = params.id as string;

    const [server, setServer] = useState<{ name: string } | null>(null);
    const [connectionToken, setConnectionToken] = useState<string | null>(null);
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Explicit resolution override. null = use container size (Auto).
    const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);

    const [reconnectKey, setReconnectKey] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);

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
                    body: JSON.stringify({ serverId, protocol: 'vnc' }),
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
    // resolution is intentionally included so the handler always sees the latest value
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolution]);

    const selectValue = resolution
        ? (PRESETS.find(p => p.value !== 'auto' && p.value === `${resolution.w}x${resolution.h}`)?.value ?? `${resolution.w}x${resolution.h}`)
        : 'auto';

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
                    <Link href="/dashboard">Back to Dashboard</Link>
                </Button>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)]">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href="/dashboard">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <Monitor className="w-5 h-5 text-orange-400" />
                            <h1 className="font-medium">{server?.name}</h1>
                        </div>
                        <span className="text-sm text-muted-foreground">Virtual Network Computing (VNC)</span>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Resolution selector */}
                    <Select
                        value={selectValue}
                        onValueChange={(v) => {
                            const parsed = parsePreset(v);
                            setResolution(parsed);
                        }}
                    >
                        <SelectTrigger className="h-8 w-auto gap-1.5 border-0 bg-transparent hover:bg-accent text-xs px-2 focus:ring-0 [&>svg]:hidden">
                            <Scan className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end" className="bg-card border-border">
                            {PRESETS.map(p => (
                                <SelectItem key={p.value} value={p.value} className="text-xs">
                                    {p.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setReconnectKey(k => k + 1)}
                        title="Reconnect / Fit to current window"
                        className="h-8 w-8"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleFullscreen}
                        className="hidden sm:flex h-8 w-8"
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen — auto-fits to screen size'}
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/dashboard')}
                        className="text-destructive hover:text-destructive h-8 w-8"
                        title="Disconnect"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Display */}
            <div className="flex-1 min-h-0 bg-card rounded-lg overflow-hidden">
                <GuacamoleDisplay
                    key={`${connectionToken}-${reconnectKey}`}
                    serverId={serverId}
                    connectionToken={connectionToken}
                    protocol="vnc"
                    gatewayUrl={gatewayUrl ?? undefined}
                    preferredWidth={resolution?.w}
                    preferredHeight={resolution?.h}
                    onDisconnect={() => { console.log('VNC disconnected'); }}
                    onError={(err) => { console.error('VNC error:', err); }}
                />
            </div>

            {/* Info */}
            <div className="mt-4 text-xs text-muted-foreground text-center">
                <p>Use your mouse and keyboard to interact with the VNC session.</p>
                <p className="mt-1">Right-click is supported. Press ESC to release focus.</p>
            </div>
        </div>
    );
}
