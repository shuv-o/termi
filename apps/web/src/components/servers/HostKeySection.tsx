'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Fingerprint,
    KeyRound,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/format';
import { isPasskeySupported, webauthnAuthenticate } from '@/lib/webauthn/client';

interface PinnedKey {
    fingerprint: string;
    keyType: string | null;
    trustedAt: string;
}
interface PresentedKey {
    fingerprint: string;
    keyType: string;
}

/**
 * The server's pinned SSH host key (Termi's known_hosts entry). Termi refuses
 * to connect when the server presents a different key; this is where the
 * owner compares the new key and, if the change is expected, trusts it.
 * Owner-only: the section hides itself for anyone else.
 */
export function HostKeySection({
    serverId,
    embedded = false,
    onTrusted,
}: {
    serverId: string;
    /** Called after a new key is trusted, so a list can show it. */
    onTrusted?: () => void;
    /** Inside another list (Known hosts): no heading, and it checks straight away. */
    embedded?: boolean;
}) {
    const url = `/api/servers/${serverId}/host-key`;
    const [hidden, setHidden] = useState(false);
    const [pinned, setPinned] = useState<PinnedKey | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [presented, setPresented] = useState<PresentedKey | null>(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [password, setPassword] = useState('');
    const [trusting, setTrusting] = useState(false);

    useEffect(() => {
        let alive = true;
        fetch(url)
            .then(async (res) => {
                const data = await res.json().catch(() => null);
                if (!alive) return;
                if (!res.ok || !data?.success) return setHidden(true);
                setPinned(data.data.pinned);
                setLoaded(true);
            })
            .catch(() => alive && setHidden(true));
        return () => {
            alive = false;
        };
    }, [url]);

    const check = useCallback(async () => {
        setChecking(true);
        setError('');
        setConfirming(false);
        try {
            const res = await fetch(`${url}?check=1`);
            const data = await res.json().catch(() => null);
            if (!data?.success) {
                setPresented(null);
                setError(data?.error || 'Could not read the host key');
                return;
            }
            setPinned(data.data.pinned);
            setPresented(data.data.presented);
        } catch {
            setError('Could not read the host key');
        } finally {
            setChecking(false);
        }
    }, [url]);

    const trust = async (proof: Record<string, unknown> = {}) => {
        if (!presented) return;
        setTrusting(true);
        setError('');
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fingerprint: presented.fingerprint, ...proof }),
            });
            const data = await res.json().catch(() => null);
            if (res.status === 401 && data?.error === 'Re-authentication required') {
                setConfirming(true);
                return;
            }
            if (!data?.success) {
                setError(data?.error || 'Could not trust this key');
                return;
            }
            setPinned(data.data.pinned);
            onTrusted?.();
            setConfirming(false);
            setPassword('');
        } catch {
            setError('Could not trust this key');
        } finally {
            setTrusting(false);
        }
    };

    const trustWithPasskey = async () => {
        setError('');
        try {
            if (!(await isPasskeySupported())) {
                setError('Passkeys are not available here. Use your password.');
                return;
            }
            const res = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json().catch(() => null);
            if (!data?.success) {
                setError('Could not start passkey confirmation.');
                return;
            }
            await trust({ passkeyResponse: await webauthnAuthenticate(data.data) });
        } catch {
            setError('Passkey confirmation was cancelled or failed.');
        }
    };

    // Opened from the Known hosts list: the person asked to check, so check.
    useEffect(() => {
        if (embedded && loaded) void check();
        // Once, when the pinned key has loaded.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedded, loaded]);

    if (hidden || !loaded) return null;

    const changed = !!presented && !!pinned && presented.fingerprint !== pinned.fingerprint;
    const unpinned = !!presented && !pinned;

    const verdict = (
        <>
            {presented && !changed && !unpinned && (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-success">
                    <CheckCircle2 className="h-4 w-4" /> The server presents this key.
                </p>
            )}

            {(changed || unpinned) && presented && (
                <div
                    className={
                        changed
                            ? 'mt-4 rounded-lg border border-danger/25 bg-danger/5 p-3'
                            : 'mt-4 rounded-lg border border-border p-3'
                    }
                >
                    {changed && (
                        <p className="flex items-start gap-2 text-sm font-medium text-danger">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            The server presents a different key
                        </p>
                    )}
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        {changed
                            ? 'Expected after reinstalling the server or regenerating its keys. Otherwise someone may be intercepting the connection: compare the key below with the output of '
                            : 'The server presents this key. To be sure it is the real server, compare it with the output of '}
                        <code className="font-mono">
                            ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub
                        </code>{' '}
                        run on the server itself.
                    </p>
                    <p className="mt-2 break-all font-mono text-[13px]">
                        {presented.fingerprint}{' '}
                        <span className="text-muted-foreground">({presented.keyType})</span>
                    </p>

                    {!confirming ? (
                        <Button
                            size="sm"
                            variant={changed ? 'destructive' : 'default'}
                            className="mt-3"
                            onClick={() => trust()}
                            disabled={trusting}
                        >
                            {trusting && <Loader2 className="animate-spin" />}
                            Trust this key
                        </Button>
                    ) : (
                        <form
                            className="mt-3 space-y-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void trust({ authPassword: password });
                            }}
                        >
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Confirm with your password"
                                autoComplete="current-password"
                                autoFocus
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button type="submit" size="sm" disabled={!password || trusting}>
                                    {trusting && <Loader2 className="animate-spin" />}
                                    Trust this key
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={trustWithPasskey}
                                    disabled={trusting}
                                >
                                    <KeyRound /> Use a passkey
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        </>
    );

    if (embedded) {
        return (
            <div>
                {checking && !presented && (
                    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Asking the server for its key…
                    </p>
                )}
                {verdict}
            </div>
        );
    }

    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                    <Fingerprint className="h-4 w-4 text-primary" />
                    Host key
                </h2>
                <Button variant="secondary" size="sm" onClick={check} disabled={checking}>
                    {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Check now
                </Button>
            </div>

            <Card className="p-4">
                {pinned ? (
                    <>
                        <p className="text-[13px] text-muted-foreground">
                            Termi only connects when the server proves it holds this key
                            {pinned.keyType ? ` (${pinned.keyType})` : ''}. Trusted{' '}
                            {formatRelativeTime(pinned.trustedAt)}.
                        </p>
                        <p className="mt-2 break-all font-mono text-[13px]">{pinned.fingerprint}</p>
                    </>
                ) : (
                    <p className="text-[13px] text-muted-foreground">
                        No key recorded yet. Termi records the server&apos;s key on the first
                        connection and refuses any other key after that.
                    </p>
                )}

                {verdict}
            </Card>
        </div>
    );
}
