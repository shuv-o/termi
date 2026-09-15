'use client';

import { useEffect, useState } from 'react';
import { Activity, Pause, Play, Radio } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LiveMetricsBody } from '@/components/monitoring/live/LiveMetrics';
import { useLiveMetrics } from '@/components/monitoring/live/useLiveMetrics';
import { formatBytes } from '@/lib/format';
import { toneText, usageTone } from '@/lib/status-style';

function Reading({
    label,
    value,
    sub,
    tone,
}: {
    label: string;
    value: string;
    sub?: string;
    tone?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border/50 bg-secondary/60 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            <span className={`text-lg font-bold tabular-nums ${tone ?? 'text-foreground'}`}>
                {value}
            </span>
            {sub && <span className="truncate text-[10px] text-muted-foreground">{sub}</span>}
        </div>
    );
}

/**
 * Live, second-by-second readings for this server.
 *
 * The rest of this page is *historical*: the health-check cron writes a row
 * every few minutes, so the charts above answer "has this box been healthy
 * lately". They cannot answer "what is it doing right now", which is the
 * question you actually have when you have just been paged — and the only
 * place that answer existed was a side panel inside an SSH terminal.
 *
 * Each poll opens an SSH channel and samples /proc twice a second apart, so
 * this deliberately does not run unattended: it pauses when the browser tab is
 * hidden, and can be paused by hand.
 */
export function LiveMonitoringSection({ serverId }: { serverId: string }) {
    const [running, setRunning] = useState(true);
    const [tabVisible, setTabVisible] = useState(true);

    // Switching to another browser tab should not keep an SSH channel cycling
    // on this server; resume automatically on return so it behaves like a
    // dashboard rather than something you have to re-arm.
    useEffect(() => {
        const sync = () => setTabVisible(document.visibilityState === 'visible');
        sync();
        document.addEventListener('visibilitychange', sync);
        return () => document.removeEventListener('visibilitychange', sync);
    }, []);

    const enabled = running && tabVisible;
    const { history, latest, error } = useLiveMetrics(serverId, enabled);

    const cpu = latest?.cpu;
    const ram = latest?.ram;
    const disk = latest?.disk;

    return (
        <Card className="p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold">Live monitoring</h2>
                    {enabled && latest?.reachable && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-success">
                            <Radio className="h-3 w-3 animate-pulse" />
                            Live
                        </span>
                    )}
                    {!enabled && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Paused
                        </span>
                    )}
                </div>

                <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setRunning((r) => !r)}
                >
                    {running ? (
                        <>
                            <Pause className="h-3.5 w-3.5" /> Pause
                        </>
                    ) : (
                        <>
                            <Play className="h-3.5 w-3.5" /> Resume
                        </>
                    )}
                </Button>
            </div>

            {latest?.reachable && (
                <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Reading
                        label="CPU"
                        value={cpu != null ? `${cpu}%` : '—'}
                        sub={latest.cpuModel}
                        tone={cpu != null ? toneText[usageTone(cpu)] : undefined}
                    />
                    <Reading
                        label="Memory"
                        value={ram ? `${Math.round(ram.percent)}%` : '—'}
                        sub={
                            ram
                                ? `${formatBytes(ram.usedBytes)} / ${formatBytes(ram.totalBytes)}`
                                : undefined
                        }
                        tone={ram ? toneText[usageTone(ram.percent)] : undefined}
                    />
                    <Reading
                        label="Disk"
                        value={disk ? `${Math.round(disk.percent)}%` : '—'}
                        sub={
                            disk
                                ? `${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`
                                : undefined
                        }
                        tone={disk ? toneText[usageTone(disk.percent)] : undefined}
                    />
                    <Reading
                        label="Latency"
                        value={latest.latencyMs != null ? `${latest.latencyMs}ms` : '—'}
                    />
                </div>
            )}

            <LiveMetricsBody
                history={history}
                latest={latest}
                error={error}
                idle={!enabled}
                className="max-w-2xl"
            />

            <p className="mt-4 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                Sampled over SSH roughly every few seconds while this tab is open. The charts above
                come from scheduled health checks and persist between visits; this one does not.
            </p>
        </Card>
    );
}
