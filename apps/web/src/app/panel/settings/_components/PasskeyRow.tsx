'use client';

import { useState } from 'react';
import { Fingerprint, Globe, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Passkey } from '../types';

const DATE_OPTS: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
};

export function PasskeyRow({
    passkey,
    onDelete,
}: {
    passkey: Passkey;
    onDelete: (id: string) => void;
}) {
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        setDeleting(true);
        await onDelete(passkey.id);
        setDeleting(false);
        setConfirming(false);
    }

    const isMultiDevice = passkey.deviceType === 'multiDevice' || passkey.backedUp;
    const lastUsed = passkey.lastUsedAt
        ? new Date(passkey.lastUsedAt).toLocaleDateString(undefined, DATE_OPTS)
        : 'Never';
    const created = new Date(passkey.createdAt).toLocaleDateString(undefined, DATE_OPTS);

    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border/50 group">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Fingerprint className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{passkey.name}</p>
                    {isMultiDevice && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/20 text-primary text-[10px] font-medium shrink-0">
                            <Globe className="w-2.5 h-2.5" /> Synced
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Added {created} · Last used: {lastUsed}
                </p>
            </div>
            {confirming ? (
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-xs text-destructive">Remove?</span>
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
                            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Remove'}
                        </Button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setConfirming(true)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100"
                    title="Remove passkey"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}
