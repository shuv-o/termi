'use client';

import { AlertTriangle, Loader2, Play, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    CpuResultCard,
    DiskResultCard,
    HardwareCard,
    NetworkResultCard,
    RamResultCard,
    ScoreSummaryCard,
} from './BenchmarkResults';
import { BENCHMARK_PHASES, phaseIndex, type BenchmarkPhase, type BenchmarkResults } from './types';

/** Segmented progress bar showing which benchmark stage is running. */
function PhaseProgress({ phase, message }: { phase: BenchmarkPhase | null; message: string }) {
    const current = phaseIndex(phase);
    return (
        <Card className="p-4 mb-3">
            <div className="flex items-center gap-3 mb-3">
                <Loader2 className="w-4 h-4 animate-spin text-yellow-400 shrink-0" />
                <p className="text-sm text-foreground">{message}</p>
            </div>
            <div className="flex gap-1">
                {BENCHMARK_PHASES.map((p, i) => {
                    const done = i < current;
                    const active = i === current;
                    return (
                        <div key={p.key} className="flex-1 flex flex-col items-center gap-1">
                            <div
                                className={`h-1 w-full rounded-full transition-colors ${
                                    done
                                        ? 'bg-yellow-400'
                                        : active
                                          ? 'bg-yellow-400/60 animate-pulse'
                                          : 'bg-secondary'
                                }`}
                            />
                            <span
                                className={`text-[9px] hidden sm:block ${active ? 'text-yellow-400' : done ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
                            >
                                {p.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

export function BenchmarkSection({
    running,
    phase,
    message,
    results,
    onRun,
}: {
    running: boolean;
    phase: BenchmarkPhase | null;
    message: string;
    results: BenchmarkResults | null;
    onRun: () => void;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Hardware Benchmark
                </h2>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onRun}
                    disabled={running}
                    className="gap-1.5"
                >
                    {running ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…
                        </>
                    ) : (
                        <>
                            <Play className="w-3.5 h-3.5" /> Run Benchmark
                        </>
                    )}
                </Button>
            </div>

            {running && <PhaseProgress phase={phase} message={message} />}

            {!running && phase === 'error' && (
                <Card className="p-4 flex items-center gap-3 mb-3 border-destructive/20 bg-destructive/5">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive/80">{message}</p>
                </Card>
            )}

            {results && (
                <div className="space-y-3">
                    {results.scores && <ScoreSummaryCard scores={results.scores} />}
                    {results.hardware && <HardwareCard hardware={results.hardware} />}
                    {results.cpu && (
                        <CpuResultCard cpu={results.cpu} threads={results.hardware?.cpuThreads} />
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {results.ram && <RamResultCard ram={results.ram} />}
                        {results.disk && <DiskResultCard disk={results.disk} />}
                    </div>

                    {results.network && <NetworkResultCard network={results.network} />}

                    {results.durationMs && (
                        <p className="text-[11px] text-muted-foreground/40 text-right">
                            Completed in {(results.durationMs / 1000).toFixed(1)}s · 256 MB test
                            blocks · no software installed
                        </p>
                    )}
                </div>
            )}

            {!running && !results && phase !== 'error' && (
                <Card className="p-8 text-center">
                    <Zap className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No benchmark data</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                        Measures CPU single/multi-core, RAM, disk, and network — agentlessly via SSH
                    </p>
                </Card>
            )}
        </div>
    );
}
