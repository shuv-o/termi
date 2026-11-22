'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import type { LiveConnectionItem } from '@/lib/connections/describe';

const REFRESH_MS = 5_000;

/**
 * The user's open connections (GET /api/connections), refreshed while the
 * page is visible, and closing them. `serverId` keeps one server's.
 */
export function useLiveConnections(serverId?: string) {
    const { toast } = useToast();
    const [items, setItems] = useState<LiveConnectionItem[] | null>(null);
    const [tracking, setTracking] = useState(true);
    const [busy, setBusy] = useState(false);
    const url = serverId
        ? `/api/connections?serverId=${encodeURIComponent(serverId)}`
        : '/api/connections';

    const load = useCallback(async () => {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            const data = await res.json();
            if (!data.success) return;
            setItems(data.data.connections);
            setTracking(data.data.tracking);
        } catch {
            /* keeps the last list; the next refresh tries again */
        }
    }, [url]);

    useEffect(() => {
        void load();
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') void load();
        }, REFRESH_MS);
        const onVisible = () => document.visibilityState === 'visible' && void load();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [load]);

    /** Asks for these to be closed; they show as closing until the gateway does it. */
    const close = useCallback(
        async (ids: string[]) => {
            if (!ids.length) return;
            setBusy(true);
            try {
                const res = await fetch('/api/connections/close', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids }),
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Could not close');
                const closing = new Set<string>(data.data.closing);
                setItems(
                    (prev) =>
                        prev?.map((c) => (closing.has(c.id) ? { ...c, closing: true } : c)) ?? prev,
                );
                if (closing.size > 1) toast('success', `Closing ${closing.size} connections…`);
            } catch (err) {
                toast('error', (err as Error).message || 'Could not close the connection');
            } finally {
                setBusy(false);
            }
        },
        [toast],
    );

    return { items, tracking, busy, close, reload: load };
}
