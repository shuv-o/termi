'use client';

import { Fingerprint, Loader2, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LoginState } from './useLogin';

/** Post-login prompt offering to register a passkey on this device. */
export function PasskeySetup({ state }: { state: LoginState }) {
    const { passkeySetupLoading, passkeySetupError } = state;

    return (
        <div className="p-8">
            <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Fingerprint className="w-7 h-7 text-primary" />
                </div>
            </div>
            <h1 className="text-2xl font-bold text-center mb-2">Set up a Passkey</h1>
            <p className="text-muted-foreground text-center mb-5 text-sm">
                Use Face ID, Touch ID, or your device PIN to sign in faster and more securely.
            </p>
            <div className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border mb-5 text-sm text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                    Passkeys are phishing-resistant cryptographic keys — no password needed.
                </span>
            </div>
            <div className="space-y-2 mb-5">
                <Label htmlFor="passkeyName">
                    Passkey name{' '}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                    id="passkeyName"
                    value={state.passkeySetupName}
                    onChange={(e) => state.setPasskeySetupName(e.target.value)}
                    className="bg-secondary border-border"
                    placeholder="e.g. MacBook Pro, iPhone 15"
                    maxLength={64}
                />
            </div>
            {passkeySetupError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm mb-4">
                    {passkeySetupError}
                </div>
            )}
            <Button
                onClick={state.setUpPasskey}
                disabled={passkeySetupLoading}
                className="w-full mb-3"
            >
                {passkeySetupLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Fingerprint className="w-4 h-4" />
                )}
                {passkeySetupLoading ? 'Waiting for system dialog…' : 'Create Passkey'}
            </Button>
            {passkeySetupLoading && (
                <p className="text-xs text-muted-foreground text-center mb-3">
                    Look for a Touch ID or passkey prompt on your screen.
                </p>
            )}
            <Button
                variant="ghost"
                onClick={state.skipPasskeySetup}
                className="w-full text-muted-foreground"
            >
                <X className="w-4 h-4" /> Skip for now
            </Button>
        </div>
    );
}
