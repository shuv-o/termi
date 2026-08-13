'use client';

import { AlertTriangle, CheckCircle2, Key, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SettingsSection } from '../_components/SettingsSection';
import type { useAccountSettings } from '../_hooks/useAccountSettings';
import type { User } from '../types';

type EncryptionState = ReturnType<typeof useAccountSettings>['encryption'];

export function EncryptionPanel({
    user,
    encryption,
}: {
    user: User | null;
    encryption: EncryptionState;
}) {
    const mismatch = !!encryption.confirm && encryption.passphrase !== encryption.confirm;

    return (
        <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
            <SettingsSection
                title="Credential Encryption"
                description="How your stored server credentials are protected at rest."
                icon={Lock}
                iconBg="bg-sky-500/15 text-sky-400"
            >
                {user?.isGoogleUser ? (
                    <div className="space-y-4">
                        <div
                            className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                                user.hasMasterKey
                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                            }`}
                        >
                            {user.hasMasterKey ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4 shrink-0" /> Encryption
                                    passphrase is set
                                </>
                            ) : (
                                <>
                                    <AlertTriangle className="w-4 h-4 shrink-0" /> No passphrase set
                                    — server connections won&apos;t work
                                </>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Your server credentials are encrypted with your passphrase. You enter it
                            each time you sign in with Google.
                        </p>
                        <form onSubmit={encryption.change} className="space-y-3">
                            <p className="text-sm text-muted-foreground font-medium">
                                {user.hasMasterKey
                                    ? 'Change encryption passphrase'
                                    : 'Set up encryption passphrase'}
                            </p>
                            <Input
                                type="password"
                                placeholder="New passphrase (min 8 characters)"
                                value={encryption.passphrase}
                                onChange={(e) => encryption.setPassphrase(e.target.value)}
                                className="bg-secondary border-border"
                                required
                                minLength={8}
                            />
                            <Input
                                type="password"
                                placeholder="Confirm passphrase"
                                value={encryption.confirm}
                                onChange={(e) => encryption.setConfirm(e.target.value)}
                                className={`bg-secondary ${mismatch ? 'border-destructive' : 'border-border'}`}
                                required
                                minLength={8}
                            />
                            {mismatch && (
                                <p className="text-xs text-destructive">Passphrases do not match</p>
                            )}
                            <Button
                                type="submit"
                                disabled={
                                    encryption.saving ||
                                    !encryption.passphrase ||
                                    encryption.passphrase !== encryption.confirm
                                }
                                className="w-full gap-2"
                            >
                                {encryption.saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                                    </>
                                ) : (
                                    <>
                                        <Key className="w-4 h-4" />{' '}
                                        {user.hasMasterKey ? 'Update Passphrase' : 'Set Passphrase'}
                                    </>
                                )}
                            </Button>
                        </form>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            Encryption active — key derived from your login password
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Credentials are encrypted with a key derived from your password.
                            Changing your password automatically re-encrypts all credentials. If you
                            reset a forgotten password, stored credentials are permanently lost.
                        </p>
                    </div>
                )}
            </SettingsSection>
        </Card>
    );
}
