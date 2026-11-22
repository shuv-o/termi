'use client';

/**
 * Active connections: everything the user has open on any gateway — terminals
 * left running after their tab closed, desktops, file browsers, tunnels, guest
 * seats — with where each was opened from, and a way to open or close it.
 * Data: GET /api/connections (refreshed while the page is visible).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, Loader2, Monitor, Power, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
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
    connectionLabel,
    connectionState,
    connectionTitle,
    openAction,
    type LiveConnectionItem,
} from '@/lib/connections/describe';
import { formatRelativeTime } from '@/lib/format';
import { describeUserAgent } from '@/lib/user-agent';

const REFRESH_MS = 5_000;

type Filter = 'all' | 'background';

const STATE_BADGE = {
    'in-use': { label: 'In use', tone: 'bg-success/12 text-success' },
    background: { label: 'Running in the background', tone: 'bg-warning/15 text-warning' },
    closing: { label: 'Closing…', tone: 'bg-muted text-muted-foreground' },
} as const;

function originText(c: LiveConnectionItem): string {
    const where =
        c.via === 'device'
            ? `on ${c.deviceName ? `“${c.deviceName}”` : 'your computer'} (desktop app)`
            : '';
    const who = c.origin.current
        ? 'this browser'
        : [
              describeUserAgent(c.origin.userAgent),
              c.origin.ipAddress && c.origin.ipAddress !== 'unknown' ? c.origin.ipAddress : '',
          ]
              .filter(Boolean)
              .join(', ') || 'another sign-in';
    return `From ${who}${where ? `, ${where}` : ''}`;
}

export default function ActiveConnectionsPage() {
    const { toast } = useToast();
    const [items, setItems] = useState<LiveConnectionItem[] | null>(null);
    const [tracking, setTracking] = useState(true);
    const [filter, setFilter] = useState<Filter>('all');
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [bulk, setBulk] = useState<{ ids: string[]; title: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/connections', { cache: 'no-store' });
            const data = await res.json();
            if (!data.success) return;
            setItems(data.data.connections);
            setTracking(data.data.tracking);
        } catch {
            /* keeps the last list; the next refresh tries again */
        }
    }, []);

    useEffect(() => {
        void load();
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') void load();
        }, REFRESH_MS);
        const onVisible = () => document.visibilityState === 'visible' && void load();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [load]);

    const close = useCallback(
        async (ids: string[]) => {
            if (!ids.length) return;
            setBusy(true);
            try {
                const res = await fetch('/api/connections/close', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids }),
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Could not close');
                const closing = new Set<string>(data.data.closing);
                setItems(
                    (prev) =>
                        prev?.map((c) => (closing.has(c.id) ? { ...c, closing: true } : c)) ?? prev,
                );
                if (closing.size > 1) toast('success', `Closing ${closing.size} connections…`);
            } catch (err) {
                toast('error', (err as Error).message || 'Could not close the connection');
            } finally {
                setBusy(false);
                setConfirmId(null);
            }
        },
        [toast],
    );

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
                            {shown.map((c) => {
                                const state = connectionState(c);
                                const badge = STATE_BADGE[state];
                                const action = openAction(c);
                                const confirming = confirmId === c.id;
                                return (
                                    <li
                                        key={c.id}
                                        className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
                                            c.closing ? 'opacity-60' : ''
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-2">
                                                {c.serverId && c.kind !== 'guest' ? (
                                                    <Link
                                                        href={`/panel/servers/${c.serverId}`}
                                                        className="truncate text-sm font-medium hover:underline"
                                                    >
                                                        {connectionTitle(c)}
                                                    </Link>
                                                ) : (
                                                    <span className="truncate text-sm font-medium">
                                                        {connectionTitle(c)}
                                                    </span>
                                                )}
                                                <span className="text-xs text-muted-foreground">
                                                    {connectionLabel(c)}
                                                </span>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.tone}`}
                                                >
                                                    {badge.label}
                                                </span>
                                                {c.guests > 0 && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                                        <Users className="h-3 w-3" />
                                                        {c.guests} joined
                                                    </span>
                                                )}
                                            </p>
                                            <p className="mt-1 truncate text-xs text-muted-foreground">
                                                Opened{' '}
                                                {formatRelativeTime(c.startedAt).toLowerCase()}
                                                {' · '}active{' '}
                                                {formatRelativeTime(c.lastActivityAt).toLowerCase()}
                                                {' · '}
                                                {originText(c)}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1 self-start sm:self-auto">
                                            {confirming ? (
                                                <>
                                                    <span className="mr-1 text-xs text-muted-foreground">
                                                        {c.kind === 'session'
                                                            ? 'Ends the shell and what runs in it.'
                                                            : 'Disconnect?'}
                                                    </span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setConfirmId(null)}
                                                    >
                                                        Keep
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        disabled={busy}
                                                        onClick={() => void close([c.id])}
                                                    >
                                                        Close
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    {action && (
                                                        <Button asChild size="sm" variant="ghost">
                                                            <Link href={action.href}>
                                                                <Monitor /> {action.label}
                                                            </Link>
                                                        </Button>
                                                    )}
                                                    {!c.closing && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-danger hover:text-danger"
                                                            onClick={() => setConfirmId(c.id)}
                                                            aria-label={`Close ${connectionTitle(c)} ${connectionLabel(c)}`}
                                                        >
                                                            <Power /> Close
                                                        </Button>
                                                    )}
                                                    {c.closing && (
                                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
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
