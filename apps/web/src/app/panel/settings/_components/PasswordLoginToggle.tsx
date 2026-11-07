'use client';

import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SetUser, User } from '../types';

/**
 * "Passkey only": turn password sign-in off, so a stolen or phished password
 * can't be used. Needs a passkey; confirmed with the current password.
 */
export function PasswordLoginToggle({
    user,
    setUser,
    passkeyCount,
}: {
    user: User;
    setUser: SetUser;
    passkeyCount: number;
}) {
    const [confirming, setConfirming] = useState(false);
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    if (user.isGoogleUser) return null;
    const on = user.passwordLoginDisabled;
    const canEnable = passkeyCount > 0;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/auth/password-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disabled: !on, authPassword: password }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Could not change this setting');
                return;
            }
            setUser((u) =>
                u ? { ...u, passwordLoginDisabled: data.data.passwordLoginDisabled } : u,
            );
            setConfirming(false);
            setPassword('');
        } catch {
            setError('Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-6 rounded-xl border border-border/60 p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                        <p className="text-sm font-medium">Passkey only</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {on
                                ? 'Password sign-in is off. Only your passkeys can sign in, so a leaked password is useless.'
                                : canEnable
                                  ? 'Turn off password sign-in so only your passkeys can sign in. Resetting your password by email turns it back on.'
                                  : 'Add a passkey first, then you can turn off password sign-in.'}
                        </p>
                    </div>
                </div>
                {!confirming && (
                    <Button
                        size="sm"
                        variant={on ? 'secondary' : 'default'}
                        disabled={!on && !canEnable}
                        onClick={() => setConfirming(true)}
                        className="shrink-0"
                    >
                        {on ? 'Allow passwords' : 'Turn on'}
                    </Button>
                )}
            </div>
            {confirming && (
                <form onSubmit={submit} className="mt-4 space-y-2">
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Confirm with your password"
                        autoComplete="current-password"
                        autoFocus
                    />
                    {error && <p className="text-xs text-danger">{error}</p>}
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                setConfirming(false);
                                setPassword('');
                                setError('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={!password || saving}>
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {on ? 'Allow password sign-in' : 'Turn off password sign-in'}
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
}
