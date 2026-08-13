'use client';

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2, Radio, Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { Group } from './types';

interface BroadcastResult {
    serverId: string;
    serverName: string;
    success: boolean;
    output: string;
    error?: string;
    exitCode: number | null;
    durationMs: number;
}

function ResultRow({ result }: { result: BroadcastResult }) {
    const [expanded, setExpanded] = useState(false);
    const hasOutput = result.output.trim().length > 0 || !!result.error;

    return (
        <div className="rounded-lg border border-border/60 bg-secondary/30 overflow-hidden">
            <button
                type="button"
                onClick={() => hasOutput && setExpanded((e) => !e)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                disabled={!hasOutput}
            >
                {result.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                    <X className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span className="text-sm font-medium truncate flex-1">{result.serverName}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                    {result.exitCode !== null ? `exit ${result.exitCode}` : 'no exit code'} ·{' '}
                    {(result.durationMs / 1000).toFixed(1)}s
                </span>
                {hasOutput && (
                    <ChevronDown
                        className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                )}
            </button>
            {expanded && hasOutput && (
                <pre className="px-3 pb-3 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {result.error
                        ? `Error: ${result.error}`
                        : result.output.trim() || '(no output)'}
                </pre>
            )}
        </div>
    );
}

/**
 * Run one command across every SSH server in a group at once — ad-hoc
 * exec via the server-side SSH pool, not the interactive terminal sessions.
 */
export function BroadcastModal({ group, onClose }: { group: Group | null; onClose: () => void }) {
    const [command, setCommand] = useState('');
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<BroadcastResult[] | null>(null);
    const [serverCount, setServerCount] = useState<number | null>(null);
    const [error, setError] = useState('');

    const handleClose = () => {
        setCommand('');
        setRunning(false);
        setResults(null);
        setServerCount(null);
        setError('');
        onClose();
    };

    const run = async () => {
        if (!group) return;
        setRunning(true);
        setError('');
        setResults(null);
        try {
            const res = await fetch(`/api/groups/${group.id}/broadcast`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to run the broadcast command');
                return;
            }
            setResults(data.data.results);
            setServerCount(data.data.serverCount);
        } catch {
            setError('Failed to run the broadcast command');
        } finally {
            setRunning(false);
        }
    };

    return (
        <Dialog open={!!group} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="sm:max-w-lg">
                <div className="space-y-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <Radio className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold">Run command on group</h2>
                            <p className="text-sm text-muted-foreground">
                                {group?.name} · {group?._count.servers ?? 0} server
                                {group?._count.servers === 1 ? '' : 's'} (SSH only)
                            </p>
                        </div>
                    </div>

                    {!results && (
                        <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Runs immediately on every SSH server in this group — there&apos;s no
                                confirmation step after this. Non-SSH servers are skipped.
                            </span>
                        </div>
                    )}

                    {!results ? (
                        <div className="space-y-3">
                            <Textarea
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                placeholder="systemctl restart nginx"
                                className="font-mono text-xs min-h-[80px]"
                                autoFocus
                                disabled={running}
                            />
                            {error && <p className="text-sm text-destructive">{error}</p>}
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={handleClose} disabled={running}>
                                    Cancel
                                </Button>
                                <Button onClick={run} disabled={running || !command.trim()}>
                                    {running ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Terminal className="w-4 h-4" />
                                    )}
                                    {running ? 'Running…' : 'Run on all servers'}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                {results.filter((r) => r.success).length} of {serverCount}{' '}
                                succeeded.
                            </p>
                            <div className="space-y-1.5 max-h-80 overflow-y-auto">
                                {results.map((r) => (
                                    <ResultRow key={r.serverId} result={r} />
                                ))}
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setResults(null);
                                        setServerCount(null);
                                    }}
                                >
                                    Run again
                                </Button>
                                <Button onClick={handleClose}>Done</Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
