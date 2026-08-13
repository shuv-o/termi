'use client';

import { useState } from 'react';
import { Check, Copy, Key, KeyRound, Loader2, Lock, Pencil, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { KeychainEntry } from './types';

/** One row in the vault list — icon, label/username, type pill, and actions. */
export function KeychainEntryCard({
    entry,
    copiedField,
    onCopyUsername,
    onCopySecret,
    onEdit,
    onDelete,
}: {
    entry: KeychainEntry;
    copiedField: 'user' | 'pass' | null;
    onCopyUsername: () => void;
    onCopySecret: () => void;
    onEdit: () => void;
    onDelete: () => Promise<void>;
}) {
    // Deleting an entry can silently break every server that references it, so
    // this needs a confirm step rather than the single-click delete it had
    // before — same inline "Remove?" pattern used for passkeys and sessions.
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        setDeleting(true);
        await onDelete();
        setDeleting(false);
        setConfirming(false);
    }

    const accent = entry.hasPrivateKey
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
        : 'border-primary/30 bg-primary/10 text-primary';

    return (
        <div className="group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-secondary/40 transition-colors">
            <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl border shrink-0 ${accent}`}
            >
                {entry.hasPrivateKey ? (
                    <Key className="w-4.5 h-4.5" />
                ) : (
                    <Lock className="w-4.5 h-4.5" />
                )}
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                    <p className="truncate text-sm font-semibold">{entry.label}</p>
                    <span
                        className={`hidden sm:inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${accent}`}
                    >
                        {entry.hasPrivateKey ? 'SSH key' : 'Password'}
                    </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                    <User className="w-3 h-3 text-muted-foreground shrink-0" />
                    <p className="flex-1 truncate font-mono text-xs text-muted-foreground">
                        {entry.username}
                    </p>
                    <button
                        onClick={onCopyUsername}
                        title="Copy username"
                        className="shrink-0 p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                    >
                        {copiedField === 'user' ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                            <Copy className="w-3 h-3" />
                        )}
                    </button>
                </div>
            </div>

            {confirming ? (
                <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden sm:inline text-xs text-destructive">
                        Delete this entry?
                    </span>
                    <button
                        onClick={() => setConfirming(false)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                    >
                        Cancel
                    </button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="h-7 text-xs px-2"
                    >
                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
                    </Button>
                </div>
            ) : (
                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                    <span className="hidden lg:inline text-[11px] text-muted-foreground mr-2 whitespace-nowrap">
                        Added {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                    {(entry.hasPassword || entry.hasPrivateKey) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                            onClick={onCopySecret}
                            title={entry.hasPrivateKey ? 'Copy SSH key' : 'Copy password'}
                        >
                            {copiedField === 'pass' ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                                <KeyRound className="w-4 h-4" />
                            )}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={onEdit}
                    >
                        <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirming(true)}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}
