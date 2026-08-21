'use client';

import { useEffect, useRef, useState } from 'react';
import type { ServerMetrics } from '../../../../_dashboard/types';

export interface MetricPoint {
    t: number;
    cpu: number | null;
    ramPercent: number | null;
    diskPercent: number | null;
    /** bytes/sec, derived from the delta between consecutive cumulative readings */
    rxRate: number | null;
    txRate: number | null;
}

// Each poll already costs a couple of seconds (the metrics endpoint takes two
// /proc/stat samples a second apart to compute CPU%), so this is the gap
// *after* one poll finishes before the next starts — not a fixed interval.
const POLL_DELAY_MS = 2000;
const MAX_POINTS = 60;

/** Polls the server metrics endpoint while `enabled`, keeping a rolling history for charting. */
export function useLiveMetrics(serverId: string, enabled: boolean) {
    const [history, setHistory] = useState<MetricPoint[]>([]);
    const [latest, setLatest] = useState<ServerMetrics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const prevNetRef = useRef<{ t: number; rx: number; tx: number } | null>(null);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;

        const poll = async () => {
            try {
                const res = await fetch(`/api/servers/${serverId}/metrics`);
                const data = await res.json();
                if (cancelled) return;

                if (!data.success) {
                    setError(data.error || 'Failed to fetch metrics');
                    return;
                }

                const m: ServerMetrics = data.data.metrics;
                setLatest(m);
                setError(m.reachable ? (m.error ?? null) : 'Server unreachable');

                const now = Date.now();
                let rxRate: number | null = null;
                let txRate: number | null = null;
                if (m.network) {
                    const prev = prevNetRef.current;
                    if (prev && now > prev.t) {
                        const dt = (now - prev.t) / 1000;
                        rxRate = Math.max(0, (m.network.rxBytes - prev.rx) / dt);
                        txRate = Math.max(0, (m.network.txBytes - prev.tx) / dt);
                    }
                    prevNetRef.current = { t: now, rx: m.network.rxBytes, tx: m.network.txBytes };
                }

                setHistory((prev) => {
                    const next = [
                        ...prev,
                        {
                            t: now,
                            cpu: m.cpu ?? null,
                            ramPercent: m.ram?.percent ?? null,
                            diskPercent: m.disk?.percent ?? null,
                            rxRate,
                            txRate,
                        },
                    ];
                    return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
                });
            } catch {
                if (!cancelled) setError('Failed to fetch metrics');
            } finally {
                if (!cancelled) timer = setTimeout(poll, POLL_DELAY_MS);
            }
        };

        poll();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [serverId, enabled]);

    return { history, latest, error };
}
