'use client';

import { Cpu, HardDrive, MemoryStick, Server, Wifi, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatBytes } from '@/lib/format';
import {
    scoreBarColor,
    scoreBg,
    scoreColor,
    type BenchmarkHardwareInfo,
    type BenchmarkCpuResult,
    type BenchmarkNetworkResult,
    type BenchmarkScores,
    type BenchmarkThroughput,
} from './types';

function ScoreBadge({ score }: { score: number }) {
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-sm font-bold tabular-nums ${scoreColor(score)} ${scoreBg(score)}`}
        >
            {score}
        </span>
    );
}

/** Grey box with a small caption above a figure — the benchmark's unit cell. */
function StatBox({
    label,
    children,
    sub,
    className = '',
    size = 'lg',
}: {
    label: string;
    children: React.ReactNode;
    sub?: React.ReactNode;
    className?: string;
    size?: 'base' | 'lg' | 'sm';
}) {
    const valueClass =
        size === 'lg'
            ? 'text-lg font-bold tabular-nums text-foreground'
            : size === 'base'
              ? 'text-base font-bold tabular-nums text-foreground'
              : 'text-sm font-semibold text-foreground';
    return (
        <div
            className={`rounded-lg bg-secondary/60 border border-border/50 px-3 py-2 ${className}`}
        >
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                {label}
            </p>
            <p className={valueClass}>{children}</p>
            {sub}
        </div>
    );
}

function Unit({ children }: { children: string }) {
    return <span className="text-xs font-normal text-muted-foreground ml-1">{children}</span>;
}

/** Section header used by each benchmark result card. */
function ResultHeader({
    icon: Icon,
    iconClass,
    title,
    note,
    score,
}: {
    icon: React.ElementType;
    iconClass: string;
    title: string;
    note?: string;
    score?: number;
}) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <Icon className={`w-4 h-4 ${iconClass}`} />
            <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                {title}
            </span>
            {note && <span className="text-[10px] text-muted-foreground ml-1">{note}</span>}
            {score !== undefined && (
                <div className="ml-auto">
                    <ScoreBadge score={score} />
                </div>
            )}
        </div>
    );
}

export function ScoreSummaryCard({ scores }: { scores: BenchmarkScores }) {
    const breakdown = [
        { label: 'CPU', score: scores.cpu },
        { label: 'RAM', score: scores.ram },
        { label: 'Disk', score: scores.disk },
        { label: 'Network', score: scores.network },
    ];

    return (
        <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">
                    Benchmark Score
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                    scored vs. high-end server reference
                </span>
            </div>
            <div className="flex items-center justify-center mb-4">
                <div
                    className={`flex flex-col items-center px-8 py-4 rounded-2xl border-2 ${scoreBg(scores.overall)}`}
                >
                    <span
                        className={`text-5xl font-black tabular-nums ${scoreColor(scores.overall)}`}
                    >
                        {scores.overall}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                        Overall
                    </span>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
                {breakdown.map(({ label, score }) => (
                    <div
                        key={label}
                        className="flex flex-col items-center gap-1.5 rounded-lg bg-secondary/60 border border-border/50 py-3"
                    >
                        <span className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>
                            {score}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {label}
                        </span>
                        <div className="w-full px-3">
                            <div className="h-1 rounded-full bg-secondary">
                                <div
                                    className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
                                    style={{ width: `${score / 10}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

export function HardwareCard({ hardware }: { hardware: BenchmarkHardwareInfo }) {
    const baseGhz = hardware.cpuBaseFreqMhz
        ? `${(hardware.cpuBaseFreqMhz / 1000).toFixed(2)} GHz base`
        : '';
    const boostGhz = hardware.cpuFreqMhz
        ? `${(hardware.cpuFreqMhz / 1000).toFixed(2)} GHz boost`
        : '';
    const separator = hardware.cpuBaseFreqMhz && hardware.cpuFreqMhz ? ' · ' : '';

    return (
        <Card className="p-4">
            <ResultHeader icon={Server} iconClass="text-muted-foreground" title="Hardware" />
            <div className="flex flex-wrap gap-2">
                <StatBox
                    label="CPU"
                    size="sm"
                    className="flex-1 min-w-[200px]"
                    sub={
                        <>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                {hardware.cpuCores}C / {hardware.cpuThreads}T{' · '}
                                {hardware.arch}
                            </p>
                            {(hardware.cpuFreqMhz || hardware.cpuBaseFreqMhz) && (
                                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                                    {baseGhz}
                                    {separator}
                                    {boostGhz}
                                </p>
                            )}
                        </>
                    }
                >
                    <span className="truncate block">{hardware.cpuModel}</span>
                </StatBox>
                <StatBox label="RAM" size="sm" className="min-w-[100px]">
                    {formatBytes(hardware.ramTotalBytes)}
                </StatBox>
                <StatBox
                    label="Disk"
                    size="sm"
                    className="min-w-[130px]"
                    sub={
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatBytes(hardware.diskUsedBytes)} used
                        </p>
                    }
                >
                    {formatBytes(hardware.diskTotalBytes)}
                </StatBox>
                <StatBox label="OS" size="sm" className="flex-1 min-w-[120px]">
                    <span className="truncate block">{hardware.os}</span>
                </StatBox>
            </div>
        </Card>
    );
}

