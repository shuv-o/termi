'use client';

import { useEffect, useState } from 'react';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';

export interface TunnelInfo {
    id: string;
    serverId: string;
    serverName: string;
    remoteHost: string;
    remotePort: number;
    localPort: number;
    createdAt: number;
    bytesIn: number;
    bytesOut: number;
    connectionCount: number;
}

/** Port-forward tunnels for one server — opening, listing, and closing them. */
export function useTunnels(serverId: string) {
    const { data, mutate, refresh } = useCachedFetch<{ tunnels: TunnelInfo[] }>('/api/tunnels');
    const tunnels = (data?.tunnels ?? []).filter((t) => t.serverId === serverId);

    const [remoteHost, setRemoteHost] = useState('127.0.0.1');
    const [remotePort, setRemotePort] = useState('');
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState('');
    const [closingId, setClosingId] = useState<string | null>(null);

    // Poll while a tunnel is open so byte counters/connection counts stay live.
    useEffect(() => {
        if (tunnels.length === 0) return;
        const interval = setInterval(refresh, 5000);
        return () => clearInterval(interval);
    }, [tunnels.length, refresh]);

    const open = async () => {
        const port = Number(remotePort);
        setOpening(true);
        setError('');
        try {
            const res = await fetch('/api/tunnels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, remoteHost, remotePort: port }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to open tunnel');
                return;
            }
            mutate((prev) => ({ tunnels: [...(prev?.tunnels ?? []), data.data.tunnel] }));
            setRemotePort('');
        } catch {
            setError('Failed to open tunnel');
        } finally {
            setOpening(false);
        }
    };

    const close = async (id: string) => {
        setClosingId(id);
        try {
            await fetch(`/api/tunnels/${id}`, { method: 'DELETE' });
            mutate((prev) => ({ tunnels: (prev?.tunnels ?? []).filter((t) => t.id !== id) }));
        } finally {
            setClosingId(null);
        }
    };

    return {
        tunnels,
        remoteHost,
        setRemoteHost,
        remotePort,
        setRemotePort,
        opening,
        error,
        open,
        close,
        closingId,
    };
}
