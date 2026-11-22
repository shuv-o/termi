'use client';

/**
 * Active connections: everything the user has open on any gateway — terminals
 * left running after their tab closed, desktops, file browsers, tunnels, guest
 * seats — with where each was opened from, and a way to open or close it.
 * Data: GET /api/connections (refreshed while the page is visible).
 */

import { useState } from 'react';
import { Activity, AlertTriangle, Loader2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
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
import { LiveConnectionRow } from '@/components/connections/LiveConnectionRow';
import { useLiveConnections } from '@/components/connections/useLiveConnections';
import { connectionState } from '@/lib/connections/describe';

type Filter = 'all' | 'background';

export default function ActiveConnectionsPage() {
    const { items, tracking, busy, close } = useLiveConnections();
    const [filter, setFilter] = useState<Filter>('all');
    const [bulk, setBulk] = useState<{ ids: string[]; title: string } | null>(null);

    const all = items ?? [];
    const open = all.filter((c) => !c.closing);
    const background = open.filter((c) => connectionState(c) === 'background');
    const shown =
        filter === 'background' ? all.filter((c) => connectionState(c) === 'background') : all;

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 pb-16">
            <PageHeader
                title="Active connections"
                description="Everything you have open right now, wherever you opened it. Terminals keep running after their tab closes — open them again here, or close what you no longer need."
            />

            {!tracking && items !== null && (
                <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p>
                        The gateway isn&apos;t reporting its connections, so this list may be
                        incomplete. Check that it can reach the web app (
                        <code className="data">WEB_INTERNAL_URL</code>) and runs this version.
                    </p>
                </div>
            )}

            {items === null ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            ) : all.length === 0 ? (
                <EmptyStateCard
                    icon={Activity}
                    title="Nothing open"
                    description="Terminals, desktops, file browsers and tunnels you open show up here while they run."
                />
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <div
                            role="tablist"
                            aria-label="Show"
                            className="inline-flex rounded-lg border border-border bg-card p-0.5"
                        >
                            {(
                                [
                                    ['all', `All (${all.length})`],
                                    ['background', `In the background (${background.length})`],
                                ] as const
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    role="tab"
                                    aria-selected={filter === value}
                                    onClick={() => setFilter(value)}
                                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                        filter === value
                                            ? 'bg-accent text-accent-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="ml-auto flex flex-wrap gap-2">
                            {background.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                        setBulk({
                                            ids: background.map((c) => c.id),
                                            title: `Close ${background.length} background ${background.length === 1 ? 'terminal' : 'terminals'}?`,
                                        })
                                    }
                                >
                                    Close background ones
                                </Button>
                            )}
                            {open.length > 1 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-danger hover:text-danger"
                                    disabled={busy}
                                    onClick={() =>
                                        setBulk({
                                            ids: open.map((c) => c.id),
                                            title: `Close all ${open.length} connections?`,
                                        })
                                    }
                                >
                                    <Power /> Close all
                                </Button>
                            )}
                        </div>
                    </div>

                    {shown.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Nothing is running in the background.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                            {shown.map((c) => (
                                <LiveConnectionRow
                                    key={c.id}
                                    connection={c}
                                    busy={busy}
                                    onClose={(id) => void close([id])}
                                />
                            ))}
                        </ul>
                    )}
                </>
            )}

            <AlertDialog open={!!bulk} onOpenChange={(o) => !o && !busy && setBulk(null)}>
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{bulk?.title}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Closing a terminal ends its shell and anything still running in it. Open
                            tabs showing these connections are told they were closed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Keep them</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                const ids = bulk?.ids ?? [];
                                setBulk(null);
                                void close(ids);
                            }}
                        >
                            Close
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
