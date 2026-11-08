'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ForwardMode = 'local' | 'dynamic' | 'remote';
type BindAddress = '127.0.0.1' | '0.0.0.0';

export interface TunnelResult {
    mode: ForwardMode;
    isHttp: boolean;
    proxyUrl?: string;
    bridgeScript?: string;
    /** Desktop shell only: the port bound here (local / SOCKS). */
    electronLocalPort?: number;
    /** Desktop shell only, remote mode: the port the server listens on. */
    electronBindPort?: number;
    /** Remote mode: the service on this computer the server reaches. */
    localTarget?: string;
}

export type TunnelKind = 'HTTP_PROXY' | 'BRIDGE_SCRIPT' | 'ELECTRON_LOCAL';
export type TunnelMode = 'LOCAL' | 'DYNAMIC' | 'REMOTE';

/** A persisted "I opened this" record — see tunnel-session.service.ts for why
 *  this is bookkeeping, not a live connection probe. */
export interface TunnelSessionRow {
    id: string;
    serverId: string | null;
    serverName: string;
    /** LOCAL: the target. REMOTE: where the server listens. DYNAMIC: "*". */
    remoteHost: string;
    remotePort: number;
    kind: TunnelKind;
    mode?: TunnelMode;
    localPort: number | null;
    localHost?: string | null;
    electronId: string | null;
    createdAt: string;
}

const MODE_OF: Record<ForwardMode, TunnelMode> = {
    local: 'LOCAL',
    dynamic: 'DYNAMIC',
    remote: 'REMOTE',
};

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

/** Whether this desktop shell can run `mode` itself (older shells: local only). */
export function desktopSupports(mode: ForwardMode): boolean {
    const t = typeof window !== 'undefined' ? window.electronAPI?.tunnel : undefined;
    if (!t) return false;
    return mode === 'local' || Boolean(t.modes?.includes(mode));
}

/**
 * Port forwarding: local (`ssh -L`), dynamic SOCKS (`ssh -D`) and remote
 * (`ssh -R`). Inside the desktop shell the tunnel runs right here; in a
 * browser, a local HTTP target gets a one-click link and everything else a
 * bridge script to run with Node. `activeSessions` is a persisted bookkeeping
 * list so tunnels opened earlier stay visible after navigating away and back.
 */
