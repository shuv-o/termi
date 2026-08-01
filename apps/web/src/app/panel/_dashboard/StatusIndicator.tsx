'use client';

import { Wifi, WifiOff } from 'lucide-react';
import type { ServerMetrics } from './types';

/** Compact reachability dot / latency badge used by the list view. */
export function StatusIndicator({
    metrics,
    loading,
}: {
    metrics: ServerMetrics | null;
    loading: boolean;
}) {
    if (loading)
        return (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
            </span>
        );
    if (!metrics) return null;
    if (!metrics.reachable)
        return (
            <span className="flex items-center gap-1">
                <WifiOff className="w-3 h-3 text-red-400" />
            </span>
        );
    return (
        <span className="flex items-center gap-1">
            <Wifi className="w-3 h-3 text-emerald-400" />
            {metrics.latencyMs != null && (
                <span className="text-[10px] text-emerald-400 tabular-nums">
                    {metrics.latencyMs}ms
                </span>
            )}
        </span>
    );
}
