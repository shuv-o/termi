'use client';

import { Activity, ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/format';
import { MetricSparkline } from './MetricSparkline';
import { useLiveMetrics } from './useLiveMetrics';

const CPU_COLOR = '#34d399'; // emerald-400
const RAM_COLOR = '#38bdf8'; // sky-400
const DISK_COLOR = '#a1a1aa'; // zinc-400

function MetricRow({
    label,
    valueText,
    color,
    values,
    max,
    sub,
}: {
    label: string;
    valueText: string;
    color: string;
    values: (number | null)[];
    max?: number;
    sub?: string;
}) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                    {valueText}
                </span>
            </div>
            <MetricSparkline values={values} max={max} color={color} />
            {sub && <p className="truncate text-[10px] text-muted-foreground/70">{sub}</p>}
        </div>
    );
}

export default function MetricsPanel({
    serverId,
    enabled,
    onClose,
}: {
    serverId: string;
    enabled: boolean;
    onClose: () => void;
}) {
    const { history, latest, error } = useLiveMetrics(serverId, enabled);

    const cpuValues = history.map((p) => p.cpu);
    const ramValues = history.map((p) => p.ramPercent);
    const diskValues = history.map((p) => p.diskPercent);
    const rxValues = history.map((p) => p.rxRate);
    const txValues = history.map((p) => p.txRate);
    const lastRx = rxValues.at(-1);
    const lastTx = txValues.at(-1);

    return (
        <div className="flex h-full flex-col bg-card">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    Live Metrics
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-3">
                {!latest && !error && (
                    <p className="text-xs text-muted-foreground">Collecting metrics…</p>
                )}

                {error && <p className="text-xs text-destructive">{error}</p>}

                {latest?.reachable && (
                    <>
                        <MetricRow
                            label="CPU"
                            valueText={latest.cpu != null ? `${latest.cpu}%` : '—'}
                            color={CPU_COLOR}
                            values={cpuValues}
                            max={100}
                            sub={latest.cpuModel}
                        />
                        <MetricRow
                            label="RAM"
                            valueText={latest.ram ? `${Math.round(latest.ram.percent)}%` : '—'}
                            color={RAM_COLOR}
                            values={ramValues}
                            max={100}
                            sub={
                                latest.ram
                                    ? `${formatBytes(latest.ram.usedBytes)} / ${formatBytes(latest.ram.totalBytes)}`
                                    : undefined
                            }
                        />
                        <MetricRow
                            label="Disk"
                            valueText={latest.disk ? `${Math.round(latest.disk.percent)}%` : '—'}
                            color={DISK_COLOR}
                            values={diskValues}
                            max={100}
                            sub={
                                latest.disk
                                    ? `${formatBytes(latest.disk.usedBytes)} / ${formatBytes(latest.disk.totalBytes)}`
                                    : undefined
                            }
                        />

                        <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between">
                                <span className="text-xs font-medium text-muted-foreground">
                                    Network
                                </span>
                                <span className="flex items-center gap-2 text-[11px] tabular-nums">
                                    <span
                                        className="flex items-center gap-0.5"
                                        style={{ color: CPU_COLOR }}
                                    >
                                        <ArrowDown className="h-3 w-3" />
                                        {lastRx != null ? `${formatBytes(lastRx)}/s` : '—'}
                                    </span>
                                    <span
                                        className="flex items-center gap-0.5"
                                        style={{ color: RAM_COLOR }}
                                    >
                                        <ArrowUp className="h-3 w-3" />
                                        {lastTx != null ? `${formatBytes(lastTx)}/s` : '—'}
                                    </span>
                                </span>
                            </div>
                            <MetricSparkline values={rxValues} color={CPU_COLOR} />
                            <MetricSparkline values={txValues} color={RAM_COLOR} />
                        </div>
                    </>
                )}

                {latest && !latest.reachable && (
                    <p className="text-xs text-muted-foreground">Server is unreachable.</p>
                )}
            </div>
        </div>
    );
}
