'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Fingerprint, Loader2, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { formatRelativeTime } from '@/lib/format';
import { HostKeySection } from '@/components/servers/HostKeySection';

interface ServerRow {
    id: string;
    name: string;
    host: string;
    port: number;
    protocol: string;
    hostKeyFingerprint: string | null;
    hostKeyType: string | null;
    hostKeyTrustedAt: string | null;
}

export default function KnownHostsPage() {
    const { data, isLoading, refresh } = useCachedFetch<{ servers: ServerRow[] }>('/api/servers');
    const [open, setOpen] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const servers = useMemo(
        () =>
            (data?.servers ?? [])
                .filter((s) => s.protocol === 'SSH' || s.protocol === 'SCP')
                .sort((a, b) => a.name.localeCompare(b.name)),
        [data],
    );
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return servers;
        return servers.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.host.toLowerCase().includes(q) ||
                s.hostKeyFingerprint?.toLowerCase().includes(q),
        );
    }, [servers, query]);
    const pinned = servers.filter((s) => s.hostKeyFingerprint).length;

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 pb-16">
            <PageHeader
                title="Known hosts"
                description={
                    servers.length > 0
                        ? `Termi remembers each server's host key and refuses to connect if it changes. ${pinned} of ${servers.length} recorded.`
                        : "Termi remembers each server's host key and refuses to connect if it changes."
                }
            />

            {servers.length > 8 && (
                <div className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Find a server or fingerprint"
                        aria-label="Find a server or fingerprint"
                        className="pl-8"
                    />
                </div>
            )}

            {isLoading && servers.length === 0 ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            ) : servers.length === 0 ? (
                <EmptyStateCard
                    icon={Fingerprint}
                    title="No SSH servers yet"
                    description="When you first connect to an SSH server, its host key is recorded here."
                />
            ) : (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                    {shown.map((s) => {
                        const expanded = open === s.id;
                        return (
                            <li key={s.id}>
                                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-2">
                                            <Link
                                                href={`/panel/servers/${s.id}`}
                                                className="truncate text-sm font-medium hover:underline"
                                            >
                                                {s.name}
                                            </Link>
                                            <span className="data truncate text-xs text-muted-foreground">
                                                {s.host}
                                                {s.port !== 22 ? `:${s.port}` : ''}
                                            </span>
                                        </p>
                                        {s.hostKeyFingerprint ? (
                                            <p className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
                                                <span className="truncate font-mono text-foreground/80">
                                                    {s.hostKeyFingerprint}
                                                </span>
                                                <span className="hidden shrink-0 sm:inline">
                                                    {s.hostKeyType}
                                                    {s.hostKeyTrustedAt &&
                                                        `, ${formatRelativeTime(s.hostKeyTrustedAt)}`}
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Recorded on your first connection
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={expanded ? 'secondary' : 'ghost'}
                                        className="shrink-0 self-start sm:self-auto"
                                        aria-expanded={expanded}
                                        aria-controls={`key-${s.id}`}
                                        onClick={() => setOpen(expanded ? null : s.id)}
                                    >
                                        Check key
                                        <ChevronDown
                                            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                                        />
                                    </Button>
                                </div>
                                {/* Opens in place, so the answer appears right under the server it is about. */}
                                <div
                                    id={`key-${s.id}`}
                                    className="termi-fold"
                                    data-leaving={!expanded || undefined}
                                >
                                    <div className={expanded ? '' : 'overflow-hidden'}>
                                        {expanded && (
                                            <div className="border-t border-border/60 bg-background/40 px-4 py-3">
                                                <HostKeySection
                                                    serverId={s.id}
                                                    embedded
                                                    onTrusted={() => void refresh()}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
