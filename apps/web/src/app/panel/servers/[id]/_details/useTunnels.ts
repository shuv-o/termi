'use client';

import { useEffect, useRef, useState } from 'react';

export interface TunnelResult {
    isHttp: boolean;
    proxyUrl?: string;
    bridgeScript?: string;
    /** Set only in the Electron shell, which can bind a real local port. */
    electronLocalPort?: number;
}

/**
 * Port-forward tunnels: stateless — each request probes the target and hands
 * back either a one-click browser link, a copyable local-bridge script, or
 * (inside the Electron desktop shell, which can bind a real local port
 * unlike a browser tab) an actual `127.0.0.1:<port>` to point a tool at.
 */
export function useTunnels(serverId: string) {
    const [remoteHost, setRemoteHost] = useState('127.0.0.1');
    const [remotePort, setRemotePort] = useState('');
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<TunnelResult | null>(null);
    const electronTunnelIdRef = useRef<string | null>(null);

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
    };
}
