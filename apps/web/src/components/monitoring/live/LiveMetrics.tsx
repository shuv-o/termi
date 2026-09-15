'use client';

import { Activity, ArrowDown, ArrowUp, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/format';
import { toneText, usageTone } from '@/lib/status-style';
import { cn } from '@/lib/utils';
import { LiveSparkline } from './LiveSparkline';
import { useLiveMetrics, type MetricPoint } from './useLiveMetrics';
import type { ServerMetrics } from '@/app/panel/_dashboard/types';

// Canvas/SVG strokes need literal colours, so these mirror --success / --info
// from globals.css (the same pair the dashboard CPU/RAM gauges use).
const CPU_COLOR = '#34d399'; // --success
const RAM_COLOR = '#38bdf8'; // --info
const DISK_COLOR = '#a1a1aa'; // zinc-400

function MetricRow({
    label,
    valueText,
    /** Percentage reading, used to tone the value text once it crosses a threshold. */
    percent,
    color,
    values,
    max,
    sub,
}: {
    label: string;
    valueText: string;
    percent?: number | null;
    color: string;
    values: (number | null)[];
    max?: number;
    sub?: string;
}) {
    // Under the warning threshold the value keeps its series colour, so the
    // three rows stay visually distinct; past it, it switches to the shared
    // warning/danger tone — the same crossover the dashboard gauges use.
    const tone = percent != null ? usageTone(percent) : 'success';
    const toneClass = tone === 'success' ? undefined : toneText[tone];

    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span
                    className={cn('text-sm font-semibold tabular-nums', toneClass)}
                    style={toneClass ? undefined : { color }}
                >
                    {valueText}
                </span>
            </div>
            <LiveSparkline values={values} max={max} color={color} />
            {sub && <p className="truncate text-[10px] text-muted-foreground/70">{sub}</p>}
        </div>
    );
}

/**
 * The metric rows themselves, with no surrounding chrome.
 *
 * Split out from the panel so the terminal session's side panel and the server
 * detail page's monitoring card show exactly the same readings, laid out the
 * same way, rather than each drawing its own take on "CPU, RAM, disk, network".
 */
export function LiveMetricsBody({
    history,
    latest,
    error,
    idle = false,
    className,
}: {
    history: MetricPoint[];
    latest: ServerMetrics | null;
    error: string | null;
    /** Polling is switched off — say so rather than showing a permanent spinner. */
    idle?: boolean;
    className?: string;
}) {
    const cpuValues = history.map((p) => p.cpu);
    const ramValues = history.map((p) => p.ramPercent);
    const diskValues = history.map((p) => p.diskPercent);
    const rxValues = history.map((p) => p.rxRate);
    const txValues = history.map((p) => p.txRate);
    const lastRx = rxValues.at(-1);
    const lastTx = txValues.at(-1);

    if (idle && !latest) {
        return (
            <div className={cn('space-y-5', className)}>
                <p className="text-xs text-muted-foreground">
                    Live polling is off. Start it to stream CPU, memory, disk and network from this
                    server.
                </p>
            </div>
        );
    }

    return (
        <div className={cn('space-y-5', className)}>
            {!latest && !error && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Collecting metrics…
                </p>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            {latest?.reachable && (
                <>
                    <MetricRow
                        label="CPU"
                        valueText={latest.cpu != null ? `${latest.cpu}%` : '—'}
                        percent={latest.cpu}
                        color={CPU_COLOR}
                        values={cpuValues}
                        max={100}
                        sub={latest.cpuModel}
                    />
                    <MetricRow
                        label="Memory"
                        valueText={latest.ram ? `${Math.round(latest.ram.percent)}%` : '—'}
                        percent={latest.ram?.percent}
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
                        percent={latest.disk?.percent}
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
                        <div className="flex items-baseline justify-between gap-2">
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
                        <LiveSparkline values={rxValues} color={CPU_COLOR} />
                        <LiveSparkline values={txValues} color={RAM_COLOR} />
                    </div>
                </>
            )}

            {latest && !latest.reachable && (
                <p className="text-xs text-muted-foreground">Server is unreachable.</p>
            )}
        </div>
    );
}

/**
 * Live metrics as a closable side panel — the form used inside a terminal
 * session, alongside the file manager.
 */
export function LiveMetricsPanel({
    serverId,
    enabled,
    onClose,
}: {
    serverId: string;
    enabled: boolean;
    onClose: () => void;
}) {
    const { history, latest, error } = useLiveMetrics(serverId, enabled);

    return (
        <div className="flex h-full flex-col bg-card">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    Live Metrics
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={onClose}
                    aria-label="Close live metrics"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                <LiveMetricsBody history={history} latest={latest} error={error} />
            </div>
        </div>
    );
}
