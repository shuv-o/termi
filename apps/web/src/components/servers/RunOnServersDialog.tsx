'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, Play, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';

interface ServerRow {
    id: string;
    name: string;
    host?: string;
    protocol: string;
    group?: { id: string; name: string } | null;
}

interface RunResult {
    serverId: string;
    serverName: string;
    success: boolean;
    output: string;
    error?: string;
    exitCode: number | null;
    durationMs: number;
}

const MAX_SERVERS = 50;

/**
 * Run one command (or a filled-in snippet) on several SSH servers at once and
 * see each one's output. Runs non-interactively (like `ssh host 'cmd'`), so
 * commands that wait for input time out.
 */
export function RunOnServersDialog({
    initialCommand = '',
    onClose,
}: {
    initialCommand?: string;
    onClose: () => void;
}) {
    const { data } = useCachedFetch<{ servers: ServerRow[] }>('/api/servers');
    const servers = useMemo(
        () => (data?.servers ?? []).filter((s) => s.protocol === 'SSH'),
        [data],
    );
    const groups = useMemo(() => {
        const map = new Map<string, { id: string; name: string; ids: string[] }>();
        for (const s of servers) {
            if (!s.group) continue;
            const g = map.get(s.group.id) ?? { ...s.group, ids: [] };
            g.ids.push(s.id);
            map.set(s.group.id, g);
        }
        return [...map.values()];
    }, [servers]);

    const [command, setCommand] = useState(initialCommand);
    const [selected, setSelected] = useState<string[]>([]);
    const [filter, setFilter] = useState('');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [results, setResults] = useState<RunResult[] | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const shown = servers.filter((s) =>
        `${s.name} ${s.host ?? ''}`.toLowerCase().includes(filter.toLowerCase()),
    );
    const toggle = (id: string, on: boolean) =>
        setSelected((cur) =>
            on ? [...new Set([...cur, id])].slice(0, MAX_SERVERS) : cur.filter((x) => x !== id),
        );

    const run = async () => {
        setRunning(true);
        setError('');
        setResults(null);
        try {
            const res = await fetch('/api/servers/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverIds: selected, command }),
            });
            const body = await res.json();
            if (!body.success) setError(body.error || 'The command could not be run');
            else {
                setResults(body.data.results);
                const firstFailed = (body.data.results as RunResult[]).find((r) => !r.success);
                setExpanded(firstFailed?.serverId ?? null);
            }
        } catch {
            setError('The command could not be run');
        } finally {
            setRunning(false);
        }
    };

    const okCount = results?.filter((r) => r.success).length ?? 0;

    return (
        <Dialog open onOpenChange={(open) => !open && !running && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Run on several servers</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor="run-command">Command</Label>
                        <Textarea
                            id="run-command"
                            value={command}
                            onChange={(e) => setCommand(e.target.value)}
                            placeholder="uptime"
                            rows={2}
                            spellCheck={false}
                            className="font-mono text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Runs without a terminal, like{' '}
                            <code className="font-mono">ssh host &apos;command&apos;</code> —
                            anything that waits for input times out.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Label className="mr-auto">
                                Servers{' '}
                                <span className="text-muted-foreground">
                                    ({selected.length} selected)
                                </span>
                            </Label>
                            {groups.map((g) => (
                                <Button
                                    key={g.id}
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                        setSelected((cur) =>
                                            [...new Set([...cur, ...g.ids])].slice(0, MAX_SERVERS),
                                        )
                                    }
                                >
                                    + {g.name}
                                </Button>
                            ))}
                            {selected.length > 0 && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSelected([])}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                        {servers.length > 8 && (
                            <Input
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder="Filter servers"
                                aria-label="Filter servers"
                            />
                        )}
                        <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
                            {shown.length === 0 && (
                                <p className="p-2 text-xs text-muted-foreground">
                                    No SSH servers{filter ? ' match' : ' yet'}.
                                </p>
                            )}
                            {shown.map((s) => (
                                <label
                                    key={s.id}
                                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary/50"
                                >
                                    <Checkbox
                                        checked={selected.includes(s.id)}
                                        onCheckedChange={(v) => toggle(s.id, v === true)}
                                        aria-label={s.name}
                                    />
                                    <span className="truncate">{s.name}</span>
                                    <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                                        {s.host}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-sm text-danger">{error}</p>}

                    {results && (
                        <div className="space-y-1">
                            <p className="text-sm">
                                <span className="font-medium">
                                    {okCount} of {results.length}
                                </span>{' '}
                                succeeded
                            </p>
                            <div className="max-h-64 space-y-1 overflow-y-auto">
                                {results.map((r) => (
                                    <div
                                        key={r.serverId}
                                        className="rounded-md border border-border"
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpanded((cur) =>
                                                    cur === r.serverId ? null : r.serverId,
                                                )
                                            }
                                            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
                                        >
                                            {expanded === r.serverId ? (
                                                <ChevronDown className="h-3.5 w-3.5" />
                                            ) : (
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            )}
                                            {r.success ? (
                                                <CheckCircle2 className="h-4 w-4 text-success" />
                                            ) : (
                                                <XCircle className="h-4 w-4 text-danger" />
                                            )}
                                            <span className="truncate">{r.serverName}</span>
                                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                                {r.error
                                                    ? r.error
                                                    : `exit ${r.exitCode ?? '?'} · ${(r.durationMs / 1000).toFixed(1)}s`}
                                            </span>
                                        </button>
                                        {expanded === r.serverId && (
                                            <pre
                                                data-testid={`run-output-${r.serverName}`}
                                                className="max-h-48 overflow-auto whitespace-pre-wrap break-all border-t border-border bg-secondary/30 p-2 font-mono text-xs"
                                            >
                                                {r.output || '(no output)'}
                                            </pre>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={running}>
                            Close
                        </Button>
                        <Button
                            type="button"
                            onClick={run}
                            disabled={running || !command.trim() || selected.length === 0}
                        >
                            {running ? <Loader2 className="animate-spin" /> : <Play />}
                            Run on {selected.length || ''} server{selected.length === 1 ? '' : 's'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
