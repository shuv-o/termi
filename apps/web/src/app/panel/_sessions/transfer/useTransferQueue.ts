'use client';

import { useCallback, useRef, useState } from 'react';
import type { RemoteEntry } from '@/components/scp/FileManagerPanel';

export type TransferItemStatus = 'queued' | 'transferring' | 'done' | 'failed';

export interface TransferItem {
    id: string;
    name: string;
    path: string;
    size: number;
    status: TransferItemStatus;
    progress: number;
    error?: string;
}

export type TransferDirection = 'lr' | 'rl';

interface TransferRequest {
    files: RemoteEntry[];
    fromServerId: string;
    toServerId: string;
    toPath: string;
}

/** How often the optimistic progress bar ticks while the request is in flight. */
const FAKE_TICK_MS = 200;
/** Progress is capped here until the server actually answers. */
const FAKE_MAX_PERCENT = 85;

/**
 * Owns the server-to-server transfer queue: enqueueing files, the optimistic
 * progress ramp, and reconciling against the API's ok/failed lists.
 */
export function useTransferQueue() {
    const [queue, setQueue] = useState<TransferItem[]>([]);
    const [activeDir, setActiveDir] = useState<TransferDirection | null>(null);
    const fakeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const totalItems = queue.length;
    const doneItems = queue.filter((i) => i.status === 'done').length;
    const failedItems = queue.filter((i) => i.status === 'failed').length;

    const clear = useCallback(() => setQueue([]), []);

    const start = useCallback(
        async (
            direction: TransferDirection,
            { files, fromServerId, toServerId, toPath }: TransferRequest,
        ) => {
            if (!files.length || activeDir) return;

            const newItems: TransferItem[] = files.map((f) => ({
                id: Math.random().toString(36).slice(2),
                name: f.name,
                path: f.path,
                size: f.size,
                status: 'queued',
                progress: 0,
            }));

            setQueue((prev) => [...prev, ...newItems]);
            setActiveDir(direction);

            // Optimistic progress: ramp all items toward 85% while we wait, so a
            // multi-second SCP doesn't look frozen.
            const ids = newItems.map((i) => i.id);
            let tick = 0;
            fakeTimerRef.current = setInterval(() => {
                tick += 1;
                setQueue((prev) =>
                    prev.map((item) =>
                        ids.includes(item.id) && item.status !== 'done' && item.status !== 'failed'
                            ? {
                                  ...item,
                                  status: 'transferring',
                                  progress: Math.min(FAKE_MAX_PERCENT, tick * 8),
                              }
                            : item,
                    ),
                );
            }, FAKE_TICK_MS);

            try {
                const res = await fetch('/api/servers/transfer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fromServerId,
                        fromPaths: files.map((f) => f.path),
                        toServerId,
                        toPath,
                    }),
                });
                const data = await res.json();

                if (fakeTimerRef.current) clearInterval(fakeTimerRef.current);

                if (data.success) {
                    const okSet = new Set<string>(data.data.ok ?? []);
                    const failMap = new Map<string, string>(
                        (data.data.failed ?? []).map((f: { path: string; error: string }) => [
                            f.path,
                            f.error,
                        ]),
                    );
                    setQueue((prev) =>
                        prev.map((item) => {
                            if (!ids.includes(item.id)) return item;
                            if (okSet.has(item.path))
                                return { ...item, status: 'done', progress: 100 };
                            if (failMap.has(item.path))
                                return {
                                    ...item,
                                    status: 'failed',
                                    progress: 100,
                                    error: failMap.get(item.path),
                                };
                            return item;
                        }),
                    );
                } else {
                    setQueue((prev) =>
                        prev.map((item) =>
                            ids.includes(item.id)
                                ? {
                                      ...item,
                                      status: 'failed',
                                      progress: 100,
                                      error: data.error ?? 'Transfer failed',
                                  }
                                : item,
                        ),
                    );
                }
            } catch {
                if (fakeTimerRef.current) clearInterval(fakeTimerRef.current);
                setQueue((prev) =>
                    prev.map((item) =>
                        ids.includes(item.id)
                            ? { ...item, status: 'failed', progress: 100, error: 'Network error' }
                            : item,
                    ),
                );
            } finally {
                setActiveDir(null);
            }
        },
        [activeDir],
    );

    /** Puts failed items back in the queue so they can be re-sent. */
    const retryFailed = useCallback(() => {
        if (activeDir) return;
        setQueue((prev) =>
            prev.map((item) =>
                item.status === 'failed'
                    ? { ...item, status: 'queued', progress: 0, error: undefined }
                    : item,
            ),
        );
    }, [activeDir]);

    return {
        queue,
        activeDir,
        totalItems,
        doneItems,
        failedItems,
        start,
        retryFailed,
        clear,
    };
}
