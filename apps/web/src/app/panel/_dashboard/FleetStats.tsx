'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { latencyTone, toneText, USAGE_WARN_PCT } from '@/lib/style/status';
import type { ServerItem, ServerMetrics } from './types';

/** Fleet summary strip across the top of the dashboard. */
export function FleetStats({
    servers,
    metrics,
    metricsLoading,
    sessions,
}: {
    servers: ServerItem[];
    metrics: Record<string, ServerMetrics | null>;
    metricsLoading: Record<string, boolean>;
    sessions: { serverId: string }[];
}) {
    const metricsReady = servers.length > 0 && !Object.values(metricsLoading).some(Boolean);

    const online = servers.filter((s) => metrics[s.id]?.reachable === true).length;
    const offline = servers.filter((s) => metrics[s.id]?.reachable === false).length;
    const unknown = servers.length - online - offline;

    const latencies = servers
        .map((s) => metrics[s.id]?.latencyMs)
        .filter((l): l is number => l != null);
    const avgLatency =
        latencies.length > 0
            ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
            : null;

    const highCpu = servers.filter((s) => (metrics[s.id]?.cpu ?? 0) >= USAGE_WARN_PCT).length;
    const highRam = servers.filter(
        (s) => (metrics[s.id]?.ram?.percent ?? 0) >= USAGE_WARN_PCT,
    ).length;
    const activeSessions = sessions.length;

    if (servers.length === 0) return null;

    const latencyClass = avgLatency == null ? 'text-foreground' : toneText[latencyTone(avgLatency)];

    // One instrument strip rather than six identical tiles: each cell is a
    // reading, separated by hairlines, and only a reading that needs attention
    // gets colour.
    const cells: {
        label: string;
        value: string | null;
        valueClassName: string;
        note?: { text: string; className: string };
    }[] = [
        { label: 'Servers', value: String(servers.length), valueClassName: 'text-foreground' },
        {
            label: 'Online',
            value: metricsReady || online > 0 || offline > 0 ? String(online) : null,
            valueClassName: online > 0 ? 'text-success' : 'text-foreground',
            note:
                offline > 0
                    ? { text: `${offline} offline`, className: 'text-danger' }
                    : unknown > 0
                      ? { text: `${unknown} checking`, className: 'text-muted-foreground' }
                      : undefined,
        },
        {
            label: 'Avg latency',
            value: avgLatency != null ? `${avgLatency} ms` : null,
            valueClassName: latencyClass,
        },
        {
            label: 'High CPU',
            value: String(highCpu),
            valueClassName: highCpu > 0 ? 'text-warning' : 'text-foreground',
        },
        {
            label: 'High memory',
            value: String(highRam),
            valueClassName: highRam > 0 ? 'text-warning' : 'text-foreground',
        },
        {
            label: 'Open sessions',
            value: String(activeSessions),
            valueClassName: activeSessions > 0 ? 'text-primary' : 'text-foreground',
        },
    ];

    return (
        <Card className="grid grid-cols-3 overflow-hidden xl:grid-cols-6">
            {cells.map((cell, i) => (
                <div
                    key={cell.label}
                    className={`min-w-0 px-3 py-3 sm:px-4 sm:py-3.5 ${i % 3 !== 0 ? 'border-l border-border' : ''} ${i >= 3 ? 'border-t border-border xl:border-t-0' : ''} ${i === 3 ? 'xl:border-l' : ''}`}
                >
                    <p className="truncate text-xs text-muted-foreground">{cell.label}</p>
                    {cell.value == null ? (
                        <Skeleton className="mt-1.5 h-6 w-12" />
                    ) : (
                        <p
                            className={`mt-0.5 text-xl font-semibold leading-tight tabular-nums tracking-[-0.01em] sm:text-[22px] ${cell.valueClassName}`}
                        >
                            {cell.value}
                        </p>
                    )}
                    {cell.note && (
                        <p className={`truncate text-[11px] ${cell.note.className}`}>
                            {cell.note.text}
                        </p>
                    )}
                </div>
            ))}
        </Card>
    );
}
