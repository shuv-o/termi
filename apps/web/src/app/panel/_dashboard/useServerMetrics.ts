'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ServerItem, ServerMetrics } from './types';

const METRICS_TTL = 30_000;

/**
 * Server metrics, cached at module scope so they survive this page unmounting.
 *
 * Previously this was a `useRef` inside the component, which meant navigating
 * away and back threw every reading away and re-showed empty metric tiles while
 * they refetched. Keeping it here lets a return visit paint the last known
 * values instantly and refresh only what has gone stale.
 */
const metricsCache: Record<string, { data: ServerMetrics; fetchedAt: number }> = {};

/** Polls `/metrics` for each server, honouring the module-level TTL cache. */
export function useServerMetrics(servers: ServerItem[]) {
    const [metrics, setMetrics] = useState<Record<string, ServerMetrics | null>>({});
    const [metricsLoading, setMetricsLoading] = useState<Record<string, boolean>>({});

    const fetchMetrics = useCallback(async (serverList: ServerItem[], force = false) => {
        if (serverList.length === 0) return;
        const now = Date.now();

        serverList.forEach((s) => {
            const cached = metricsCache[s.id];
            if (cached && now - cached.fetchedAt < METRICS_TTL) {
                setMetrics((prev) => ({ ...prev, [s.id]: cached.data }));
            }
        });

        const toFetch = serverList.filter((s) => {
            const cached = metricsCache[s.id];
            return force || !cached || now - cached.fetchedAt >= METRICS_TTL;
        });
        if (toFetch.length === 0) return;

        const ls: Record<string, boolean> = {};
        toFetch.forEach((s) => {
            ls[s.id] = true;
        });
        setMetricsLoading(ls);

        await Promise.all(
            toFetch.map(async (server, i) => {
                // Stagger the probes so a large fleet doesn't open every SSH
                // connection at once.
                await new Promise((r) => setTimeout(r, i * 80));
                try {
                    const res = await fetch(`/api/servers/${server.id}/metrics`);
                    const data = await res.json();
                    if (data.success) {
                        metricsCache[server.id] = {
                            data: data.data.metrics,
                            fetchedAt: Date.now(),
                        };
                        setMetrics((prev) => ({ ...prev, [server.id]: data.data.metrics }));
                    }
                } catch {
                    setMetrics((prev) => ({ ...prev, [server.id]: null }));
                } finally {
                    setMetricsLoading((prev) => ({ ...prev, [server.id]: false }));
                }
            }),
        );
    }, []);

    useEffect(() => {
        if (servers.length > 0) fetchMetrics(servers);
    }, [servers, fetchMetrics]);

    useEffect(() => {
        if (servers.length === 0) return;
        const id = setInterval(() => fetchMetrics(servers), METRICS_TTL);
        return () => clearInterval(id);
    }, [servers, fetchMetrics]);

    /** Drops a deleted server's readings so stale tiles don't linger. */
    const forgetServer = useCallback((serverId: string) => {
        setMetrics((prev) => {
            const next = { ...prev };
            delete next[serverId];
            return next;
        });
    }, []);

    return { metrics, metricsLoading, fetchMetrics, forgetServer };
}
