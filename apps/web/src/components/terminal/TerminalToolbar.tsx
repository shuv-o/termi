'use client';

/**
 * One-tap command strip for the terminal.
 *
 * Sends text to the active shell through the same `onKey` channel the virtual
 * keyboard uses, so it works identically on desktop and mobile and needs no
 * gateway support.
 *
 * The safety rule that shapes this component: a button either *types* a command
 * for the user to review and press Enter on, or it *runs* it outright. Built-in
 * tools that run outright are read-only diagnostics plus `sudo -i`. Custom
 * snippets default to type-only, and running-on-tap is an explicit opt-in —
 * a mistyped snippet should not be able to destroy a production box because
 * someone brushed the toolbar.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    Wrench,
    ShieldAlert,
    Activity,
    HardDrive,
    MemoryStick,
    Clock,
    ListTree,
    LogOut,
    Plus,
    Trash2,
    Loader2,
    X,
    AlertTriangle,
    Play,
    Keyboard as KeyboardIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export interface Snippet {
    id: string;
    label: string;
    command: string;
    icon?: string | null;
    runImmediately: boolean;
}

interface BuiltinTool {
    key: string;
    label: string;
    command: string;
    icon: React.ComponentType<{ className?: string }>;
    /** Send a trailing newline, i.e. execute rather than type. */
    run: boolean;
    title: string;
    /** Rendered in the warning colour — currently only the root switch. */
    danger?: boolean;
}

/**
 * `sudo -i` runs immediately because a half-typed sudo is useless, and it is
 * not destructive on its own — it just starts a root shell. Everything else
 * here only reads state.
 */
const BUILTIN_TOOLS: BuiltinTool[] = [
    {
        key: 'root',
        label: 'Root',
        command: 'sudo -i',
        icon: ShieldAlert,
        run: true,
        title: 'Switch to a root shell (sudo -i)',
        danger: true,
    },
    {
        key: 'exit',
        label: 'Exit',
        command: 'exit',
        icon: LogOut,
        run: true,
        title: 'Leave the current shell (exit)',
    },
    {
        key: 'htop',
        label: 'htop',
        command: 'htop',
        icon: Activity,
        run: true,
        title: 'Interactive process viewer (htop)',
    },
    {
        key: 'disk',
        label: 'Disk',
        command: 'df -h',
        icon: HardDrive,
        run: true,
        title: 'Disk usage (df -h)',
    },
    {
        key: 'memory',
        label: 'Memory',
        command: 'free -h',
        icon: MemoryStick,
        run: true,
        title: 'Memory usage (free -h)',
    },
    {
        key: 'uptime',
        label: 'Uptime',
        command: 'uptime',
        icon: Clock,
        run: true,
        title: 'Load average and uptime',
    },
    {
        key: 'ports',
        label: 'Ports',
        command: 'ss -tulpn',
        icon: ListTree,
        run: true,
        title: 'Listening sockets (ss -tulpn)',
    },
];

interface Props {
    /** Sends raw input to the active shell. */
    onKey: (key: string) => void;
    onClose?: () => void;
}

