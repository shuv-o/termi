'use client';

import { Cpu, Layers, MemoryStick, Server, Wifi, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ServerItem, ServerMetrics } from './types';

/** Six-tile fleet summary across the top of the dashboard. */
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

    const highCpu = servers.filter((s) => (metrics[s.id]?.cpu ?? 0) >= 80).length;
    const highRam = servers.filter((s) => (metrics[s.id]?.ram?.percent ?? 0) >= 80).length;
    const activeSessions = sessions.length;

    if (servers.length === 0) return null;

    const statCards = [
        {
            label: 'Total Servers',
            value: String(servers.length),
            icon: Server,
            iconClassName: 'text-primary',
            iconWrapperClassName: 'bg-primary/10',
            borderClassName: 'border-l-primary/60',
            valueClassName: 'text-foreground',
        },
        {
            label: 'Online',
            value: metricsReady || online > 0 || offline > 0 ? String(online) : null,
            icon: Wifi,
            iconClassName: 'text-emerald-400',
            iconWrapperClassName: 'bg-emerald-500/10',
            borderClassName: 'border-l-emerald-400',
            valueClassName: 'text-emerald-400',
        },
        {
            label: 'Avg Latency',
            value: avgLatency != null ? `${avgLatency}ms` : null,
            icon: Zap,
            iconClassName:
                avgLatency != null && avgLatency >= 150 ? 'text-red-400' : 'text-sky-400',
            iconWrapperClassName: 'bg-sky-500/10',
            borderClassName: 'border-l-sky-400',
            valueClassName:
                avgLatency == null
                    ? 'text-foreground'
                    : avgLatency < 50
                      ? 'text-emerald-400'
                      : avgLatency < 150
                        ? 'text-amber-400'
                        : 'text-red-400',
        },
        {
            label: 'High CPU',
            value: String(highCpu),
            icon: Cpu,
            iconClassName: highCpu > 0 ? 'text-amber-400' : 'text-violet-400',
            iconWrapperClassName: 'bg-violet-500/10',
            borderClassName: 'border-l-violet-400',
            valueClassName: highCpu > 0 ? 'text-amber-400' : 'text-foreground',
        },
        {
            label: 'High RAM',
            value: String(highRam),
            icon: MemoryStick,
            iconClassName: 'text-amber-400',
            iconWrapperClassName: 'bg-amber-500/10',
            borderClassName: 'border-l-amber-400',
            valueClassName: highRam > 0 ? 'text-amber-400' : 'text-foreground',
        },
        {
            label: 'Active Sessions',
            value: String(activeSessions),
            icon: Layers,
            iconClassName: 'text-primary',
            iconWrapperClassName: 'bg-primary/10',
            borderClassName: 'border-l-primary/60',
            valueClassName: activeSessions > 0 ? 'text-primary' : 'text-foreground',
        },
    ] as const;

    return (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 xl:grid-cols-6 mb-5">
            {statCards.map((stat) => {
                const Icon = stat.icon;
                return (
                    <Card
                        key={stat.label}
                        className={`border border-border border-l-2 bg-card p-3 ${stat.borderClassName} hover:shadow-md hover:border-border/80 transition-all duration-200`}
                    >
                        <div className="flex items-center gap-2.5">
                            <div
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 ${stat.iconWrapperClassName}`}
                            >
                                <Icon className={`h-3.5 w-3.5 ${stat.iconClassName}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground leading-none">
                                    {stat.label}
                                </p>
                                {stat.label === 'Online' && offline > 0 && (
                                    <p className="text-[10px] text-red-400">{offline} offline</p>
                                )}
                                {stat.label === 'Online' && offline === 0 && unknown > 0 && (
                                    <p className="text-[10px] text-muted-foreground/70">
                                        {unknown} checking…
                                    </p>
                                )}
                                {stat.value == null ? (
                                    <Skeleton className="mt-1 h-5 w-12" />
                                ) : (
                                    <p
                                        className={`text-lg sm:text-xl font-bold tabular-nums leading-tight mt-0.5 ${stat.valueClassName}`}
                                    >
                                        {stat.value}
                                    </p>
                                )}
                            </div>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
