'use client';

import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Invite someone into this live session: create a link (watch, or watch and
 * type). Opening it only *asks* to join — you let each person in from the
 * terminal, see who's connected and can remove anyone.
 */
export function ShareSessionDialog({
    sessionId,
    serverName,
    onClose,
}: {
    sessionId: string;
    serverName: string;
    onClose: () => void;
}) {
    const [mode, setMode] = useState<'view' | 'control'>('view');
    const [link, setLink] = useState<{ id: string; joinUrl: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const create = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/sessions/${sessionId}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode }),
            });
            const body = await res.json();
            if (!body.success) setError(body.error || 'Could not create a link');
            else setLink(body.data.share);
        } finally {
            setBusy(false);
        }
    };

    const turnOff = async () => {
        if (!link) return;
        await fetch(`/api/session-shares/${link.id}`, { method: 'DELETE' }).catch(() => {});
        setLink(null);
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Share this session</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Invite someone into your terminal on {serverName}. They need a Termi
                        account, and you let each person in when they open the link. They never see
                        the server&apos;s password or key.
                    </p>
                    {!link ? (
                        <>
                            <div
                                role="radiogroup"
                                aria-label="What they can do"
                                className="grid grid-cols-2 gap-2"
                            >
                                {(
                                    [
                                        ['view', 'Watch', 'See the terminal'],
                                        ['control', 'Watch and type', 'Run commands with you'],
                                    ] as const
                                ).map(([value, title, hint]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={mode === value}
                                        onClick={() => setMode(value)}
                                        className={`rounded-lg border p-3 text-left ${
                                            mode === value
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border hover:border-muted-foreground/40'
                                        }`}
                                    >
                                        <span className="block text-sm font-medium">{title}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {hint}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {error && <p className="text-sm text-danger">{error}</p>}
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button onClick={create} disabled={busy}>
                                    {busy && <Loader2 className="animate-spin" />} Create link
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <code
                                    data-testid="session-join-link"
                                    className="min-w-0 flex-1 truncate rounded-md bg-secondary px-2 py-1.5 font-mono text-xs"
                                >
                                    {link.joinUrl}
                                </code>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                        navigator.clipboard
                                            .writeText(link.joinUrl)
                                            .then(() => {
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 1500);
                                            })
                                            .catch(() => {})
                                    }
                                >
                                    {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Works for an hour. Turning it off stops new people from asking;
                                anyone already in stays until you remove them in the terminal.
                            </p>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={turnOff}>
                                    Turn off link
                                </Button>
                                <Button onClick={onClose}>Done</Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
