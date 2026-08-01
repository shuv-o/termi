'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';

import { BenchmarkSection } from './_details/BenchmarkSection';
import { HealthHistorySection } from './_details/HealthHistorySection';
import { MonitorSettingsSection } from './_details/MonitorSettingsSection';
import { ServerHeader, ServerInfoCard } from './_details/ServerSummary';
import { useBenchmark } from './_details/useBenchmark';
import { useServerMonitoring } from './_details/useServerMonitoring';
import type { ServerInfo } from './_details/types';

export default function ServerDetailsPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();

    // The server record is cached, so coming back from the edit page (or from a
    // connection) shows it immediately instead of spinning on a refetch.
    const { data: serverData, error: serverError } = useCachedFetch<{ server: ServerInfo }>(
        id ? `/api/servers/${id}` : null,
    );
    const server = serverData?.server ?? null;

    const monitoring = useServerMonitoring(id);
    const benchmark = useBenchmark(id);

    // A missing/forbidden server means there is nothing to show here.
    useEffect(() => {
        if (serverError) router.push('/panel');
    }, [serverError, router]);

    if (!server) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const isSSH = server.protocol === 'SSH';
    const { lastRecord } = monitoring;

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            <ServerHeader server={server} isOnline={lastRecord?.reachable ?? null} />

            <ServerInfoCard
                server={server}
                monitorConfig={monitoring.monitorConfig}
                uptimePct={monitoring.uptimePct}
                checkCount={monitoring.healthRecords.length}
                latencyMs={lastRecord?.latencyMs}
            />

            <HealthHistorySection
                records={monitoring.healthRecords}
                lastRecord={lastRecord}
                upCount={monitoring.upCount}
                isSSH={isSSH}
                refreshing={monitoring.refreshing}
                onRefresh={monitoring.refreshHistory}
            />

            <MonitorSettingsSection
                form={monitoring.form}
                setForm={monitoring.setForm}
                monitorConfig={monitoring.monitorConfig}
                saving={monitoring.saving}
                onSave={monitoring.save}
            />

            {/* Benchmarking runs over SSH, so it's SSH-only. */}
            {isSSH && (
                <BenchmarkSection
                    running={benchmark.running}
                    phase={benchmark.phase}
                    message={benchmark.message}
                    results={benchmark.results}
                    onRun={benchmark.run}
                />
            )}
        </div>
    );
}