export default function TerminalToolbar({ onKey, onClose }: Props) {
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [loading, setLoading] = useState(true);
    const [managing, setManaging] = useState(false);

    const loadSnippets = useCallback(async () => {
        try {
            const res = await fetch('/api/snippets');
            const data = await res.json();
            if (data.success) setSnippets(data.data.snippets);
        } catch {
            // A toolbar without custom snippets is still useful; fail quietly.
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSnippets();
    }, [loadSnippets]);

    /** Type a command, optionally pressing Enter for the user. */
    const send = useCallback(
        (command: string, run: boolean) => {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(8);
            }
            onKey(run ? `${command}\r` : command);
        },
        [onKey],
    );

    return (
        <div className="shrink-0 border-t border-border bg-card/60">
            <div className="flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto no-scrollbar">
                <Wrench className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />

                {BUILTIN_TOOLS.map((tool) => (
                    <ToolChip
                        key={tool.key}
                        icon={tool.icon}
                        label={tool.label}
                        title={tool.title}
                        danger={tool.danger}
                        onClick={() => send(tool.command, tool.run)}
                    />
                ))}

                {snippets.length > 0 && (
                    <span className="w-px h-5 bg-border shrink-0 mx-0.5" aria-hidden="true" />
                )}

                {snippets.map((snippet) => (
                    <ToolChip
                        key={snippet.id}
                        icon={snippet.runImmediately ? Play : KeyboardIcon}
                        label={snippet.label}
                        title={
                            snippet.runImmediately
                                ? `Run: ${snippet.command}`
                                : `Type (does not run): ${snippet.command}`
                        }
                        onClick={() => send(snippet.command, snippet.runImmediately)}
                    />
                ))}

                {loading && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin opacity-50" />}

                <button
                    onClick={() => setManaging(true)}
                    title="Manage snippets"
                    className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Snippet</span>
                </button>

                {onClose && (
                    <button
                        onClick={onClose}
                        title="Hide toolbar"
                        className="ml-auto shrink-0 p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {managing && (
                <SnippetManager
                    snippets={snippets}
                    onChange={loadSnippets}
                    onClose={() => setManaging(false)}
                />
            )}
        </div>
    );
}

function ToolChip({
    icon: Icon,
    label,
    title,
    danger,
    onClick,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    title: string;
    danger?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                danger
                    ? 'text-amber-400 hover:bg-amber-500/15'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
        >
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}

//   Snippet management

function SnippetManager({
    snippets,
    onChange,
    onClose,
}: {
    snippets: Snippet[];
    onChange: () => void;
    onClose: () => void;
}) {
    const [label, setLabel] = useState('');
    const [command, setCommand] = useState('');
    const [runImmediately, setRunImmediately] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const add = async () => {
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/snippets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label, command, runImmediately }),
            });
            const data = await res.json();

            if (!data.success) {
                setError(data.error || 'Could not save the snippet');
                return;
            }

            setLabel('');
            setCommand('');
            setRunImmediately(false);
            onChange();
        } catch {
            setError('Could not save the snippet');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        try {
            await fetch(`/api/snippets/${id}`, { method: 'DELETE' });
            onChange();
        } catch {
            setError('Could not delete the snippet');
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg">
                <div className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">Command snippets</h2>
                        <p className="text-sm text-muted-foreground">
                            One-tap commands for the terminal toolbar.
                        </p>
                    </div>

                    {/* Snippets are stored unencrypted, so say so where it matters:
                        at the point someone would otherwise paste a password. */}
                    <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Snippets are stored as plain text and are not encrypted. Don&apos;t put
                            passwords or keys in one — save those on the server record instead.
                        </span>
                    </div>

                    {snippets.length > 0 && (
                        <ul className="space-y-1.5 max-h-52 overflow-y-auto">
                            {snippets.map((snippet) => (
                                <li
                                    key={snippet.id}
                                    className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium truncate">
                                            {snippet.label}
                                        </div>
                                        <code className="text-xs text-muted-foreground truncate block">
                                            {snippet.command}
                                        </code>
                                    </div>
                                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                                        {snippet.runImmediately ? 'Runs' : 'Types'}
                                    </span>
                                    <button
                                        onClick={() => remove(snippet.id)}
                                        title="Delete snippet"
                                        className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="space-y-3 pt-1 border-t border-border">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="snippet-label">Label</Label>
                                <Input
                                    id="snippet-label"
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    placeholder="Logs"
                                    maxLength={40}
                                />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="snippet-command">Command</Label>
                                <Input
                                    id="snippet-command"
                                    value={command}
                                    onChange={(e) => setCommand(e.target.value)}
                                    placeholder="journalctl -u nginx -n 100"
                                    maxLength={2000}
                                    className="font-mono text-xs"
                                />
                            </div>
                        </div>

                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={runImmediately}
                                onChange={(e) => setRunImmediately(e.target.checked)}
                                className="mt-1 accent-primary"
                            />
                            <span>
                                Run immediately on tap
                                <span className="block text-xs text-muted-foreground">
                                    Off by default: the command is typed at the prompt so you can
                                    check it before pressing Enter.
                                </span>
                            </span>
                        </label>

                        {error && <p className="text-sm text-destructive">{error}</p>}

                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={onClose}>
                                Done
                            </Button>
                            <Button
                                onClick={add}
                                disabled={saving || !label.trim() || !command.trim()}
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Plus className="w-4 h-4" />
                                )}
                                Add snippet
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