export function CpuResultCard({
    cpu,
    threads,
}: {
    cpu: BenchmarkCpuResult;
    threads: number | undefined;
}) {
    const scaling =
        cpu.singleCoreMBps > 0
            ? ` · ${(cpu.multiCoreMBps / cpu.singleCoreMBps).toFixed(1)}× scaling`
            : '';

    return (
        <Card className="p-4">
            <ResultHeader
                icon={Cpu}
                iconClass="text-violet-400"
                title="CPU Performance"
                note="SHA-256"
                score={cpu.score}
            />
            <div className="grid grid-cols-2 gap-2">
                <StatBox
                    label="Single-Core"
                    sub={<p className="text-[10px] text-muted-foreground/40 mt-0.5">1 thread</p>}
                >
                    {cpu.singleCoreMBps.toLocaleString()}
                    <Unit>MB/s</Unit>
                </StatBox>
                <StatBox
                    label="Multi-Core"
                    sub={
                        threads !== undefined ? (
                            <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                                {threads} threads
                                {scaling}
                            </p>
                        ) : undefined
                    }
                >
                    {cpu.multiCoreMBps.toLocaleString()}
                    <Unit>MB/s</Unit>
                </StatBox>
            </div>
        </Card>
    );
}

/** Read/write throughput card — used for both the RAM and disk stages. */
function ThroughputCard({
    icon,
    iconClass,
    title,
    result,
}: {
    icon: React.ElementType;
    iconClass: string;
    title: string;
    result: BenchmarkThroughput;
}) {
    const figure = (mbps: number) =>
        mbps > 0 ? (
            <>
                {mbps.toLocaleString()}
                <Unit>MB/s</Unit>
            </>
        ) : (
            '—'
        );

    return (
        <Card className="p-4">
            <ResultHeader icon={icon} iconClass={iconClass} title={title} score={result.score} />
            <div className="grid grid-cols-2 gap-2">
                <StatBox label="Write" size="base">
                    {figure(result.writeMBps)}
                </StatBox>
                <StatBox label="Read" size="base">
                    {figure(result.readMBps)}
                </StatBox>
            </div>
        </Card>
    );
}

export function RamResultCard({ ram }: { ram: BenchmarkThroughput }) {
    return (
        <ThroughputCard
            icon={MemoryStick}
            iconClass="text-amber-400"
            title="RAM Bandwidth"
            result={ram}
        />
    );
}

export function DiskResultCard({ disk }: { disk: BenchmarkThroughput }) {
    return (
        <ThroughputCard
            icon={HardDrive}
            iconClass="text-rose-400"
            title="Disk Speed"
            result={disk}
        />
    );
}

export function NetworkResultCard({ network }: { network: BenchmarkNetworkResult }) {
    return (
        <Card className="p-4">
            <ResultHeader
                icon={Wifi}
                iconClass="text-primary"
                title="Network"
                score={network.score}
            />
            <div className="grid grid-cols-2 gap-2">
                <StatBox label="Latency (ping 1.1.1.1)" size="base">
                    {network.pingMs != null ? (
                        <>
                            {network.pingMs.toFixed(1)}
                            <Unit>ms</Unit>
                        </>
                    ) : (
                        <span className="text-muted-foreground">Unreachable</span>
                    )}
                </StatBox>
                <StatBox
                    label="Loopback Bandwidth"
                    size="base"
                    sub={
                        <p className="text-[10px] text-muted-foreground/40 mt-0.5">
                            OS kernel socket speed
                        </p>
                    }
                >
                    {network.loopbackMBps != null ? (
                        <>
                            {network.loopbackMBps.toLocaleString()}
                            <Unit>MB/s</Unit>
                        </>
                    ) : (
                        <span className="text-muted-foreground">N/A</span>
                    )}
                </StatBox>
            </div>
        </Card>
    );
}
