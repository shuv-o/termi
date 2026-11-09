'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, KeyRound, Laptop, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/format';
import { deviceGatewayAvailable } from '@/lib/gateway/connect';
import { isPasskeySupported, webauthnAuthenticate } from '@/lib/webauthn/client';
import { SettingsSection } from './SettingsSection';

interface Registered {
    keyId: string;
    name: string;
    createdAt: string;
}

const noSubscribe = () => () => {};

/** RFC 7638 thumbprint of a public P-256 key, as the server computes it. */
async function thumbprint(k: { crv: string; kty: string; x: string; y: string }) {
    const json = JSON.stringify({ crv: k.crv, kty: k.kty, x: k.x, y: k.y });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    let bin = '';
    for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Desktop app only: let this computer connect to the user's own servers
 * directly. Turning it on hands the app server logins (sealed to its key),
 * so it needs a fresh password or passkey, and lasts as long as this sign-in.
 */
export function ThisComputerCard() {
    // False on the server render, so hydration matches; true in the desktop app.
    const available = useSyncExternalStore(noSubscribe, deviceGatewayAvailable, () => false);
    const [registered, setRegistered] = useState<Registered | null>(null);
    const [matches, setMatches] = useState(true);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const api = window.electronAPI?.localGateway;
        if (!api) return;
        try {
            const [res, local] = await Promise.all([fetch('/api/devices'), api.device()]);
            const data = await res.json().catch(() => null);
            const device: Registered | null = data?.data?.device ?? null;
            setRegistered(device);
            if (device && !('error' in local)) {
                setMatches((await thumbprint(local.sigKey)) === device.keyId);
            }
            if ('error' in local) setError(local.error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (available) void load();
    }, [available, load]);

    const register = async (proof: Record<string, unknown> = {}) => {
        const api = window.electronAPI?.localGateway;
        if (!api) return;
        setBusy(true);
        setError('');
        try {
            const local = await api.device();
            if ('error' in local) return setError(local.error);
            const res = await fetch('/api/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...local, ...proof }),
            });
            const data = await res.json().catch(() => null);
            if (res.status === 401 && data?.error === 'Re-authentication required') {
                setConfirming(true);
                return;
            }
            if (!data?.success) return setError(data?.error || 'Could not set up this computer');
            setConfirming(false);
            setPassword('');
            setMatches(true);
            setRegistered(data.data.device);
        } catch {
            setError('Could not set up this computer');
        } finally {
            setBusy(false);
        }
    };

    const registerWithPasskey = async () => {
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
            if (!data?.success) return setError('Could not start passkey confirmation.');
            await register({ passkeyResponse: await webauthnAuthenticate(data.data) });
        } catch {
            setError('Passkey confirmation was cancelled or failed.');
        }
    };

    const remove = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/devices', { method: 'DELETE' });
            if (res.ok) setRegistered(null);
            else setError('Could not turn this off');
        } finally {
            setBusy(false);
        }
    };

    if (!available) return null;

    const active = !!registered && matches;

    return (
        <Card className="border-border p-6">
            <SettingsSection
                title="This computer"
                description="Let this app connect to your own servers directly — terminals, files and port forwarding — for servers set to connect from this computer."
                icon={Laptop}
                iconBg="bg-primary/15 text-primary"
            >
                {loading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                    </div>
                ) : (
                    <div className="space-y-3">
                        {active ? (
                            <p className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-success" />
                                Set up as “{registered.name}”{' '}
                                {formatRelativeTime(registered.createdAt)}. Signing out turns it
                                off.
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {registered
                                    ? 'This sign-in was set up with different keys. Set it up again to connect from here.'
                                    : 'Logins for your servers are sent to this app sealed to a key that never leaves this computer. Shared and team servers always go through Termi.'}
                            </p>
                        )}

                        {!confirming ? (
                            <div className="flex flex-wrap gap-2">
                                {!active && (
                                    <Button size="sm" onClick={() => register()} disabled={busy}>
                                        {busy && <Loader2 className="animate-spin" />}
                                        Set up this computer
                                    </Button>
                                )}
                                {registered && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={remove}
                                        disabled={busy}
                                    >
                                        Turn off
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <form
                                className="space-y-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void register({ authPassword: password });
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
                                    <Button type="submit" size="sm" disabled={!password || busy}>
                                        {busy && <Loader2 className="animate-spin" />}
                                        Set up this computer
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={registerWithPasskey}
                                        disabled={busy}
                                    >
                                        <KeyRound /> Use a passkey
                                    </Button>
                                </div>
                            </form>
                        )}

                        {error && <p className="text-[13px] text-danger">{error}</p>}
                    </div>
                )}
            </SettingsSection>
        </Card>
    );
}
