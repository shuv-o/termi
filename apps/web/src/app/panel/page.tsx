'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpDown, ChevronDown, Download, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import type { RevealField } from '@/components/auth/PasskeyRevealModal';

import { useSessionsContext } from './sessions-context';
import { DashboardEmptyState, DashboardSkeleton } from './_dashboard/DashboardPlaceholders';
import { DashboardToolbar } from './_dashboard/DashboardToolbar';
import { FleetAlerts } from './_dashboard/FleetAlerts';
import { FleetStats } from './_dashboard/FleetStats';
import { ServerGridCard } from './_dashboard/ServerGridCard';
import { ServerListHeader, ServerListRow } from './_dashboard/ServerListRow';
import { SharedWithMeSection, type SharedServer } from './_dashboard/SharedWithMeSection';
import { useDashboardPrefs } from './_dashboard/useDashboardPrefs';
import { useServerMetrics } from './_dashboard/useServerMetrics';
import {
    PROTOCOL_FILTERS,
    compareServers,
    type ProtocolFilter,
    type ServerCardProps,
    type ServerItem,
} from './_dashboard/types';

const PasskeyRevealModal = dynamic(() => import('@/components/auth/PasskeyRevealModal'), {
    ssr: false,
});

const ExportServersDialog = dynamic(() => import('@/components/servers/ExportServersDialog'), {
    ssr: false,
});

const ImportServersDialog = dynamic(() => import('@/components/servers/ImportServersDialog'), {
    ssr: false,
});

const ShareModal = dynamic(() => import('./_dashboard/ShareModal'), { ssr: false });

