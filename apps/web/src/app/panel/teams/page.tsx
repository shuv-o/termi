'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Server, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { mutateCache, useCachedFetch } from '@/lib/hooks/useCachedFetch';

interface TeamSummary {
    id: string;
    name: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
    memberCount: number;
    serverCount: number;
}

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' } as const;

export default function TeamsPage() {
    const { data, isLoading } = useCachedFetch<{ teams: TeamSummary[] }>('/api/teams');
    const teams = data?.teams ?? [];
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError('');
        try {
            const res = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const body = await res.json();
            if (!body.success) {
                setError(body.error || 'Could not create the team');
                return;
            }
            setName('');
            mutateCache<{ teams: TeamSummary[] }>('/api/teams', (prev) => ({
                teams: [
                    ...(prev?.teams ?? []),
                    { ...body.data.team, role: 'OWNER', memberCount: 1, serverCount: 0 },
                ],
            }));
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
            <PageHeader
                title="Teams"
                description="Share a vault of servers with the people you work with. Each server stays owned by whoever added it; members can connect, but never see its passwords or keys."
            />

            <Card className="p-4">
                <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="New team name, e.g. Platform"
                        maxLength={60}
                        aria-label="Team name"
                    />
                    <Button type="submit" disabled={!name.trim() || creating} className="shrink-0">
                        {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                        Create team
                    </Button>
                </form>
                {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            </Card>

            {isLoading && teams.length === 0 ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            ) : teams.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    You&apos;re not in a team yet. Create one, or ask a teammate to invite you.
                </p>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {teams.map((t) => (
                        <li key={t.id}>
                            <Link
                                href={`/panel/teams/${t.id}`}
                                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="font-medium">{t.name}</p>
                                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                                        {ROLE_LABEL[t.role]}
                                    </span>
                                </div>
                                <p className="mt-2 flex gap-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <Users className="h-3.5 w-3.5" /> {t.memberCount} member
                                        {t.memberCount === 1 ? '' : 's'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Server className="h-3.5 w-3.5" /> {t.serverCount} server
                                        {t.serverCount === 1 ? '' : 's'}
                                    </span>
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
