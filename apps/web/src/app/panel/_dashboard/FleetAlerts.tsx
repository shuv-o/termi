'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, WifiOff } from 'lucide-react';
import type { ServerItem, ServerMetrics } from './types';

/** Collapsible banner listing offline and high-load servers. */
export function FleetAlerts({
    servers,
    metrics,
    onSelectServer,
}: {
    servers: ServerItem[];
    metrics: Record<string, ServerMetrics | null>;
    onSelectServer: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    const offline = servers.filter((s) => metrics[s.id]?.reachable === false);
    const highLoad = servers.filter((s) => {
        const m = metrics[s.id];
        return m?.reachable && ((m.cpu ?? 0) >= 90 || (m.ram?.percent ?? 0) >= 90);
    });
    const total = offline.length + highLoad.length;

    if (total === 0) return null;

    return (
        <div className="mb-5 rounded-lg border border-border bg-card overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                aria-expanded={expanded}
            >
                <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                </span>
                <span className="text-sm font-medium text-foreground shrink-0">
                    {total} {total === 1 ? 'server needs' : 'servers need'} attention
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                    {offline.length > 0 && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                            <WifiOff className="w-2.5 h-2.5" />
                            {offline.length} offline
                        </span>
                    )}
                    {highLoad.length > 0 && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {highLoad.length} high load
                        </span>
                    )}
                </div>
                <ChevronDown
                    className={`w-4 h-4 ml-auto text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
            </button>
            {expanded && (
                <div className="border-t border-border max-h-64 overflow-y-auto divide-y divide-border/60">
                    {offline.map((s) => (
                        <div
                            key={s.id}
                            className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-red-500/5 transition-colors"
                            onClick={() => onSelectServer(s.id)}
                        >
                            <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            <span className="font-medium text-red-400 truncate">{s.name}</span>
                            <span className="text-red-400/50 text-xs shrink-0 hidden sm:inline">
                                offline
                            </span>
                            <span className="ml-auto text-[10px] text-muted-foreground/40 font-mono hidden sm:block shrink-0">
                                {s.host}
                            </span>
                        </div>
                    ))}
                    {highLoad.map((s) => {
                        const m = metrics[s.id]!;
                        return (
                            <div
                                key={s.id}
                                className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-amber-500/5 transition-colors"
                                onClick={() => onSelectServer(s.id)}
                            >
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="font-medium text-amber-300 truncate">
                                    {s.name}
                                </span>
                                <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground/60 shrink-0">
                                    {(m.cpu ?? 0) >= 90 && <span>CPU {m.cpu}%</span>}
                                    {(m.ram?.percent ?? 0) >= 90 && (
                                        <span>RAM {Math.round(m.ram!.percent)}%</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
