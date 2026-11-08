'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, LogOut, Mail, Plus, Server, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { revalidate, useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { connectHref } from '@/lib/connect-route';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
const ROLE_LABEL: Record<Role, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' };
const RANK: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };
const YOU_ARE: Record<Role, string> = {
    OWNER: 'You own this team: you can manage members, roles and the vault, or delete the team.',
    ADMIN: 'You are an admin: you can invite and remove members and manage the vault.',
    MEMBER: 'You are a member: you can connect to its servers and add servers you own.',
};

interface TeamDetail {
    id: string;
    name: string;
    role: Role;
    members: { userId: string; email: string; name: string | null; role: Role; you: boolean }[];
    servers: {
        id: string;
        name: string;
        protocol: string;
        host: string;
        port: number;
        ownerEmail: string;
        yours: boolean;
    }[];
    invitations: { id: string; email: string; role: Role; expiresAt: string }[];
}

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const url = `/api/teams/${id}`;
    const { data, error: loadError } = useCachedFetch<{ team: TeamDetail }>(url);
    const { data: mine } = useCachedFetch<{
        servers: { id: string; name: string; host: string }[];
    }>('/api/servers');
    const team = data?.team;
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
    const [notice, setNotice] = useState('');
    const [inviteLink, setInviteLink] = useState('');

    const call = async (path: string, method: string, body?: unknown) => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch(path, {
                method,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const json = await res.json().catch(() => null);
            if (!json?.success) {
                setError(json?.error || 'That did not work');
                return false;
            }
            const link: string | undefined = json.data?.inviteUrl;
            revalidate(url, url);
            revalidate('/api/teams', '/api/teams');
            revalidate('/api/shared-servers', '/api/shared-servers');
            return link ?? true;
        } finally {
            setBusy(false);
        }
    };

    if (loadError) {
        return (
            <div className="mx-auto max-w-4xl p-4 lg:p-8">
                <p className="text-sm text-muted-foreground">
                    This team doesn&apos;t exist, or you&apos;re not in it.
                </p>
            </div>
        );
    }
    if (!team)
        return <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-muted-foreground" />;

    const isAdmin = RANK[team.role] >= RANK.ADMIN;
    const isOwner = team.role === 'OWNER';
    const inTeam = new Set(team.servers.map((s) => s.id));
    const addable = (mine?.servers ?? []).filter((s) => !inTeam.has(s.id));
    const me = team.members.find((m) => m.you)!;

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-4 lg:p-8">
            <Link
                href="/panel/teams"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" /> Teams
            </Link>
            <PageHeader title={team.name} description={YOU_ARE[team.role]} />
            {error && <p className="text-sm text-danger">{error}</p>}

            {/* Vault */}
            <Card className="space-y-3 p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Server className="h-4 w-4 text-primary" /> Servers
                </h2>
                <p className="text-xs text-muted-foreground">
                    Everyone in the team can connect to these. Each stays owned by whoever added it:
                    only they can edit it or see its password or key.
                </p>
                {team.servers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No servers yet.</p>
                ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                        {team.servers.map((s) => (
                            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={connectHref(s.id, s.protocol)}
                                        className="text-sm font-medium hover:underline"
                                    >
                                        {s.name}
                                    </Link>
                                    <p className="truncate font-mono text-xs text-muted-foreground">
                                        {s.host}:{s.port} · {s.yours ? 'yours' : s.ownerEmail}
                                    </p>
                                </div>
                                {(s.yours || isAdmin) && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy}
                                        aria-label={`Remove ${s.name} from the team`}
                                        onClick={() => call(`${url}/servers/${s.id}`, 'DELETE')}
                                    >
                                        <X />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {addable.length > 0 && (
                    <form
                        className="flex gap-2"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const serverId = new FormData(e.currentTarget).get('serverId');
                            if (serverId) await call(`${url}/servers`, 'POST', { serverId });
                        }}
                    >
                        <select
                            name="serverId"
                            aria-label="Server to add"
                            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                        >
                            {addable.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name} ({s.host})
                                </option>
                            ))}
                        </select>
                        <Button type="submit" size="sm" disabled={busy}>
                            <Plus /> Add server
                        </Button>
                    </form>
                )}
            </Card>

            {/* Members */}
            <Card className="space-y-3 p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-primary" /> Members
                </h2>
                <ul className="divide-y divide-border rounded-lg border border-border">
                    {team.members.map((m) => {
                        const canRemove =
                            !m.you && (isOwner || (team.role === 'ADMIN' && m.role === 'MEMBER'));
                        return (
                            <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm">
                                        {m.name || m.email}{' '}
                                        {m.you && (
                                            <span className="text-muted-foreground">(you)</span>
                                        )}
                                    </p>
                                    {m.name && (
                                        <p className="truncate text-xs text-muted-foreground">
                                            {m.email}
                                        </p>
                                    )}
                                </div>
                                {isOwner && !m.you ? (
                                    <select
                                        value={m.role}
                                        aria-label={`Role of ${m.email}`}
                                        disabled={busy}
                                        onChange={(e) =>
                                            call(`${url}/members/${m.userId}`, 'PATCH', {
                                                role: e.target.value,
                                            })
                                        }
                                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                                    >
                                        {(['OWNER', 'ADMIN', 'MEMBER'] as const).map((r) => (
                                            <option key={r} value={r}>
                                                {ROLE_LABEL[r]}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                                        {ROLE_LABEL[m.role]}
                                    </span>
                                )}
                                {canRemove && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy}
                                        aria-label={`Remove ${m.email}`}
                                        onClick={() => call(`${url}/members/${m.userId}`, 'DELETE')}
                                    >
                                        <X />
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ul>

                {isAdmin && (
                    <form
                        className="flex flex-col gap-2 sm:flex-row"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const link = await call(`${url}/members`, 'POST', {
                                email: inviteEmail,
                                role: inviteRole,
                            });
                            if (link) {
                                setNotice(`Invitation emailed to ${inviteEmail}.`);
                                setInviteLink(typeof link === 'string' ? link : '');
                                setInviteEmail('');
                            }
                        }}
                    >
                        <Input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="teammate@example.com"
                            aria-label="Email to invite"
                        />
                        <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as Role)}
                            aria-label="Invite as"
                            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                        >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                        <Button
                            type="submit"
                            disabled={busy || !inviteEmail.includes('@')}
                            className="shrink-0"
                        >
                            <Mail /> Invite
                        </Button>
                    </form>
                )}
                {notice && <p className="text-xs text-success">{notice}</p>}
                {inviteLink && (
                    <p className="text-xs text-muted-foreground">
                        Or send them this link (it only works for that email address):{' '}
                        <button
                            type="button"
                            className="font-medium text-primary hover:underline"
                            onClick={() =>
                                navigator.clipboard.writeText(inviteLink).catch(() => {})
                            }
                        >
                            Copy invitation link
                        </button>
                    </p>
                )}

                {team.invitations.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Waiting to join</p>
                        {team.invitations.map((inv) => (
                            <div key={inv.id} className="flex items-center gap-2 text-sm">
                                <span className="flex-1 truncate">{inv.email}</span>
                                <span className="text-xs text-muted-foreground">
                                    {ROLE_LABEL[inv.role]}
                                </span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    aria-label={`Withdraw invitation to ${inv.email}`}
                                    onClick={() => call(`${url}/invitations/${inv.id}`, 'DELETE')}
                                >
                                    <X />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <div className="flex flex-wrap gap-2">
                <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                        if (await call(`${url}/members/${me.userId}`, 'DELETE'))
                            router.push('/panel/teams');
                    }}
                >
                    <LogOut /> Leave team
                </Button>
                {isOwner && (
                    <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={async () => {
                            if (
                                !window.confirm(
                                    `Delete the team "${team.name}"? Its members lose access to its servers. The servers themselves are kept by their owners.`,
                                )
                            )
                                return;
                            if (await call(url, 'DELETE')) router.push('/panel/teams');
                        }}
                    >
                        <Trash2 /> Delete team
                    </Button>
                )}
            </div>
        </div>
    );
}