export default function DashboardPage() {
    const router = useRouter();
    const { addSession, sessions } = useSessionsContext();

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');

    // Search and favourites filtering happen server-side, so each combination is
    // its own cache entry. Repeating a search you've already run is instant, and
    // returning to the dashboard shows the last list immediately while it
    // refreshes in the background.
    const serversUrl = useMemo(() => {
        const params = new URLSearchParams();
        if (debouncedSearchQuery) params.set('q', debouncedSearchQuery);
        if (filter === 'favorites') params.set('favorites', 'true');
        const qs = params.toString();
        return `/api/servers${qs ? `?${qs}` : ''}`;
    }, [debouncedSearchQuery, filter]);

    const {
        data: serversData,
        isLoading: loading,
        refresh: fetchServers,
        mutate: mutateServers,
    } = useCachedFetch<{ servers: ServerItem[] }>(serversUrl);

    const servers = useMemo(() => serversData?.servers ?? [], [serversData]);

    /** Local list edits (favourite toggle, delete) write straight to the cache. */
    const setServers = useCallback(
        (updater: ServerItem[] | ((prev: ServerItem[]) => ServerItem[])) => {
            mutateServers((prev) => ({
                servers: typeof updater === 'function' ? updater(prev?.servers ?? []) : updater,
            }));
        },
        [mutateServers],
    );

    const { data: sharedData } = useCachedFetch<{ servers: SharedServer[] }>('/api/shared-servers');
    const sharedServers = useMemo(() => sharedData?.servers ?? [], [sharedData]);

    const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all');
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<ServerItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [revealTarget, setRevealTarget] = useState<{
        server: ServerItem;
        field: RevealField;
    } | null>(null);
    const [shareTarget, setShareTarget] = useState<ServerItem | null>(null);
    const [showExport, setShowExport] = useState(false);
    const [showImport, setShowImport] = useState(false);

    const { viewMode, switchView, sort, applySort } = useDashboardPrefs();
    const { metrics, metricsLoading, fetchMetrics, forgetServer } = useServerMetrics(servers);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // All unique tags across all servers
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        servers.forEach((s) => s.tags.forEach((t) => tagSet.add(t)));
        return Array.from(tagSet).sort();
    }, [servers]);

    // Apply protocol + tag filters client-side (search/favorites are server-side)
    const filteredServers = useMemo(
        () =>
            servers.filter((s) => {
                if (protocolFilter !== 'all' && s.protocol !== protocolFilter) return false;
                if (activeTag && !s.tags.includes(activeTag)) return false;
                return true;
            }),
        [servers, protocolFilter, activeTag],
    );

    const sortedServers = useMemo(
        () => [...filteredServers].sort((a, b) => compareServers(a, b, sort, metrics)),
        [filteredServers, sort, metrics],
    );

    // Protocol counts for filter buttons
    const protocolCounts = useMemo(() => {
        const base = servers.filter((s) => {
            if (filter === 'favorites' && !s.isFavorite) return false;
            if (activeTag && !s.tags.includes(activeTag)) return false;
            return true;
        });
        return PROTOCOL_FILTERS.reduce(
            (acc, p) => {
                acc[p] = p === 'all' ? base.length : base.filter((s) => s.protocol === p).length;
                return acc;
            },
            {} as Record<ProtocolFilter, number>,
        );
    }, [servers, filter, activeTag]);

    const toggleFavorite = async (serverId: string) => {
        const server = servers.find((s) => s.id === serverId);
        if (!server) return;
        await fetch(`/api/servers/${serverId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isFavorite: !server.isFavorite }),
        });
        setServers(
            servers.map((s) => (s.id === serverId ? { ...s, isFavorite: !s.isFavorite } : s)),
        );
    };

    const openInSessions = async (server: ServerItem) => {
        const alreadyOpen = sessions.some((s) => s.serverId === server.id);
        if (!alreadyOpen) await addSession(server.id, server.name);
        router.push('/panel/sessions');
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/servers/${deleteConfirm.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setServers((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
                forgetServer(deleteConfirm.id);
                setDeleteConfirm(null);
            }
        } finally {
            setDeleting(false);
        }
    };

    const handleTagClick = (tag: string) => {
        setActiveTag((prev) => (prev === tag ? null : tag));
    };

    const cardProps = (server: ServerItem): ServerCardProps => ({
        server,
        m: metrics[server.id] ?? null,
        mLoading: metricsLoading[server.id] ?? false,
        hasSession: sessions.some((s) => s.serverId === server.id),
        onOpen: () => router.push(`/panel/servers/${server.id}`),
        onFavorite: () => toggleFavorite(server.id),
        onEdit: () => router.push(`/panel/servers/${server.id}/edit`),
        onDelete: () => setDeleteConfirm(server),
        onCopyPassword: () => setRevealTarget({ server, field: 'password' }),
        onConnect: () =>
            router.push(`/panel/connect/${server.id}/${server.protocol.toLowerCase()}`),
        onSessions: () => openInSessions(server),
        onTagClick: handleTagClick,
        onShare: () => setShareTarget(server),
    });

    return (
        <>
            <div className="space-y-4 sm:space-y-6">
                <div className="mx-auto max-w-screen-2xl space-y-4 sm:space-y-5">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h1 className="mt-0.5 text-xl sm:text-2xl font-bold">Servers</h1>
                            <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                                {servers.length > 0
                                    ? `${servers.length} server${servers.length === 1 ? '' : 's'}${filteredServers.length !== servers.length ? ` · ${filteredServers.length} shown` : ''}`
                                    : 'Manage and connect to your servers'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" title="Import or export servers">
                                        <ArrowUpDown className="w-4 h-4" />
                                        <span className="hidden sm:inline">Transfer</span>
                                        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Bulk transfer</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => setShowImport(true)}>
                                        <Upload className="w-4 h-4" />
                                        Import servers
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => setShowExport(true)}
                                        disabled={servers.length === 0}
                                    >
                                        <Download className="w-4 h-4" />
                                        Export servers
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Button asChild>
                                <Link href="/panel/servers/new">
                                    <Plus className="w-4 h-4" />{' '}
                                    <span className="hidden sm:inline">Add Server</span>
                                </Link>
                            </Button>
                        </div>
                    </div>

                    <FleetStats
                        servers={servers}
                        metrics={metrics}
                        metricsLoading={metricsLoading}
                        sessions={sessions}
                    />

                    {!loading && (
                        <FleetAlerts
                            servers={servers}
                            metrics={metrics}
                            onSelectServer={(id) => router.push(`/panel/servers/${id}`)}
                        />
                    )}
                </div>

                <DashboardToolbar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPending={searchQuery !== debouncedSearchQuery}
                    filter={filter}
                    onFilterChange={setFilter}
                    sort={sort}
                    onSortChange={applySort}
                    viewMode={viewMode}
                    onViewChange={switchView}
                    onRefresh={() => {
                        fetchServers();
                        fetchMetrics(servers, true);
                    }}
                    refreshing={loading}
                    protocolFilter={protocolFilter}
                    onProtocolFilterChange={setProtocolFilter}
                    protocolCounts={protocolCounts}
                    activeTag={activeTag}
                    onClearTag={() => setActiveTag(null)}
                    allTags={allTags}
                    onSelectTag={setActiveTag}
                />

                <div className="mx-auto max-w-screen-2xl">
                    {loading ? (
                        <DashboardSkeleton viewMode={viewMode} />
                    ) : sortedServers.length === 0 ? (
                        <DashboardEmptyState
                            fleetIsEmpty={servers.length === 0}
                            onClearFilters={() => {
                                setProtocolFilter('all');
                                setActiveTag(null);
                                setSearchQuery('');
                                setDebouncedSearchQuery('');
                                setFilter('all');
                            }}
                        />
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {sortedServers.map((server) => (
                                <ServerGridCard key={server.id} {...cardProps(server)} />
                            ))}
                        </div>
                    ) : (
                        <Card className="overflow-hidden border-border">
                            <ServerListHeader />
                            {sortedServers.map((server) => (
                                <ServerListRow key={server.id} {...cardProps(server)} />
                            ))}
                        </Card>
                    )}
                </div>

                <SharedWithMeSection
                    servers={sharedServers}
                    onConnect={(server) =>
                        router.push(`/panel/connect/${server.id}/${server.protocol.toLowerCase()}`)
                    }
                />
            </div>

            <AlertDialog
                open={!!deleteConfirm}
                onOpenChange={(open) => !open && setDeleteConfirm(null)}
            >
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                            </div>
                            <AlertDialogTitle>Delete Server</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription>
                            Are you sure you want to delete{' '}
                            <span className="font-medium text-foreground">
                                {deleteConfirm?.name}
                            </span>
                            ? All associated data will be permanently removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            disabled={deleting}
                            className="bg-secondary border-border hover:bg-secondary/80"
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {revealTarget && (
                <PasskeyRevealModal
                    serverId={revealTarget.server.id}
                    serverName={revealTarget.server.name}
                    field={revealTarget.field}
                    onClose={() => setRevealTarget(null)}
                    autoCopy
                />
            )}

            {shareTarget && (
                <ShareModal server={shareTarget} onClose={() => setShareTarget(null)} />
            )}

            {showExport && <ExportServersDialog onClose={() => setShowExport(false)} />}

            {showImport && (
                <ImportServersDialog
                    onClose={() => setShowImport(false)}
                    onImported={fetchServers}
                />
            )}
        </>
    );
}
