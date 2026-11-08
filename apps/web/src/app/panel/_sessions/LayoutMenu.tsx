'use client';

import { useCallback, useState } from 'react';
import {
    Bookmark,
    Check,
    Columns2,
    LayoutGrid,
    Loader2,
    Radio,
    Rows2,
    Square,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MIN_PANES, type SplitLayout, type SplitState } from './split';

export interface SavedWorkspace {
    id: string;
    name: string;
    split: { layout: SplitLayout; panes: number[]; x: number; y: number } | null;
    tabs: { serverId: string | null; serverName: string | null; available: boolean }[];
}

const LAYOUTS: { id: SplitLayout | null; label: string; icon: typeof Square; min: number }[] = [
    { id: null, label: 'Single pane', icon: Square, min: 0 },
    { id: 'columns', label: 'Side by side', icon: Columns2, min: MIN_PANES.columns },
    { id: 'rows', label: 'Stacked', icon: Rows2, min: MIN_PANES.rows },
    { id: 'grid', label: 'Grid', icon: LayoutGrid, min: MIN_PANES.grid },
];

/**
 * The workspace's layout menu: how sessions share the screen, broadcast
 * typing, and saved workspaces (open, save the current one, delete).
 */
export function LayoutMenu({
    split,
    sessionCount,
    onLayout,
    broadcast,
    onBroadcast,
    onOpenWorkspace,
    onSaveWorkspace,
}: {
    split: SplitState | null;
    sessionCount: number;
    onLayout: (layout: SplitLayout | null) => void;
    broadcast: boolean;
    onBroadcast: (on: boolean) => void;
    onOpenWorkspace: (w: SavedWorkspace) => void;
    /** Resolves to an error message, or null when saved. */
    onSaveWorkspace: (name: string) => Promise<string | null>;
}) {
    const [workspaces, setWorkspaces] = useState<SavedWorkspace[] | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/workspaces');
            const data = await res.json();
            setWorkspaces(data.success ? data.data.workspaces : []);
        } catch {
            setWorkspaces([]);
        }
    }, []);

    const remove = async (id: string) => {
        setWorkspaces((list) => list?.filter((w) => w.id !== id) ?? null);
        await fetch(`/api/workspaces/${id}`, { method: 'DELETE' }).catch(() => {});
    };

    const Current = LAYOUTS.find((l) => l.id === (split?.layout ?? null))!.icon;

    return (
        <>
            <DropdownMenu onOpenChange={(open) => open && void load()}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn('gap-1.5 shrink-0', broadcast && split && 'text-warning')}
                        aria-label="Layout and workspaces"
                    >
                        <Current className="w-4 h-4" />
                        <span className="hidden lg:inline">Layout</span>
                        {broadcast && split && <Radio className="w-3.5 h-3.5" aria-hidden />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>Layout</DropdownMenuLabel>
                    {LAYOUTS.map(({ id, label, icon: Icon, min }) => {
                        const selected = (split?.layout ?? null) === id;
                        return (
                            <DropdownMenuItem
                                key={label}
                                disabled={sessionCount < min}
                                onSelect={() => onLayout(id)}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="flex-1">{label}</span>
                                {selected && <Check className="w-3.5 h-3.5" />}
                                {!selected && sessionCount < min && (
                                    <span className="text-[11px] text-muted-foreground">
                                        {min}+ sessions
                                    </span>
                                )}
                            </DropdownMenuItem>
                        );
                    })}
                    <DropdownMenuItem
                        disabled={!split}
                        onSelect={(e) => {
                            e.preventDefault();
                            onBroadcast(!broadcast);
                        }}
                    >
                        <Radio className="w-4 h-4" />
                        <span className="flex-1">Type in all panes</span>
                        {broadcast && split && <Check className="w-3.5 h-3.5" />}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                    {workspaces === null ? (
                        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                        </div>
                    ) : workspaces.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">
                            Save the sessions you have open, with their layout, to reopen them in
                            one click.
                        </p>
                    ) : (
                        workspaces.map((w) => {
                            const missing = w.tabs.filter((t) => !t.available).length;
                            return (
                                <DropdownMenuItem
                                    key={w.id}
                                    onSelect={() => onOpenWorkspace(w)}
                                    className="group"
                                >
                                    <Bookmark className="w-4 h-4" />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate">{w.name}</span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {w.tabs.length} session{w.tabs.length === 1 ? '' : 's'}
                                            {missing > 0 && ` · ${missing} unavailable`}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`Delete workspace ${w.name}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            void remove(w.id);
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="rounded p-1 text-muted-foreground opacity-60 hover:bg-danger/10 hover:text-danger hover:opacity-100 focus-visible:opacity-100"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </DropdownMenuItem>
                            );
                        })
                    )}
                    <DropdownMenuItem
                        disabled={sessionCount === 0}
                        onSelect={() => setSaving(true)}
                    >
                        <span className="flex-1">Save current as workspace…</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {saving && (
                <SaveWorkspaceDialog
                    onClose={() => setSaving(false)}
                    onSave={onSaveWorkspace}
                    existing={workspaces?.map((w) => w.name) ?? []}
                />
            )}
        </>
    );
}

function SaveWorkspaceDialog({
    onClose,
    onSave,
    existing,
}: {
    onClose: () => void;
    onSave: (name: string) => Promise<string | null>;
    existing: string[];
}) {
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const replaces = existing.includes(name.trim());

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Save workspace</DialogTitle>
                </DialogHeader>
                <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        const err = await onSave(name.trim());
                        setBusy(false);
                        if (err) setError(err);
                        else onClose();
                    }}
                >
                    <p className="text-xs text-muted-foreground">
                        Saves the open sessions and how they are split, to reopen together later.
                    </p>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Production"
                        maxLength={60}
                        autoFocus
                        aria-label="Workspace name"
                    />
                    {replaces && (
                        <p className="text-xs text-warning">
                            This replaces the saved workspace with the same name.
                        </p>
                    )}
                    {error && <p className="text-xs text-danger">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!name.trim() || busy}>
                            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                            Save workspace
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
