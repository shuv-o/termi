'use client';

import { use, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GuestStatus } from '@/components/terminal/GuestTerminal';

const GuestTerminal = dynamic(() => import('@/components/terminal/GuestTerminal'), { ssr: false });

interface ShareInfo {
    ownerEmail: string;
    serverName: string;
    mode: 'view' | 'control';
}

/** Ask to join someone's live terminal session from a link they shared. */
export default function JoinSessionPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const [info, setInfo] = useState<ShareInfo | null>(null);
    const [error, setError] = useState('');
    const [join, setJoin] = useState<{
        token: string;
        gatewayUrl: string;
        serverId: string;
    } | null>(null);
    const [status, setStatus] = useState<{ s: GuestStatus; detail?: string }>({ s: 'connecting' });

    useEffect(() => {
        fetch(`/api/session-shares/join/${code}`)
            .then((r) => r.json())
            .then((b) =>
                b.success ? setInfo(b.data.share) : setError(b.error || 'Link not found'),
            )
            .catch(() => setError('Link not found'));
    }, [code]);

    const askToJoin = async () => {
        const res = await fetch(`/api/session-shares/join/${code}`, { method: 'POST' });
        const body = await res.json().catch(() => null);
        if (!body?.success) setError(body?.error || 'Could not join');
        else setJoin(body.data);
    };

    if (error) {
        return <p className="p-8 text-sm text-muted-foreground">{error}</p>;
    }
    if (!info) return <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin" />;

    if (!join) {
        return (
            <div className="mx-auto mt-16 max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
                <UsersRound className="mx-auto h-8 w-8 text-primary" />
                <p className="font-medium">
                    {info.ownerEmail} invited you to {info.mode === 'control' ? 'work in' : 'watch'}{' '}
                    their terminal on {info.serverName}
                </p>
                <p className="text-sm text-muted-foreground">
                    They&apos;ll be asked to let you in.
                </p>
                <Button onClick={askToJoin} className="w-full">
                    Ask to join
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-2 p-3 lg:h-[calc(100vh-var(--shell-top,0px))]">
            <p className="text-sm text-muted-foreground" role="status">
                {status.s === 'connecting' && 'Connecting…'}
                {status.s === 'waiting' && `Waiting for ${info.ownerEmail} to let you in…`}
                {status.s === 'joined' &&
                    `${info.ownerEmail}'s session on ${info.serverName}${info.mode === 'control' ? ' — you can type' : ''}`}
                {status.s === 'ended' && (status.detail ?? 'The session ended')}
            </p>
            <div className="min-h-0 flex-1">
                <GuestTerminal
                    gatewayUrl={join.gatewayUrl}
                    serverId={join.serverId}
                    token={join.token}
                    onStatus={(s, detail) => setStatus({ s, detail })}
                />
            </div>
        </div>
    );
}
