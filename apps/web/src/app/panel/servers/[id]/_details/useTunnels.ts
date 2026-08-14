'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TunnelResult {
    isHttp: boolean;
    proxyUrl?: string;
    bridgeScript?: string;
    /** Set only in the Electron shell, which can bind a real local port. */
    electronLocalPort?: number;
}

export type TunnelKind = 'HTTP_PROXY' | 'BRIDGE_SCRIPT' | 'ELECTRON_LOCAL';

/** A persisted "I opened this" record — see tunnel-session.service.ts for why
 *  this is bookkeeping, not a live connection probe. */
export interface TunnelSessionRow {
    id: string;
    serverId: string | null;
    serverName: string;
    remoteHost: string;
    remotePort: number;
    kind: TunnelKind;
    localPort: number | null;
    electronId: string | null;
    createdAt: string;
}

function buildProxyUrl(serverId: string, remotePort: number, remoteHost: string): string {
    const hostParam = remoteHost !== '127.0.0.1' ? `?host=${encodeURIComponent(remoteHost)}` : '';
    return `${window.location.origin}/tunnel/${serverId}/${remotePort}${hostParam}`;
}

async function recordTunnelSession(
    input: Omit<TunnelSessionRow, 'id' | 'createdAt'>,
): Promise<TunnelSessionRow | null> {
    try {
        const res = await fetch('/api/tunnel-sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        const data = await res.json();
        return data.success ? data.data.tunnel : null;
    } catch {
        // Bookkeeping is best-effort — a failure here shouldn't block the
        // tunnel the user actually asked for, which already succeeded.
        return null;
    }
}

/**
 * Port-forward tunnels: stateless on the wire — each request probes the
 * target and hands back either a one-click browser link, a copyable
 * local-bridge script, or (inside the Electron desktop shell, which can bind
 * a real local port unlike a browser tab) an actual `127.0.0.1:<port>` to
 * point a tool at. `activeSessions` is a persisted bookkeeping list so
 * tunnels opened earlier are still visible after navigating away and back.
 */
export function useTunnels(serverId: string, serverName: string) {
    const [remoteHost, setRemoteHost] = useState('127.0.0.1');
    const [remotePort, setRemotePort] = useState('');
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<TunnelResult | null>(null);
    const [activeSessions, setActiveSessions] = useState<TunnelSessionRow[]>([]);
    const electronTunnelIdRef = useRef<string | null>(null);

    const refreshSessions = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/tunnel-sessions?serverId=${encodeURIComponent(serverId)}`,
            );
            const data = await res.json();
            if (data.success) setActiveSessions(data.data.tunnels);
        } catch {
            // Leave whatever was already shown — this is a background refresh.
        }
    }, [serverId]);

    useEffect(() => {
        refreshSessions();
    }, [refreshSessions]);

    const closeElectronTunnel = () => {
        if (electronTunnelIdRef.current && window.electronAPI?.tunnel) {
            window.electronAPI.tunnel.close(electronTunnelIdRef.current);
            electronTunnelIdRef.current = null;
        }
    };

    // Close any bound local port if the user navigates away mid-session.
    useEffect(() => closeElectronTunnel, []);

    const open = async () => {
        const port = Number(remotePort);
        setOpening(true);
        setError('');
        setResult(null);
        closeElectronTunnel();

        try {
            if (window.electronAPI?.tunnel) {
                const tokenRes = await fetch('/api/connection/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        protocol: 'tunnel',
                        serverId,
                        remoteHost,
                        remotePort: port,
                    }),
                });
                const tokenData = await tokenRes.json();
                if (!tokenData.success) {
                    setError(tokenData.error || 'Failed to open tunnel');
                    return;
                }

                const bridge = await window.electronAPI.tunnel.open({
                    gatewayUrl: tokenData.data.gatewayUrl,
                    serverId,
                    token: tokenData.data.token,
                });
                if (!bridge.success) {
                    setError(bridge.error);
                    return;
                }

                electronTunnelIdRef.current = bridge.id;
                setResult({ isHttp: false, electronLocalPort: bridge.localPort });

                const row = await recordTunnelSession({
                    serverId,
                    serverName,
                    remoteHost,
                    remotePort: port,
                    kind: 'ELECTRON_LOCAL',
                    localPort: bridge.localPort,
                    electronId: bridge.id,
                });
                if (row) setActiveSessions((prev) => [row, ...prev]);
                return;
            }

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
            setResult(data.data);

            const row = await recordTunnelSession({
                serverId,
                serverName,
                remoteHost,
                remotePort: port,
                kind: data.data.isHttp ? 'HTTP_PROXY' : 'BRIDGE_SCRIPT',
                localPort: null,
                electronId: null,
            });
            if (row) setActiveSessions((prev) => [row, ...prev]);
        } catch {
            setError('Failed to open tunnel');
        } finally {
            setOpening(false);
        }
    };

    const reset = () => {
        closeElectronTunnel();
        setResult(null);
        setError('');
    };

    /** Closes/removes one row from the persisted list — a real close for an
     *  Electron tunnel (kills the bound local port), just bookkeeping cleanup
     *  for the others (see TunnelSessionRow docs). */
    const closeSession = async (row: TunnelSessionRow) => {
        if (row.kind === 'ELECTRON_LOCAL' && row.electronId && window.electronAPI?.tunnel) {
            window.electronAPI.tunnel.close(row.electronId);
            if (electronTunnelIdRef.current === row.electronId) electronTunnelIdRef.current = null;
        }
        setActiveSessions((prev) => prev.filter((s) => s.id !== row.id));
        try {
            await fetch(`/api/tunnel-sessions/${row.id}`, { method: 'DELETE' });
        } catch {
            // Already removed from the visible list; a stale DB row will just
            // sit there until the user notices it in "Active Tunnels" and
            // removes it again — not worth surfacing an error for.
        }
    };

    /** Re-derives the one-click browser link for an HTTP_PROXY row (never
     *  stored — it's fully determined by serverId/port/host, so there's
     *  nothing to regenerate). */
    const proxyUrlFor = (row: TunnelSessionRow): string =>
        buildProxyUrl(row.serverId ?? serverId, row.remotePort, row.remoteHost);

    /** A BRIDGE_SCRIPT row's script embeds a 5-minute token, so the saved
     *  record can't replay it — this asks for a fresh one on demand. */
    const regenerateBridgeScript = async (row: TunnelSessionRow): Promise<string | null> => {
        try {
            const res = await fetch('/api/tunnels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serverId: row.serverId ?? serverId,
                    remoteHost: row.remoteHost,
                    remotePort: row.remotePort,
                }),
            });
            const data = await res.json();
            return data.success ? (data.data.bridgeScript ?? null) : null;
        } catch {
            return null;
        }
    };

    return {
        remoteHost,
        setRemoteHost,
        remotePort,
        setRemotePort,
        opening,
        error,
        open,
        result,
        reset,
        activeSessions,
        closeSession,
        proxyUrlFor,
        regenerateBridgeScript,
    };
}
