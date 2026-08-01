'use client';

import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw, Wifi } from 'lucide-react';
import MetricSparkline from '@/components/monitoring/MetricSparkline';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { HealthRecord } from './types';

/** One sparkline card: icon, latest reading, and the trend line. */
function MetricCard({
    icon: Icon,
    iconClass,
    label,
    value,
    alert,
    data,
    color,
    alertThreshold,
    children,
}: {
    icon: React.ElementType;
    iconClass: string;
    label: string;
    value: string;
    alert?: boolean;
    data: (number | null)[];
    color: string;
    alertThreshold?: number;
    children?: React.ReactNode;
}) {
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${iconClass}`} />
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                </div>
                <span
                    className={`text-lg font-bold tabular-nums ${alert ? 'text-red-400' : 'text-foreground'}`}
                >
                    {value}
                </span>
            </div>
            <MetricSparkline
                data={data}
                color={color}
                height={44}
                alertThreshold={alertThreshold}
            />
            {children}
        </Card>
    );
}

const pct = (v: number | null | undefined) => (v != null ? `${Math.round(v)}%` : '—');

export function HealthHistorySection({
    records,
    lastRecord,
    upCount,
    isSSH,
    refreshing,
    onRefresh,
}: {
    records: HealthRecord[];
    lastRecord: HealthRecord | undefined;
    upCount: number;
    isSSH: boolean;
    refreshing: boolean;
    onRefresh: () => void;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Health History
                    <span className="text-[10px] text-muted-foreground font-normal">
                        ({records.length} records)
                    </span>
                </h2>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="h-8 w-8"
                    title="Refresh"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {records.length === 0 ? (
                <Card className="p-8 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No health data yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                        Enable monitoring below to start collecting data
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <MetricCard
                        icon={Wifi}
                        iconClass="text-primary"
                        label="Latency"
                        value={lastRecord?.latencyMs != null ? `${lastRecord.latencyMs}ms` : '—'}
                        data={records.map((r) => (r.reachable ? (r.latencyMs ?? null) : null))}
                        color="#38bdf8"
                    >
                        <div className="mt-3 pt-3 border-t border-border/50">
                            {/* Up/down strip for the most recent checks. */}
                            <div className="flex gap-0.5 h-3 rounded overflow-hidden">
                                {records.slice(-40).map((r, i) => (
                                    <div
                                        key={i}
                                        className={`flex-1 rounded-sm ${r.reachable ? 'bg-emerald-500' : 'bg-red-500'}`}
                                        title={`${new Date(r.checkedAt).toLocaleTimeString()} — ${r.reachable ? 'Up' : 'Down'}`}
                                    />
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Uptime: {upCount}/{records.length} checks
                            </p>
                        </div>
                    </MetricCard>

                    {/* CPU/RAM/disk readings only exist for SSH servers. */}
                    {isSSH && (
                        <>
                            <MetricCard
                                icon={Cpu}
                                iconClass="text-violet-400"
                                label="CPU"
                                value={pct(lastRecord?.cpuPercent)}
                                alert={(lastRecord?.cpuPercent ?? 0) >= 90}
                                data={records.map((r) => r.cpuPercent)}
                                color="#a78bfa"
                                alertThreshold={90}
                            />
                            <MetricCard
                                icon={MemoryStick}
                                iconClass="text-amber-400"
                                label="RAM"
                                value={pct(lastRecord?.ramPercent)}
                                alert={(lastRecord?.ramPercent ?? 0) >= 90}
                                data={records.map((r) => r.ramPercent)}
                                color="#fbbf24"
                                alertThreshold={90}
                            />
                            <MetricCard
                                icon={HardDrive}
                                iconClass="text-rose-400"
                                label="Disk"
                                value={pct(lastRecord?.diskPercent)}
                                alert={(lastRecord?.diskPercent ?? 0) >= 90}
                                data={records.map((r) => r.diskPercent)}
                                color="#fb7185"
                                alertThreshold={90}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
