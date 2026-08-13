'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Snippet } from '@/components/terminal/TerminalToolbar';

/**
 * Standalone "create a snippet" dialog reachable from the command palette —
 * independent of any open terminal session, unlike the snippet manager
 * embedded in the terminal toolbar (which this mirrors the fields of).
 */
export function NewSnippetDialog({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    onCreated: (snippet: Snippet) => void;
}) {
    const [label, setLabel] = useState('');
    const [command, setCommand] = useState('');
    const [runImmediately, setRunImmediately] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const reset = () => {
        setLabel('');
        setCommand('');
        setRunImmediately(false);
        setError('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const submit = async () => {
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
            onCreated(data.data.snippet);
            reset();
            onClose();
        } catch {
            setError('Could not save the snippet');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <div className="space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold">New snippet</h2>
                        <p className="text-sm text-muted-foreground">
                            A one-tap command available from the terminal toolbar and this palette.
                        </p>
                    </div>

                    {/* Snippets are stored unencrypted, so say so where it matters: at
                        the point someone would otherwise paste a password. */}
                    <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Snippets are stored as plain text and are not encrypted. Don&apos;t put
                            passwords or keys in one — save those on the server record instead.
                        </span>
                    </div>

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="new-snippet-label">Label</Label>
                            <Input
                                id="new-snippet-label"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="Logs"
                                maxLength={40}
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-snippet-command">Command</Label>
                            <Input
                                id="new-snippet-command"
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                placeholder="journalctl -u nginx -n 100"
                                maxLength={2000}
                                className="font-mono text-xs"
                            />
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
                            <Button variant="ghost" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={submit}
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
