'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Server, CheckCircle, XCircle, Loader2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TerminalLogo from '@/components/common/Logo';

interface InvitationData {
    id: string;
    inviterEmail: string;
    serverName: string;
    serverProtocol: string;
    inviteeEmail: string;
    permissions: string;
    expiresAt: string;
}

type State = 'loading' | 'valid' | 'invalid' | 'accepting' | 'accepted' | 'error' | 'wrong-user';

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
    const router = useRouter();
    const [token, setToken] = useState<string>('');
    const [state, setState] = useState<State>('loading');
    const [invitation, setInvitation] = useState<InvitationData | null>(null);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        params.then(p => setToken(p.token));
    }, [params]);

    useEffect(() => {
        if (!token) return;

        async function load() {
            // Fetch invitation details
            const invRes = await fetch(`/api/invitations/${token}`);
            const invData = await invRes.json();

            if (!invData.success) {
                setState('invalid');
                return;
            }

            setInvitation(invData.data.invitation);

            // Check current auth session
            const meRes = await fetch('/api/auth/me');
            const meData = await meRes.json();

            if (meData.success) {
                setCurrentUserEmail(meData.data.user.email);
                // Check email matches
                const invEmail = invData.data.invitation.inviteeEmail.toLowerCase();
                const loggedIn = meData.data.user.email.toLowerCase();
                if (invEmail !== loggedIn) {
                    setState('wrong-user');
                } else {
                    setState('valid');
                }
            } else {
                setState('valid'); // Not logged in — show accept options
            }
        }

        load().catch(() => setState('invalid'));
    }, [token]);

    const handleAccept = async () => {
        setState('accepting');
        try {
            const res = await fetch(`/api/invitations/${token}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setState('accepted');
                setTimeout(() => router.push('/panel'), 2500);
            } else {
                setErrorMsg(data.error || 'Failed to accept invitation');
                setState('error');
            }
        } catch {
            setErrorMsg('Network error. Please try again.');
            setState('error');
        }
    };

    const protocolLabel = (p: string) => p.toUpperCase();
    const permLabel = (p: string) => p === 'manage' ? 'Manage & Connect' : 'Connect Only';

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md">

                {/* Header */}
                <div className="flex flex-col items-center mb-8">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <span className="text-2xl font-bold gradient-text">Termi</span>
                </div>

                {/* Card */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">

                    {state === 'loading' && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">Loading invitation…</p>
                        </div>
                    )}

                    {state === 'invalid' && (
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <XCircle className="w-12 h-12 text-red-400" />
                            <h2 className="text-lg font-semibold">Invitation Expired</h2>
                            <p className="text-sm text-muted-foreground">
                                This invitation link is invalid or has expired. Please ask the server owner to send a new invitation.
                            </p>
                            <Button asChild variant="outline" className="mt-2">
                                <Link href="/login">Go to Login</Link>
                            </Button>
                        </div>
                    )}

                    {(state === 'valid' || state === 'accepting' || state === 'wrong-user') && invitation && (
                        <>
                            <div className="flex items-center gap-2 mb-5">
                                <Shield className="w-5 h-5 text-primary shrink-0" />
                                <h2 className="text-lg font-semibold">Server Invitation</h2>
                            </div>

                            {/* Invitation details */}
                            <div className="bg-secondary/50 rounded-xl p-4 mb-5 space-y-3">
                                <div className="flex items-start gap-3">
                                    <Server className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-muted-foreground mb-0.5">Server</p>
                                        <p className="font-medium text-sm">{invitation.serverName}</p>
                                        <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-md font-medium">
                                            {protocolLabel(invitation.serverProtocol)}
                                        </span>
                                    </div>
                                </div>

                                <div className="border-t border-border pt-3 space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Invited by</span>
                                        <span className="font-medium truncate ml-2 max-w-[180px]">{invitation.inviterEmail}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">For</span>
                                        <span className="font-medium truncate ml-2 max-w-[180px]">{invitation.inviteeEmail}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Access</span>
                                        <span className="font-medium">{permLabel(invitation.permissions)}</span>
                                    </div>
                                </div>
                            </div>

                            {state === 'wrong-user' ? (
                                <div className="space-y-3">
                                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-300">
                                        You are currently logged in as <strong>{currentUserEmail}</strong>.
                                        This invitation is for <strong>{invitation.inviteeEmail}</strong>.
                                        Please sign in with the correct account.
                                    </div>
                                    <Button asChild className="w-full">
                                        <Link href={`/login?next=/invitations/${token}`}>
                                            <LogIn className="w-4 h-4" /> Sign in with the right account
                                        </Link>
                                    </Button>
                                </div>
                            ) : currentUserEmail ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground text-center">
                                        Signed in as <strong>{currentUserEmail}</strong>
                                    </p>
                                    <Button
                                        className="w-full"
                                        onClick={handleAccept}
                                        disabled={state === 'accepting'}
                                    >
                                        {state === 'accepting' && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Accept Invitation
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground text-center">
                                        To accept, sign in or create a new account.
                                    </p>
                                    <Button asChild className="w-full">
                                        <Link href={`/login?next=/invitations/${token}`}>
                                            <LogIn className="w-4 h-4" /> Sign In
                                        </Link>
                                    </Button>
                                    <Button asChild variant="outline" className="w-full">
                                        <Link href={`/register?next=/invitations/${token}&email=${encodeURIComponent(invitation.inviteeEmail)}`}>
                                            <UserPlus className="w-4 h-4" /> Create Account
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    {state === 'accepted' && (
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <CheckCircle className="w-12 h-12 text-emerald-400" />
                            <h2 className="text-lg font-semibold">Invitation Accepted!</h2>
                            <p className="text-sm text-muted-foreground">
                                You now have access to <strong>{invitation?.serverName}</strong>.
                                Redirecting to your dashboard…
                            </p>
                        </div>
                    )}

                    {state === 'error' && (
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <XCircle className="w-12 h-12 text-red-400" />
                            <h2 className="text-lg font-semibold">Something went wrong</h2>
                            <p className="text-sm text-muted-foreground">{errorMsg}</p>
                            <Button variant="outline" onClick={() => setState('valid')}>Try Again</Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
