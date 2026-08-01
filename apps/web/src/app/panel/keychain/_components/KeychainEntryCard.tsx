'use client';

import { useState } from 'react';
import { Check, Copy, Key, KeyRound, Loader2, Lock, Pencil, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { KeychainEntry } from './types';

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

    const badgeClass = entry.hasPrivateKey
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
        : 'border-primary/30 bg-primary/10 text-primary';

    return (
        <Card className="border-border hover:border-border/80 hover:shadow-md transition-all duration-200">
            <CardContent className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl border shrink-0 ${badgeClass}`}
                    >
                        {entry.hasPrivateKey ? (
                            <Key className="w-5 h-5" />
                        ) : (
                            <Lock className="w-5 h-5" />
                        )}
                    </div>
                    <span
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium ${badgeClass}`}
                    >
                        {entry.hasPrivateKey ? 'SSH key' : 'Password'}
                    </span>
                </div>

                <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{entry.label}</p>
                    <div className="mt-1 flex items-center gap-1.5 min-w-0">
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

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-4">
                    {confirming ? (
                        <div className="flex w-full items-center justify-between gap-2">
                            <span className="text-xs text-destructive">Delete this entry?</span>
                            <div className="flex items-center gap-1.5">
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
                                    {deleting ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        'Delete'
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-[11px] text-muted-foreground">
                                Added {new Date(entry.createdAt).toLocaleDateString()}
                            </p>
                            <div className="flex items-center gap-1">
                                {(entry.hasPassword || entry.hasPrivateKey) && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 rounded-lg text-muted-foreground hover:text-primary"
                                        onClick={onCopySecret}
                                        title={
                                            entry.hasPrivateKey ? 'Copy SSH key' : 'Copy password'
                                        }
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
                                    className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                                    onClick={onEdit}
                                >
                                    <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive"
                                    onClick={() => setConfirming(true)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
