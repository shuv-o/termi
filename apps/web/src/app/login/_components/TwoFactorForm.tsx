'use client';

import { KeyRound, Loader2, Mail, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { LoginState } from './useLogin';

/** Second-factor step: TOTP code, emailed OTP, or a recovery code. */
export function TwoFactorForm({ state }: { state: LoginState }) {
    const {
        twoFactorMethod,
        isRecoveryMode,
        code,
        setCode,
        info,
        error,
        loading,
        resendLoading,
        resendCooldown,
    } = state;

    const prompt = isRecoveryMode
        ? 'Enter one of your recovery codes (format: XXXX-XXXX)'
        : twoFactorMethod === 'EMAIL'
          ? 'Enter the 6-digit code sent to your email'
          : 'Enter the 6-digit code from your authenticator app';

    const submitDisabled = loading || (isRecoveryMode ? code.length < 8 : code.length !== 6);

    return (
        <>
            <div className="flex justify-center mb-4">
                {twoFactorMethod === 'EMAIL' ? (
                    <Mail className="w-8 h-8 text-primary" />
                ) : (
                    <Smartphone className="w-8 h-8 text-primary" />
                )}
            </div>
            <h1 className="text-xl font-bold text-center mb-1">Two-Factor Authentication</h1>
            <p className="text-muted-foreground text-center mb-5 text-sm">{prompt}</p>

            {info && !isRecoveryMode && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm mb-4">
                    {info}
                </div>
            )}

            <form onSubmit={state.submitVerify} method="POST" className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="code">
                        {isRecoveryMode ? 'Recovery Code' : 'Verification Code'}
                    </Label>
                    <Input
                        type="text"
                        id="code"
                        value={code}
                        onChange={(e) => {
                            const v = e.target.value;
                            setCode(
                                isRecoveryMode
                                    ? v.toUpperCase().slice(0, 9)
                                    : v.replace(/\D/g, '').slice(0, 6),
                            );
                        }}
                        className="bg-secondary border-border text-center text-2xl tracking-[0.5em] font-mono"
                        placeholder={isRecoveryMode ? 'XXXX-XXXX' : '000000'}
                        required
                        autoComplete="one-time-code"
                        inputMode={isRecoveryMode ? 'text' : 'numeric'}
                        maxLength={isRecoveryMode ? 9 : 6}
                        autoFocus
                    />
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                        {error}
                    </div>
                )}

                <Button type="submit" disabled={submitDisabled} className="w-full">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
                </Button>

                {twoFactorMethod === 'EMAIL' && !isRecoveryMode && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={state.resendEmailCode}
                        disabled={resendLoading || resendCooldown > 0}
                        className="w-full bg-secondary border-border"
                    >
                        <RefreshCw className={cn('w-4 h-4', resendLoading && 'animate-spin')} />
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </Button>
                )}

                {twoFactorMethod === 'TOTP' && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={state.toggleRecoveryMode}
                        className="w-full bg-secondary border-border"
                    >
                        <KeyRound className="w-4 h-4" />
                        {isRecoveryMode ? 'Use authenticator app instead' : 'Use a recovery code'}
                    </Button>
                )}

                <Button
                    type="button"
                    variant="ghost"
                    onClick={state.backToLogin}
                    className="w-full text-muted-foreground"
                >
                    Back to Login
                </Button>
            </form>
        </>
    );
}
