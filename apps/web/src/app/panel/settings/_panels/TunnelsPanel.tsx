'use client';

import { Waypoints } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { SettingsSection } from '../_components/SettingsSection';
import { TunnelSessionRowCard } from '../../servers/[id]/_details/TunnelSection';
import type { TunnelSessionRow } from '../../servers/[id]/_details/useTunnels';

function buildProxyUrl(row: TunnelSessionRow): string | null {
    if (!row.serverId) return null;
    const hostParam = row.remoteHost !== '127.0.0.1' ? `?host=${encodeURIComponent(row.remoteHost)}` : '';
    return `${window.location.origin}/tunnel/${row.serverId}/${row.remotePort}${hostParam}`;
}

/**
 * Every tunnel the user has opened, across every server — the tunnel
 * equivalent of Settings → Active Sessions. See useTunnels.ts for why this
 * is a self-reported bookkeeping list, not a live connection probe.
 */
export function TunnelsPanel() {
    const { data, mutate } = useCachedFetch<{ tunnels: TunnelSessionRow[] }>(
        '/api/tunnel-sessions',
    );
    const tunnels = data?.tunnels ?? [];

    const close = async (row: TunnelSessionRow) => {
        if (row.kind === 'ELECTRON_LOCAL' && row.electronId && window.electronAPI?.tunnel) {
            window.electronAPI.tunnel.close(row.electronId);
        }
        mutate((prev) => ({ tunnels: (prev?.tunnels ?? []).filter((t) => t.id !== row.id) }));
        try {
            await fetch(`/api/tunnel-sessions/${row.id}`, { method: 'DELETE' });
        } catch {
            // Already removed from view — a stale row can be cleaned up on next visit.
        }
    };

    const regenerateScript = async (row: TunnelSessionRow): Promise<string | null> => {
        if (!row.serverId) return null;
        try {
            const res = await fetch('/api/tunnels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serverId: row.serverId,
                    remoteHost: row.remoteHost,
                    remotePort: row.remotePort,
                }),
            });
            const json = await res.json();
            return json.success ? (json.data.bridgeScript ?? null) : null;
        } catch {
            return null;
        }
    };

    return (
        <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
            <SettingsSection
                title="Active Tunnels"
                description="Port forwards you've opened across all servers — like ssh -L, but tracked in one place."
                icon={Waypoints}
                iconBg="bg-sky-500/15 text-sky-400"
            >
                {tunnels.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        No tunnels opened yet — use Port Forwarding on a server&apos;s detail page
                        to open one.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {tunnels.map((row) => (
                            <TunnelSessionRowCard
                                key={row.id}
                                row={row}
                                serverLabel={row.serverName}
                                proxyUrl={buildProxyUrl(row)}
                                onClose={() => close(row)}
                                onRegenerateScript={() => regenerateScript(row)}
                            />
                        ))}
                    </div>
                )}
            </SettingsSection>
        </Card>
    );
}
