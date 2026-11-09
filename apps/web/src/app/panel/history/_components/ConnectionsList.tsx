'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { device } from './ActivityList';

interface Entry {
    id: string;
    serverId: string | null;
    serverName: string;
    protocol: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
}

const KIND: Record<string, { label: string; tone: string }> = {
    ssh: { label: 'Terminal', tone: 'bg-proto-ssh/12 text-proto-ssh' },
    scp: { label: 'Files', tone: 'bg-proto-scp/12 text-proto-scp' },
    rdp: { label: 'Remote desktop', tone: 'bg-proto-rdp/12 text-proto-rdp' },
    vnc: { label: 'Screen share', tone: 'bg-proto-vnc/12 text-proto-vnc' },
    telnet: { label: 'Telnet', tone: 'bg-proto-telnet/12 text-proto-telnet' },
};

/** "Today", "Yesterday", or the date, for the day headings. */
function dayLabel(d: Date): string {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    });
}

/** Every terminal, file browser and desktop you opened, by day, newest first. */
export function ConnectionsList() {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [nextBefore, setNextBefore] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async (before?: string) => {
        const res = await fetch(
            `/api/account/connections${before ? `?before=${encodeURIComponent(before)}` : ''}`,
        );
        const data = await res.json();
        if (!data.success) return;
        setEntries((prev) => (before ? [...prev, ...data.data.entries] : data.data.entries));
        setNextBefore(data.data.nextBefore);
    }, []);

    useEffect(() => {
        load().finally(() => setLoading(false));
    }, [load]);

    const days = useMemo(() => {
        const out: { label: string; entries: Entry[] }[] = [];
        for (const e of entries) {
            const label = dayLabel(new Date(e.createdAt));
            if (out.at(-1)?.label === label) out.at(-1)!.entries.push(e);
            else out.push({ label, entries: [e] });
        }
        return out;
    }, [entries]);

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading connections…</span>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <EmptyState
                compact
                icon={History}
                title="No connections yet"
                description="Each terminal, file browser and desktop you open is listed here, so you can get back to it in one click."
            />
        );
    }

    return (
        <div className="space-y-6">
            {days.map((day) => (
                <section key={day.label} aria-label={day.label}>
                    <h3 className="mb-2 text-xs font-medium text-muted-foreground">{day.label}</h3>
                    <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
                        {day.entries.map((e) => {
                            const kind = KIND[e.protocol] ?? KIND.ssh;
                            const meta = [
                                device(e.userAgent),
                                e.ipAddress && e.ipAddress !== 'unknown' ? e.ipAddress : '',
                            ]
                                .filter(Boolean)
                                .join(', ');
                            return (
                                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                                    <time
                                        dateTime={e.createdAt}
                                        className="data w-16 shrink-0 whitespace-nowrap text-xs text-muted-foreground"
                                    >
                                        {new Date(e.createdAt).toLocaleTimeString(undefined, {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </time>
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-medium">
                                                {e.serverName}
                                            </span>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${kind.tone}`}
                                            >
                                                {kind.label}
                                            </span>
                                        </p>
                                        {meta && (
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                From {meta}
                                            </p>
                                        )}
                                    </div>
                                    {e.serverId && (
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="ghost"
                                            className="shrink-0"
                                        >
                                            <Link
                                                href={`/panel/connect/${e.serverId}/${e.protocol}`}
                                                aria-label={`Open ${e.serverName} again`}
                                            >
                                                <RotateCcw /> Open again
                                            </Link>
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}

            {nextBefore && (
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={loadingMore}
                    onClick={async () => {
                        setLoadingMore(true);
                        await load(nextBefore).finally(() => setLoadingMore(false));
                    }}
                >
                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                    Show earlier
                </Button>
            )}
        </div>
    );
}