export function useTunnels(serverId: string, serverName: string) {
    const [mode, setMode] = useState<ForwardMode>('local');
    const [remoteHost, setRemoteHost] = useState('127.0.0.1');
    const [remotePort, setRemotePort] = useState('');
    const [bindAddress, setBindAddress] = useState<BindAddress>('127.0.0.1');
    const [bindPort, setBindPort] = useState('');
    const [localPort, setLocalPort] = useState('');
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<TunnelResult | null>(null);
    const [activeSessions, setActiveSessions] = useState<TunnelSessionRow[]>([]);
    const electronTunnelIdRef = useRef<string | null>(null);
    const sessionsRef = useRef<TunnelSessionRow[]>([]);
    useEffect(() => {
        sessionsRef.current = activeSessions;
    }, [activeSessions]);

    const refreshSessions = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/tunnel-sessions?serverId=${encodeURIComponent(serverId)}`,
            );
            const data = await res.json();
            if (!data.success) return;
            let rows: TunnelSessionRow[] = data.data.tunnels;
            // Desktop tunnels die with the app: drop records of ones not running.
            const live = await window.electronAPI?.tunnel?.list?.();
            if (live) {
                const stale = rows.filter(
                    (r) => r.kind === 'ELECTRON_LOCAL' && !live.includes(r.electronId ?? ''),
                );
                rows = rows.filter((r) => !stale.includes(r));
                for (const r of stale) {
                    void fetch(`/api/tunnel-sessions/${r.id}`, { method: 'DELETE' }).catch(
                        () => {},
                    );
                }
            }
            setActiveSessions(rows);
        } catch {
            // Leave whatever was already shown — this is a background refresh.
        }
    }, [serverId]);

    useEffect(() => {
        refreshSessions();
    }, [refreshSessions]);

    const forgetSession = useCallback(async (row: TunnelSessionRow) => {
        setActiveSessions((prev) => prev.filter((s) => s.id !== row.id));
        try {
            await fetch(`/api/tunnel-sessions/${row.id}`, { method: 'DELETE' });
        } catch {
            // Already removed from the visible list; a stale row can be removed again.
        }
    }, []);

    // The desktop shell reports tunnels that drop (server or network gone).
    useEffect(() => {
        const unsubscribe = window.electronAPI?.tunnel?.onClosed?.(({ id, reason }) => {
            if (electronTunnelIdRef.current === id) {
                electronTunnelIdRef.current = null;
                setResult(null);
                setError(`Tunnel closed: ${reason}`);
            }
            const row = sessionsRef.current.find((r) => r.electronId === id);
            if (row) void forgetSession(row);
        });
        return unsubscribe;
    }, [forgetSession]);

    /** Close the tunnel shown in the result card (desktop) and forget its row. */
    const closeElectronTunnel = () => {
        const id = electronTunnelIdRef.current;
        if (!id || !window.electronAPI?.tunnel) return;
        window.electronAPI.tunnel.close(id);
        electronTunnelIdRef.current = null;
        const row = sessionsRef.current.find((r) => r.electronId === id);
        if (row) void forgetSession(row);
    };

    // Desktop tunnels keep running when the user navigates away: they stay in
    // "Active tunnels" (here and in Settings) until closed, so several can run
    // side by side.

    /** The forwarding part of a request for the current inputs. */
    const forwardBody = () => {
        if (mode === 'local') {
            return { mode, remoteHost: remoteHost.trim(), remotePort: Number(remotePort) };
        }
        if (mode === 'dynamic') return { mode, ...(localPort && { localPort: Number(localPort) }) };
        return {
            mode,
            bindAddress,
            bindPort: Number(bindPort || 0),
            localHost: '127.0.0.1',
            localPort: Number(localPort),
        };
    };

    const open = async () => {
        setOpening(true);
        setError('');
        setResult(null);
        electronTunnelIdRef.current = null;
        const fwd = forwardBody();

        try {
            if (desktopSupports(mode)) {
                const tokenRes = await fetch('/api/connection/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ protocol: 'tunnel', serverId, ...fwd }),
                });
                const tokenData = await tokenRes.json();
                if (!tokenData.success) {
                    setError(tokenData.error || 'Failed to open tunnel');
                    return;
                }

                const bridge = await window.electronAPI!.tunnel!.open({
                    gatewayUrl: tokenData.data.gatewayUrl,
                    serverId,
                    token: tokenData.data.token,
                    mode,
                    localPort: mode === 'remote' ? undefined : Number(localPort) || undefined,
                    target:
                        mode === 'remote'
                            ? { host: '127.0.0.1', port: Number(localPort) }
                            : undefined,
                });
                if (!bridge.success) {
                    setError(bridge.error);
                    return;
                }

                electronTunnelIdRef.current = bridge.id;
                setResult({
                    mode,
                    isHttp: false,
                    electronLocalPort: bridge.localPort,
                    electronBindPort: bridge.bindPort,
                    localTarget: mode === 'remote' ? `127.0.0.1:${localPort}` : undefined,
                });

                const row = await recordTunnelSession({
                    serverId,
                    serverName,
                    mode: MODE_OF[mode],
                    ...sessionTarget(mode, fwd, bridge.bindPort),
                    kind: 'ELECTRON_LOCAL',
                    localPort: mode === 'remote' ? Number(localPort) : (bridge.localPort ?? null),
                    localHost: mode === 'remote' ? '127.0.0.1' : null,
                    electronId: bridge.id,
                });
                if (row) setActiveSessions((prev) => [row, ...prev]);
                return;
            }

            const res = await fetch('/api/tunnels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, ...fwd }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to open tunnel');
                return;
            }
            setResult({
                mode,
                ...data.data,
                localTarget: mode === 'remote' ? `127.0.0.1:${localPort}` : undefined,
            });

            const row = await recordTunnelSession({
                serverId,
                serverName,
                mode: MODE_OF[mode],
                ...sessionTarget(mode, fwd),
                kind: data.data.isHttp ? 'HTTP_PROXY' : 'BRIDGE_SCRIPT',
                localPort: mode === 'remote' ? Number(localPort) : null,
                localHost: mode === 'remote' ? '127.0.0.1' : null,
                electronId: null,
            });
            if (row) setActiveSessions((prev) => [row, ...prev]);
        } catch {
            setError('Failed to open tunnel');
        } finally {
            setOpening(false);
        }
    };

    /** Dismiss the result; a desktop tunnel shown there is closed. */
    const reset = () => {
        closeElectronTunnel();
        setResult(null);
        setError('');
    };

    /** Switch the form's mode; running tunnels are left alone. */
    const chooseMode = (m: ForwardMode) => {
        setMode(m);
        setResult(null);
        setError('');
        electronTunnelIdRef.current = null;
    };

    /** Closes/removes one row from the persisted list — a real close for a
     *  desktop tunnel, just bookkeeping cleanup for the others. */
    const closeSession = async (row: TunnelSessionRow) => {
        if (row.kind === 'ELECTRON_LOCAL' && row.electronId && window.electronAPI?.tunnel) {
            window.electronAPI.tunnel.close(row.electronId);
            if (electronTunnelIdRef.current === row.electronId) electronTunnelIdRef.current = null;
        }
        await forgetSession(row);
    };

    /** Re-derives the one-click browser link for an HTTP_PROXY row. */
    const proxyUrlFor = (row: TunnelSessionRow): string =>
        buildProxyUrl(row.serverId ?? serverId, row.remotePort, row.remoteHost);

    /** A bridge script's token is only good for 5 minutes to start it, so a
     *  saved row asks for a fresh script on demand. */
    const regenerateBridgeScript = async (row: TunnelSessionRow): Promise<string | null> => {
        try {
            const res = await fetch('/api/tunnels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId: row.serverId ?? serverId, ...rowRequest(row) }),
            });
            const data = await res.json();
            return data.success ? (data.data.bridgeScript ?? null) : null;
        } catch {
            return null;
        }
    };

    return {
        mode,
        setMode: chooseMode,
        remoteHost,
        setRemoteHost,
        remotePort,
        setRemotePort,
        bindAddress,
        setBindAddress,
        bindPort,
        setBindPort,
        localPort,
        setLocalPort,
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

/** What a saved row records as its remote side, per mode. */
function sessionTarget(
    mode: ForwardMode,
    fwd: Record<string, unknown>,
    boundPort?: number,
): { remoteHost: string; remotePort: number } {
    if (mode === 'local') {
        return { remoteHost: String(fwd.remoteHost), remotePort: Number(fwd.remotePort) };
    }
    if (mode === 'dynamic') return { remoteHost: '*', remotePort: 0 };
    return { remoteHost: String(fwd.bindAddress), remotePort: boundPort ?? Number(fwd.bindPort) };
}

/** The /api/tunnels request that recreates a saved row (for a fresh script). */
export function rowRequest(row: TunnelSessionRow): Record<string, unknown> {
    if (row.mode === 'DYNAMIC') return { mode: 'dynamic' };
    if (row.mode === 'REMOTE') {
        return {
            mode: 'remote',
            bindAddress: row.remoteHost,
            bindPort: row.remotePort,
            localHost: row.localHost ?? '127.0.0.1',
            ...(row.localPort && { localPort: row.localPort }),
        };
    }
    return { mode: 'local', remoteHost: row.remoteHost, remotePort: row.remotePort };
}
