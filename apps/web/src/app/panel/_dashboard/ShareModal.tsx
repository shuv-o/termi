'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, Share2, Shield, Unlink, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ServerItem } from './types';

interface ShareData {
    shares: { id: string; permissions: string; sharedWith: { id: string; email: string } }[];
    pending: { id: string; inviteeEmail: string; permissions: string; expiresAt: string }[];
}

export function ShareModal({ server, onClose }: { server: ServerItem; onClose: () => void }) {
    const [email, setEmail] = useState('');
    const [permissions, setPermissions] = useState<'connect' | 'manage'>('connect');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [data, setData] = useState<ShareData | null>(null);
    const [loadingShares, setLoadingShares] = useState(true);

    useEffect(() => {
        fetch(`/api/servers/${server.id}/shares`)
            .then((r) => r.json())
            .then((d) => {
                if (d.success) setData(d.data);
            })
            .finally(() => setLoadingShares(false));
    }, [server.id]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setSending(true);
        try {
            const res = await fetch(`/api/servers/${server.id}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), permissions }),
            });
            const d = await res.json();
            if (!d.success) {
                setError(d.error || 'Failed to send invitation');
                return;
            }
            setSuccess(`Invitation sent to ${email.trim()}`);
            setEmail('');
            // Refresh share list
            const sharesRes = await fetch(`/api/servers/${server.id}/shares`);
            const sharesData = await sharesRes.json();
            if (sharesData.success) setData(sharesData.data);
        } finally {
            setSending(false);
        }
    };

    const handleRevoke = async (id: string, isInvitation = false) => {
        const shareId = isInvitation ? `inv:${id}` : id;
        await fetch(`/api/servers/${server.id}/shares/${shareId}`, { method: 'DELETE' });
        setData((prev) =>
            prev
                ? {
                      shares: isInvitation ? prev.shares : prev.shares.filter((s) => s.id !== id),
                      pending: isInvitation
                          ? prev.pending.filter((p) => p.id !== id)
                          : prev.pending,
                  }
                : null,
        );
    };

    const hasAnyShares = (data?.shares.length || 0) + (data?.pending.length || 0) > 0;

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="bg-card border-border max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2.5">
                        <Share2 className="w-4 h-4 text-primary" />
                        Share &quot;{server.name}&quot;
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleInvite} className="space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                            Invite by email
                        </label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input
                                    type="email"
                                    placeholder="colleague@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full pl-8 pr-3 py-2 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                                />
                            </div>
                            <Button type="submit" size="sm" disabled={sending || !email.trim()}>
                                {sending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <UserPlus className="w-3.5 h-3.5" />
                                )}
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Access level
                        </label>
                        <div className="flex bg-secondary rounded-lg p-0.5 gap-0.5">
                            {(['connect', 'manage'] as const).map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPermissions(p)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                                        permissions === p
                                            ? 'bg-primary text-white'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {p === 'connect' ? 'Connect only' : 'Full manage'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}
                    {success && <p className="text-xs text-emerald-400">{success}</p>}
                </form>

                {loadingShares ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                ) : hasAnyShares ? (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Shared with
                        </p>

                        {data?.shares.map((share) => (
                            <div
                                key={share.id}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/60 border border-border/50"
                            >
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-xs shrink-0">
                                    {share.sharedWith.email[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">
                                        {share.sharedWith.email}
                                    </p>
                                    <p className="text-[10px] text-emerald-400">
                                        Active · {share.permissions}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRevoke(share.id)}
                                    className="text-muted-foreground/50 hover:text-red-400 transition-colors"
                                    title="Revoke access"
                                >
                                    <Unlink className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}

                        {data?.pending.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/40 border border-border/40 opacity-70"
                            >
                                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                    <Mail className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">
                                        {inv.inviteeEmail}
                                    </p>
                                    <p className="text-[10px] text-amber-400">
                                        Pending invitation · {inv.permissions}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRevoke(inv.id, true)}
                                    className="text-muted-foreground/50 hover:text-red-400 transition-colors"
                                    title="Cancel invitation"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 py-4 text-center">
                        <Shield className="w-8 h-8 text-muted-foreground/20" />
                        <p className="text-xs text-muted-foreground">Not shared with anyone yet</p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default ShareModal;
