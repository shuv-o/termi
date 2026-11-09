'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Check,
    Copy,
    FileCode2,
    Keyboard,
    Loader2,
    Pencil,
    Play,
    Plus,
    Search,
    Send,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MotionRow, useListMotion } from '@/components/ui/list-motion';
import { PageHeader, PAGE_CONTENT_WIDTH } from '@/components/ui/page-header';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { Snippet } from '@/lib/snippets/types';
import { useSnippetRunner } from '@/components/snippets/SnippetRunner';
import { mutateCache, useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { commandParts } from '@/lib/snippets/variables';
import { NewSnippetDialog } from '@/components/snippets/NewSnippetDialog';
import { useSessionsContext } from '@/app/panel/_sessions/sessions-context';

const KEY = '/api/snippets';
type Data = { snippets: Snippet[] };

/** Everyday commands offered when the list is empty: one click saves one. */
const STARTERS = [
    { label: 'Disk space', command: 'df -h' },
    { label: 'Recent logs', command: 'journalctl -u {{service:nginx}} -n 100 --no-pager' },
    { label: 'Listening ports', command: 'ss -tulpn' },
    { label: 'Biggest folders', command: 'du -sh {{path:.}}/* | sort -h | tail -20' },
];

/** The command, with its {{variables}} picked out so you can see what it will ask for. */
function CommandText({ command }: { command: string }) {
    return (
        <code className="block whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed text-foreground/90">
            {commandParts(command).map((p, i) =>
                p.variable ? (
                    <span
                        key={i}
                        title={`Asks for ${p.variable} when you run it`}
                        className="rounded-[4px] bg-primary/12 px-1 text-primary"
                    >
                        {p.variable}
                    </span>
                ) : (
                    <span key={i}>{p.text}</span>
                ),
            )}
        </code>
    );
}

function SnippetEditor({
    snippet,
    onDone,
}: {
    snippet: Snippet;
    onDone: (saved?: Snippet) => void;
}) {
    const [label, setLabel] = useState(snippet.label);
    const [command, setCommand] = useState(snippet.command);
    const [runImmediately, setRunImmediately] = useState(snippet.runImmediately);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`${KEY}/${snippet.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, command, runImmediately }),
            });
            const body = await res.json();
            if (!body.success) return setError(body.error || 'Could not save the snippet');
            onDone(body.data.snippet);
        } catch {
            setError('Could not save the snippet');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5">
                <Label htmlFor={`label-${snippet.id}`}>Name</Label>
                <Input
                    id={`label-${snippet.id}`}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={40}
                    autoFocus
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`command-${snippet.id}`}>Command</Label>
                <Textarea
                    id={`command-${snippet.id}`}
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    maxLength={2000}
                    rows={Math.min(6, Math.max(2, command.split('\n').length))}
                    className="font-mono text-[13px]"
                />
                <p className="text-xs text-muted-foreground">
                    Write <code className="font-mono">{'{{name}}'}</code> where a value should be
                    asked for each time, or <code className="font-mono">{'{{name:default}}'}</code>{' '}
                    to suggest one.
                </p>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
                <span className="text-sm">
                    Press Enter for me
                    <span className="block text-xs text-muted-foreground">
                        Off: the command is typed in so you can check it first.
                    </span>
                </span>
                <Switch checked={runImmediately} onCheckedChange={setRunImmediately} />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onDone()}>
                    Cancel
                </Button>
                <Button type="submit" disabled={saving || !label.trim() || !command.trim()}>
                    {saving ? <Loader2 className="animate-spin" /> : <Check />}
                    Save changes
                </Button>
            </div>
        </form>
    );
}

export default function SnippetsPage() {
    const router = useRouter();
    const { data, isLoading } = useCachedFetch<Data>(KEY);
    const snippets = useMemo(() => data?.snippets ?? [], [data]);
    const { sessions, activeTabId, sendToSession } = useSessionsContext();
    const target = sessions.find((s) => s.tabId === activeTabId && s.status === 'connected');
    const runner = useSnippetRunner();
    const motion = useListMotion();

    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [adding, setAdding] = useState<string | null>(null);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return snippets;
        return snippets.filter(
            (s) => s.label.toLowerCase().includes(q) || s.command.toLowerCase().includes(q),
        );
    }, [snippets, query]);

    const added = (snippet: Snippet) => {
        mutateCache<Data>(KEY, (prev) => ({ snippets: [...(prev?.snippets ?? []), snippet] }));
        motion.arrived(snippet.id);
    };

    const addStarter = async (s: (typeof STARTERS)[number]) => {
        setAdding(s.label);
        try {
            const res = await fetch(KEY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...s, runImmediately: false }),
            });
            const body = await res.json();
            if (body.success) added(body.data.snippet);
        } finally {
            setAdding(null);
        }
    };

    const remove = (snippet: Snippet) => {
        setConfirming(null);
        motion.remove(snippet.id, () =>
            mutateCache<Data>(KEY, (prev) => ({
                snippets: (prev?.snippets ?? []).filter((s) => s.id !== snippet.id),
            })),
        );
        void fetch(`${KEY}/${snippet.id}`, { method: 'DELETE' }).catch(() => {});
    };

    const send = (snippet: Snippet) =>
        runner.run(snippet, (command) => {
            if (!target) return;
            sendToSession(target.tabId, snippet.runImmediately ? `${command}\r` : command);
            router.push('/panel/sessions');
        });

    const copy = (snippet: Snippet) =>
        runner.run(snippet, (command) => {
            navigator.clipboard.writeText(command).then(() => {
                setCopied(snippet.id);
                setTimeout(() => setCopied(null), 1500);
            });
        });

    return (
        <div className={`${PAGE_CONTENT_WIDTH} space-y-6 pb-16`}>
            {runner.dialog}
            <NewSnippetDialog
                open={creating}
                onClose={() => setCreating(false)}
                onCreated={added}
            />

            <PageHeader
                title="Snippets"
                description={
                    target
                        ? `Commands you run often. Send one to ${target.serverName} from here, or from any terminal's toolbar.`
                        : "Commands you run often, ready in any terminal's toolbar and in search (⌘K)."
                }
                actions={
                    <Button onClick={() => setCreating(true)}>
                        <Plus /> New snippet
                    </Button>
                }
            />

            {snippets.length > 6 && (
                <div className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Find a snippet"
                        aria-label="Find a snippet"
                        className="pl-8"
                    />
                </div>
            )}

            {isLoading && snippets.length === 0 ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            ) : snippets.length === 0 ? (
                <EmptyStateCard
                    icon={FileCode2}
                    title="Save the commands you type every day"
                    description="Start from one of these, or write your own. Words in braces are asked for when you run it."
                    action={
                        <div className="flex flex-wrap justify-center gap-2">
                            {STARTERS.map((s) => (
                                <Button
                                    key={s.label}
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => addStarter(s)}
                                    disabled={adding !== null}
                                >
                                    {adding === s.label ? (
                                        <Loader2 className="animate-spin" />
                                    ) : (
                                        <Plus />
                                    )}
                                    {s.label}
                                </Button>
                            ))}
                        </div>
                    }
                />
            ) : shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No snippet matches “{query}”.</p>
            ) : (
                <ul aria-label="Snippets">
                    {shown.map((s) => (
                        <MotionRow
                            key={s.id}
                            motion={motion}
                            id={s.id}
                            className="rounded-xl border border-border bg-card p-4"
                        >
                            {editing === s.id ? (
                                <SnippetEditor
                                    snippet={s}
                                    onDone={(saved) => {
                                        setEditing(null);
                                        if (!saved) return;
                                        mutateCache<Data>(KEY, (prev) => ({
                                            snippets: (prev?.snippets ?? []).map((x) =>
                                                x.id === saved.id ? saved : x,
                                            ),
                                        }));
                                    }}
                                />
                            ) : (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <h2 className="font-medium">{s.label}</h2>
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                {s.runImmediately ? (
                                                    <>
                                                        <Play className="h-3 w-3" /> Runs straight
                                                        away
                                                    </>
                                                ) : (
                                                    <>
                                                        <Keyboard className="h-3 w-3" /> Typed in
                                                        for you to check
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                        <CommandText command={s.command} />
                                    </div>

                                    {confirming === s.id ? (
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="text-sm">Delete this snippet?</span>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => remove(s)}
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
                                        <div className="flex shrink-0 items-center gap-1">
                                            {target ? (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => send(s)}
                                                    title={`Send to ${target.serverName}`}
                                                >
                                                    <Send /> Send
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => copy(s)}
                                                >
                                                    {copied === s.id ? (
                                                        <Check className="text-success" />
                                                    ) : (
                                                        <Copy />
                                                    )}
                                                    {copied === s.id ? 'Copied' : 'Copy'}
                                                </Button>
                                            )}
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label={`Edit ${s.label}`}
                                                title="Edit"
                                                onClick={() => setEditing(s.id)}
                                            >
                                                <Pencil />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label={`Delete ${s.label}`}
                                                title="Delete"
                                                className="hover:text-danger"
                                                onClick={() => setConfirming(s.id)}
                                            >
                                                <Trash2 />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </MotionRow>
                    ))}
                </ul>
            )}
        </div>
    );
}
