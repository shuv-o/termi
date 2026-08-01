'use client';

import { useCallback, useState } from 'react';
import type { BenchmarkPhase, BenchmarkResults } from './types';

/**
 * Runs the agentless SSH hardware benchmark, consuming the endpoint's
 * server-sent-event stream so each phase updates the UI as it completes.
 */
export function useBenchmark(id: string) {
    const [running, setRunning] = useState(false);
    const [phase, setPhase] = useState<BenchmarkPhase | null>(null);
    const [message, setMessage] = useState('');
    const [results, setResults] = useState<BenchmarkResults | null>(null);

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
        }
    }, [id]);

    return { running, phase, message, results, run };
}
