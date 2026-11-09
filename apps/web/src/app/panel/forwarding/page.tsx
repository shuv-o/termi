'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Server, Waypoints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MotionRow, useListMotion } from '@/components/ui/list-motion';
import { PageHeader, PAGE_CONTENT_WIDTH } from '@/components/ui/page-header';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { ForwardForm, TunnelSessionRowCard } from '@/components/tunnels/TunnelSection';
import {
    buildProxyUrl,
    rowRequest,
    useTunnels,
    type TunnelSessionRow,
} from '@/components/tunnels/useTunnels';

interface ServerOption {
    id: string;
    name: string;
    protocol: string;
}

const LAST_SERVER = 'termi-forward-server';

function proxyUrl(row: TunnelSessionRow): string | null {
    return row.serverId ? buildProxyUrl(row.serverId, row.remotePort, row.remoteHost) : null;
}

/** The forward form for one server; tells the page when its list changed. */
function ServerForward({ server, onChange }: { server: ServerOption; onChange: () => void }) {
    const tunnels = useTunnels(server.id, server.name);
    const count = tunnels.activeSessions.length;
    useEffect(() => {
        onChange();
        // Only a change in what is open matters here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [count]);
    return <ForwardForm tunnels={tunnels} />;
}

export default function ForwardingPage() {
    const { data: own } = useCachedFetch<{ servers: ServerOption[] }>('/api/servers');
    const { data: shared } = useCachedFetch<{ servers: ServerOption[] }>('/api/shared-servers');
    const { data, isLoading, mutate, refresh } = useCachedFetch<{
        tunnels: TunnelSessionRow[];
    }>('/api/tunnel-sessions');
    const tunnels = data?.tunnels ?? [];
    const motion = useListMotion();
    const [seen, setSeen] = useState<Set<string> | null>(null);

    const servers = useMemo(() => {
        const all = [...(own?.servers ?? []), ...(shared?.servers ?? [])];
        const ids = new Set<string>();
        return all.filter((s) => s.protocol === 'SSH' && !ids.has(s.id) && ids.add(s.id));
    }, [own, shared]);

    const [serverId, setServerId] = useState<string>('');
    useEffect(() => {
        if (serverId || servers.length === 0) return;
        let last: string | null = null;
        try {
            last = localStorage.getItem(LAST_SERVER);
        } catch {
            /* not remembered */
        }
        setServerId(servers.find((s) => s.id === last)?.id ?? servers[0].id);
    }, [servers, serverId]);
    const server = servers.find((s) => s.id === serverId);

    // A tunnel opened here arrives with the accent wash; ones already open don't.
    useEffect(() => {
        if (!data) return;
        if (seen) for (const t of data.tunnels) if (!seen.has(t.id)) motion.arrived(t.id);
        setSeen(new Set(data.tunnels.map((t) => t.id)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const close = (row: TunnelSessionRow) => {
        if (row.kind === 'ELECTRON_LOCAL' && row.electronId && window.electronAPI?.tunnel) {
            window.electronAPI.tunnel.close(row.electronId);
        }
        motion.remove(row.id, () =>
            mutate((prev) => ({ tunnels: (prev?.tunnels ?? []).filter((t) => t.id !== row.id) })),
        );
        void fetch(`/api/tunnel-sessions/${row.id}`, { method: 'DELETE' }).catch(() => {});
    };

    const regenerateScript = async (row: TunnelSessionRow): Promise<string | null> => {
        if (!row.serverId) return null;
        try {
            const res = await fetch('/api/tunnels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId: row.serverId, ...rowRequest(row) }),
            });
            const json = await res.json();
            return json.success ? (json.data.bridgeScript ?? null) : null;
        } catch {
            return null;
        }
    };

    return (
        <div className={`${PAGE_CONTENT_WIDTH} space-y-6 pb-16`}>
            <PageHeader
                title="Port forwarding"
                description="Reach a database, dashboard or any port behind one of your servers, as with ssh -L, -D and -R."
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Card className="space-y-4 p-5">
                    <h2 className="font-semibold">Open a forward</h2>
                    {servers.length === 0 ? (
                        <EmptyState
                            compact
                            headingLevel="h3"
                            icon={Server}
                            title="Add an SSH server first"
                            description="Forwards travel through an SSH server you can sign in to."
                            action={
                                <Button asChild size="sm">
                                    <Link href="/panel/servers/new">
                                        <Plus /> Add server
                                    </Link>
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <p className="text-sm font-medium" id="forward-through">
                                    Through
                                </p>
                                <Select
                                    value={serverId}
                                    onValueChange={(id) => {
                                        setServerId(id);
                                        try {
                                            localStorage.setItem(LAST_SERVER, id);
                                        } catch {
                                            /* not remembered */
                                        }
                                    }}
                                >
                                    <SelectTrigger aria-labelledby="forward-through">
                                        <SelectValue placeholder="Choose a server" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {servers.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {server && (
                                <ServerForward
                                    key={server.id}
                                    server={server}
                                    onChange={() => void refresh()}
                                />
                            )}
                        </>
                    )}
                </Card>

                <section aria-labelledby="open-forwards" className="space-y-3">
                    <h2 id="open-forwards" className="font-semibold">
                        Open now
                        {tunnels.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                {tunnels.length}
                            </span>
                        )}
                    </h2>
                    {isLoading && tunnels.length === 0 ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : tunnels.length === 0 ? (
                        <Card className="border-dashed p-0">
                            <EmptyState
                                compact
                                headingLevel="h3"
                                icon={Waypoints}
                                title="Nothing forwarded yet"
                                description="Forwards you open, here or from a terminal, are listed here so you can reopen or close them."
                            />
                        </Card>
                    ) : (
                        <ul aria-label="Open forwards">
                            {tunnels.map((row) => (
                                <MotionRow
                                    key={row.id}
                                    motion={motion}
                                    id={row.id}
                                    className="rounded-lg"
                                >
                                    <TunnelSessionRowCard
                                        row={row}
                                        serverLabel={row.serverName}
                                        proxyUrl={proxyUrl(row)}
                                        onClose={() => close(row)}
                                        onRegenerateScript={() => regenerateScript(row)}
                                    />
                                </MotionRow>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}
