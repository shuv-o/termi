'use client';

import { AlertTriangle, Loader2, Plus, Waypoints, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/common/CopyButton';
import { formatBytes } from '@/lib/format';
import { getSiteUrl } from '@/lib/site';
import type { TunnelInfo } from './useTunnels';

/** This server's own hostname (no protocol/port) — where forwarded ports land. */
function tunnelHost(): string {
    try {
        return new URL(getSiteUrl()).hostname;
    } catch {
        return 'this-server';
    }
}

function formatUptime(createdAt: number): string {
    const secs = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
}

function TunnelRow({
    tunnel,
    closing,
    onClose,
}: {
    tunnel: TunnelInfo;
    closing: boolean;
    onClose: () => void;
}) {
    const connectAddress = `${tunnelHost()}:${tunnel.localPort}`;

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 border border-border/50">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium font-mono truncate">
                        {tunnel.remoteHost}:{tunnel.remotePort}
                    </span>
                    <span className="text-muted-foreground text-xs shrink-0">→</span>
                    <span className="text-sm font-medium font-mono truncate text-primary">
                        {connectAddress}
                    </span>
                    <CopyButton text={connectAddress} className="shrink-0" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    Open {formatUptime(tunnel.createdAt)} · {tunnel.connectionCount} connection
                    {tunnel.connectionCount === 1 ? '' : 's'} · {formatBytes(tunnel.bytesIn)} in ·{' '}
                    {formatBytes(tunnel.bytesOut)} out
                </p>
            </div>
            <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                disabled={closing}
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                title="Close tunnel"
            >
                {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            </Button>
        </div>
    );
}

/**
 * Port forwarding for one SSH server — exposes a service on that server's own
 * network (its "remote" side) at a fresh port on this Termi host, the same
 * thing `ssh -L` does, without needing a terminal open.
 */
export function TunnelSection({
    tunnels,
    remoteHost,
    setRemoteHost,
    remotePort,
    setRemotePort,
    opening,
    error,
    onOpen,
    onClose,
    closingId,
}: {
    tunnels: TunnelInfo[];
    remoteHost: string;
    setRemoteHost: (v: string) => void;
    remotePort: string;
    setRemotePort: (v: string) => void;
    opening: boolean;
    error: string;
    onOpen: () => void;
    onClose: (id: string) => void;
    closingId: string | null;
}) {
    const canOpen = remoteHost.trim().length > 0 && Number(remotePort) >= 1 && Number(remotePort) <= 65535;

    return (
        <div>
            <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2 mb-3">
                <Waypoints className="w-4 h-4 text-sky-400" />
                Port Forwarding
            </h2>

            <Card className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                    Forward a port reachable from this server&apos;s own network to a fresh port on
                    this Termi host — like <code className="font-mono">ssh -L</code>, without
                    opening a terminal. Anything that can reach this host can use the forwarded
                    port, so close tunnels you&apos;re done with.
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                        value={remoteHost}
                        onChange={(e) => setRemoteHost(e.target.value)}
                        placeholder="127.0.0.1"
                        className="font-mono text-xs sm:flex-1"
                        disabled={opening}
                    />
                    <Input
                        value={remotePort}
                        onChange={(e) => setRemotePort(e.target.value.replace(/\D/g, ''))}
                        placeholder="5432"
                        inputMode="numeric"
                        className="font-mono text-xs sm:w-28"
                        disabled={opening}
                    />
                    <Button
                        onClick={onOpen}
                        disabled={opening || !canOpen}
                        className="gap-1.5 shrink-0"
                    >
                        {opening ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Plus className="w-3.5 h-3.5" />
                        )}
                        Open Tunnel
                    </Button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {error}
                    </div>
                )}

                {tunnels.length > 0 && (
                    <div className="space-y-2 pt-1">
                        {tunnels.map((t) => (
                            <TunnelRow
                                key={t.id}
                                tunnel={t}
                                closing={closingId === t.id}
                                onClose={() => onClose(t.id)}
                            />
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
