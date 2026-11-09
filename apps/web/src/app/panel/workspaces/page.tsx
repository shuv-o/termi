'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutPanelLeft, Loader2, Monitor, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/ui/empty-state';
import { MotionRow, useListMotion } from '@/components/ui/list-motion';
import { PageHeader, PAGE_CONTENT_WIDTH } from '@/components/ui/page-header';
import type { SavedWorkspace } from '../_sessions/LayoutMenu';
import { paneRects } from '../_sessions/split';

const LAYOUT_LABEL = { columns: 'Side by side', rows: 'Stacked', grid: 'Grid' } as const;

/** The workspace drawn small: which server sits in which pane. */
function LayoutSketch({ w }: { w: SavedWorkspace }) {
    const panes = w.split?.panes ?? [0];
    const rects = w.split
        ? paneRects(w.split, panes.length)
        : [{ left: 0, top: 0, width: 1, height: 1 }];
    return (
        <div
            aria-hidden
            className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-background"
        >
            {rects.map((r, i) => {
                const tab = w.tabs[panes[i]];
                return (
                    <div
                        key={i}
                        className="absolute p-[3px]"
                        style={{
                            left: `${r.left * 100}%`,
                            top: `${r.top * 100}%`,
                            width: `${r.width * 100}%`,
                            height: `${r.height * 100}%`,
                        }}
                    >
                        <div
                            className={`flex h-full flex-col rounded-[5px] border px-2 py-1.5 ${
                                tab?.available === false
                                    ? 'border-dashed border-border text-muted-foreground'
                                    : 'border-border/70 bg-card'
                            }`}
                        >
                            <span className="truncate text-[11px] font-medium">
                                {tab?.serverName ?? (tab?.serverId === null ? 'Local' : 'Server')}
                            </span>
                            <span className="mt-1 h-1 w-3/5 rounded-full bg-primary/25" />
                            <span className="mt-1 h-1 w-2/5 rounded-full bg-muted-foreground/15" />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function WorkspacesPage() {
    const router = useRouter();
    const [workspaces, setWorkspaces] = useState<SavedWorkspace[] | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);
    const motion = useListMotion();

    useEffect(() => {
        fetch('/api/workspaces')
            .then((r) => r.json())
            .then((d) => setWorkspaces(d.success ? d.data.workspaces : []))
            .catch(() => setWorkspaces([]));
    }, []);

    const remove = (id: string) => {
        setConfirming(null);
        motion.remove(id, () => setWorkspaces((list) => list?.filter((w) => w.id !== id) ?? null));
        void fetch(`/api/workspaces/${id}`, { method: 'DELETE' }).catch(() => {});
    };

    return (
        <div className={`${PAGE_CONTENT_WIDTH} space-y-6 pb-16`}>
            <PageHeader
                title="Workspaces"
                description="Servers you work on together, saved with how they share the screen. Open one to bring them all back at once."
            />

            {workspaces === null ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            ) : workspaces.length === 0 ? (
                <EmptyStateCard
                    icon={LayoutPanelLeft}
                    title="No saved workspaces"
                    description="Open a few servers side by side in Connections, then choose Layout, then “Save current as workspace”."
                    action={
                        <Button asChild>
                            <Link href="/panel/sessions">
                                <Monitor /> Go to Connections
                            </Link>
                        </Button>
                    }
                />
            ) : (
                <ul className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
                    {workspaces.map((w) => {
                        const missing = w.tabs.filter((t) => !t.available).length;
                        return (
                            <MotionRow
                                key={w.id}
                                motion={motion}
                                id={w.id}
                                className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4"
                            >
                                <LayoutSketch w={w} />
                                <div className="min-w-0">
                                    <h2 className="truncate font-medium">{w.name}</h2>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {w.tabs.length} {w.tabs.length === 1 ? 'server' : 'servers'}
                                        {w.split
                                            ? `, ${LAYOUT_LABEL[w.split.layout].toLowerCase()}`
                                            : ''}
                                        {missing > 0 && (
                                            <span className="text-warning">
                                                , {missing} no longer available
                                            </span>
                                        )}
                                    </p>
                                </div>
                                {confirming === w.id ? (
                                    <div className="mt-auto flex items-center gap-2">
                                        <span className="mr-auto text-sm">
                                            Delete this workspace?
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => remove(w.id)}
                                        >
                                            Delete
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setConfirming(null)}
                                        >
                                            Keep
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="mt-auto flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            className="flex-1"
                                            onClick={() =>
                                                router.push(`/panel/sessions?workspace=${w.id}`)
                                            }
                                        >
                                            <Play /> Open
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 hover:text-danger"
                                            aria-label={`Delete ${w.name}`}
                                            title="Delete"
                                            onClick={() => setConfirming(w.id)}
                                        >
                                            <Trash2 />
                                        </Button>
                                    </div>
                                )}
                            </MotionRow>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
