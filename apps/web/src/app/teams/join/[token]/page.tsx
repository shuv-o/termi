'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

type State =
    | { kind: 'loading' }
    | { kind: 'signin' }
    | { kind: 'invalid' }
    | { kind: 'ready'; teamName: string; role: string; email: string }
    | { kind: 'error'; message: string };

/** Accept a team invitation (the signed-in account's email must match). */
export default function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const router = useRouter();
    const [state, setState] = useState<State>({ kind: 'loading' });
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        fetch(`/api/teams/join/${token}`)
            .then(async (res) => {
                if (res.status === 401) return setState({ kind: 'signin' });
                const body = await res.json();
                if (!body.success) return setState({ kind: 'invalid' });
                setState({ kind: 'ready', ...body.data.invitation });
            })
            .catch(() => setState({ kind: 'invalid' }));
    }, [token]);

    const join = async () => {
        setJoining(true);
        const res = await fetch(`/api/teams/join/${token}`, { method: 'POST' });
        const body = await res.json().catch(() => null);
        setJoining(false);
        if (body?.success) router.push(`/panel/teams/${body.data.teamId}`);
        else setState({ kind: 'error', message: body?.error || 'Could not join the team' });
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
                <Users className="mx-auto h-8 w-8 text-primary" />
                {state.kind === 'loading' && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
                {state.kind === 'signin' && (
                    <>
                        <p className="text-sm">Sign in to accept this team invitation.</p>
                        <Button asChild>
                            <Link href={`/login?next=/teams/join/${token}`}>
                                <LogIn /> Sign in
                            </Link>
                        </Button>
                    </>
                )}
                {state.kind === 'invalid' && (
                    <p className="text-sm text-muted-foreground">
                        This invitation has expired or was already used.
                    </p>
                )}
                {state.kind === 'error' && <p className="text-sm text-danger">{state.message}</p>}
                {state.kind === 'ready' && (
                    <>
                        <p className="text-lg font-semibold">Join {state.teamName}</p>
                        <p className="text-sm text-muted-foreground">
                            You were invited as {state.role === 'ADMIN' ? 'an admin' : 'a member'} (
                            {state.email}). You&apos;ll be able to connect to the team&apos;s
                            servers.
                        </p>
                        <Button onClick={join} disabled={joining} className="w-full">
                            {joining && <Loader2 className="animate-spin" />} Join team
                        </Button>
                    </>
                )}
            </div>
        </main>
    );
}
