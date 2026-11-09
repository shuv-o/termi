'use client';

import { useEffect, useMemo, useState } from 'react';
import { deviceGatewayAvailable, requestConnection } from '@/lib/gateway/connect';
import { deviceTransport, serverTransport, type FileTransport } from './transport';

/**
 * The transport for this server's file manager. In the desktop app, the
 * user's own servers set to connect from this computer use the app's
 * gateway; everything else (and an "Automatic" server the app can't reach)
 * goes through the Termi server.
 */
export function useFileTransport(serverId: string): {
    transport: FileTransport | null;
    error: string | null;
} {
    const [state, setState] = useState<{
        serverId: string;
        transport: FileTransport | null;
        error: string | null;
    }>({ serverId, transport: null, error: null });

    const viaServer = useMemo(() => serverTransport(serverId), [serverId]);

    useEffect(() => {
        if (!deviceGatewayAvailable()) return;
        let cancelled = false;
        let opened: FileTransport | null = null;
        const settle = (transport: FileTransport | null, error: string | null) => {
            if (cancelled) transport?.close();
            else setState({ serverId, transport, error });
        };
        (async () => {
            let grant;
            try {
                grant = await requestConnection({ serverId, protocol: 'scp' });
            } catch {
                return settle(viaServer, null);
            }
            if (grant.via !== 'device') return settle(viaServer, null);
            try {
                opened = await deviceTransport(grant, serverId);
                settle(opened, null);
            } catch (err) {
                if (grant.fallback) settle(viaServer, null);
                else settle(null, (err as Error).message);
            }
        })();
        return () => {
            cancelled = true;
            opened?.close();
        };
    }, [serverId, viaServer]);

    // Outside the desktop app there is nothing to decide.
    if (!deviceGatewayAvailable()) return { transport: viaServer, error: null };
    if (state.serverId !== serverId) return { transport: null, error: null };
    return { transport: state.transport, error: state.error };
}
