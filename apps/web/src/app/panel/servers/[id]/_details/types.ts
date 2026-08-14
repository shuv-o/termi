export { protocolIcons, protocolColors } from '@/lib/protocol-style';

export interface ServerInfo {
    id: string;
    name: string;
    description?: string | null;
    host: string;
    port: number;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC' | 'TELNET';
    tags: string[];
    isFavorite: boolean;
    lastUsedAt: string | null;
    group: { id: string; name: string; color: string | null } | null;
}

export type WebhookPlatform = 'SLACK' | 'DISCORD' | 'GENERIC';

export interface MonitorConfig {
    enabled: boolean;
    checkIntervalMinutes: number;
    alertEmail: boolean;
    alertPush: boolean;
    webhookEnabled: boolean;
    webhookPlatform: WebhookPlatform | null;
    /** Whether a webhook URL is already stored — the URL itself is never sent to the client. */
    webhookConfigured: boolean;
    failureThreshold: number;
    consecutiveFailures: number;
    alertSent: boolean;
    lastCheckedAt: string | null;
    lastStatus: boolean;
}

export interface HealthRecord {
    reachable: boolean;
    latencyMs: number | null;
    cpuPercent: number | null;
    ramPercent: number | null;
    diskPercent: number | null;
    checkedAt: string;
}

export type CheckInterval = 1 | 5 | 10 | 15 | 30 | 60;

export interface MonitorFormValues {
    enabled: boolean;
    checkIntervalMinutes: CheckInterval;
    alertEmail: boolean;
    alertPush: boolean;
    webhookEnabled: boolean;
    webhookPlatform: WebhookPlatform;
    /** A new URL to save. Blank means "leave the stored webhook unchanged". */
    webhookUrl: string;
    failureThreshold: number;
}

export const WEBHOOK_PLATFORMS: { value: WebhookPlatform; label: string }[] = [
    { value: 'SLACK', label: 'Slack' },
    { value: 'DISCORD', label: 'Discord' },
    { value: 'GENERIC', label: 'Generic' },
];

export const INTERVALS: { value: CheckInterval; label: string }[] = [
    { value: 1, label: 'Every 1 min' },
    { value: 5, label: 'Every 5 min' },
    { value: 10, label: 'Every 10 min' },
    { value: 15, label: 'Every 15 min' },
    { value: 30, label: 'Every 30 min' },
    { value: 60, label: 'Every hour' },
];

//  Benchmark

export interface BenchmarkHardwareInfo {
    cpuModel: string;
    cpuCores: number;
    cpuThreads: number;
    cpuFreqMhz: number | null;
    cpuBaseFreqMhz: number | null;
    arch: string;
    ramTotalBytes: number;
    diskTotalBytes: number;
    diskUsedBytes: number;
    os: string;
}

export interface BenchmarkCpuResult {
    singleCoreMBps: number;
    multiCoreMBps: number;
    score: number;
}

export interface BenchmarkNetworkResult {
    pingMs: number | null;
    loopbackMBps: number | null;
    score: number;
}

export interface BenchmarkScores {
    cpu: number;
    ram: number;
    disk: number;
    network: number;
    overall: number;
}

/** Read/write throughput pair used for both the RAM and disk stages. */
export interface BenchmarkThroughput {
    writeMBps: number;
    readMBps: number;
    score: number;
}

export interface BenchmarkResults {
    hardware?: BenchmarkHardwareInfo;
    cpu?: BenchmarkCpuResult | null;
    ram?: BenchmarkThroughput | null;
    disk?: BenchmarkThroughput | null;
    network?: BenchmarkNetworkResult | null;
    scores?: BenchmarkScores | null;
    durationMs?: number;
    error?: string;
}

/** One persisted benchmark run, as returned by GET .../benchmark (oldest first). */
export interface BenchmarkRunSummary {
    id: string;
    cpuScore: number;
    ramScore: number;
    diskScore: number;
    networkScore: number;
    overallScore: number;
    cpuSingleMBps: number | null;
    cpuMultiMBps: number | null;
    ramWriteMBps: number | null;
    ramReadMBps: number | null;
    diskWriteMBps: number | null;
    diskReadMBps: number | null;
    pingMs: number | null;
    runAt: string;
}

export type BenchmarkPhase =
    | 'connecting'
    | 'hardware'
    | 'cpu_single'
    | 'cpu_multi'
    | 'ram_write'
    | 'ram_read'
    | 'disk_write'
    | 'disk_read'
    | 'network'
    | 'done'
    | 'error';

export const BENCHMARK_PHASES: { key: BenchmarkPhase; label: string }[] = [
    { key: 'connecting', label: 'Connect' },
    { key: 'hardware', label: 'HW Info' },
    { key: 'cpu_single', label: 'CPU 1C' },
    { key: 'cpu_multi', label: 'CPU NC' },
    { key: 'ram_write', label: 'RAM W' },
    { key: 'ram_read', label: 'RAM R' },
    { key: 'disk_write', label: 'Disk W' },
    { key: 'disk_read', label: 'Disk R' },
    { key: 'network', label: 'Network' },
];

export function phaseIndex(phase: BenchmarkPhase | null): number {
    return BENCHMARK_PHASES.findIndex((p) => p.key === phase);
}

/** Scores are 0–1000, graded against a high-end server reference. */
export function scoreColor(score: number): string {
    if (score >= 800) return 'text-emerald-400';
    if (score >= 600) return 'text-yellow-400';
    if (score >= 400) return 'text-amber-400';
    return 'text-red-400';
}

export function scoreBg(score: number): string {
    if (score >= 800) return 'bg-emerald-500/10 border-emerald-500/20';
    if (score >= 600) return 'bg-yellow-500/10 border-yellow-500/20';
    if (score >= 400) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-red-500/10 border-red-500/20';
}

export function scoreBarColor(score: number): string {
    if (score >= 800) return 'bg-emerald-400';
    if (score >= 600) return 'bg-yellow-400';
    if (score >= 400) return 'bg-amber-400';
    return 'bg-red-400';
}

