'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BenchmarkPhase, BenchmarkResults, BenchmarkRunSummary } from './types';

/**
 * Runs the agentless SSH hardware benchmark, consuming the endpoint's
 * server-sent-event stream so each phase updates the UI as it completes.
 * Also loads past runs so the UI can show a score trend over time.
 */
export function useBenchmark(id: string) {
    const [running, setRunning] = useState(false);
    const [phase, setPhase] = useState<BenchmarkPhase | null>(null);
    const [message, setMessage] = useState('');
    const [results, setResults] = useState<BenchmarkResults | null>(null);
    const [history, setHistory] = useState<BenchmarkRunSummary[]>([]);

    const fetchHistory = useCallback(async () => {
        try {
            const response = await fetch(`/api/servers/${id}/benchmark`);
            const data = await response.json();
            if (data.success) setHistory(data.data.runs);
        } catch {
            /* Trend chart just stays empty — not worth surfacing an error for. */
        }
    }, [id]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const run = useCallback(async () => {
        setRunning(true);
        setResults(null);
        setPhase('connecting');
        setMessage('Connecting via SSH…');

        try {
            const response = await fetch(`/api/servers/${id}/benchmark`, { method: 'POST' });
            if (!response.ok || !response.body) {
                setPhase('error');
                setMessage('Failed to start benchmark');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value, { stream: true });
                for (const line of text.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        setPhase(event.phase);
                        setMessage(event.message ?? '');
                        if (event.results) {
                            setResults((prev) => ({ ...(prev ?? {}), ...event.results }));
                        }
                    } catch {
                        /* ignore malformed SSE line */
                    }
                }
            }
        } catch {
            setPhase('error');
            setMessage('Connection lost');
        } finally {
            setRunning(false);
            fetchHistory();
        }
    }, [id, fetchHistory]);

    return { running, phase, message, results, history, run };
}
