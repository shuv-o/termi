'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    Eye, EyeOff, Loader2, Mail, Smartphone,
    KeyRound, RefreshCw, CheckCircle, Fingerprint, X, ShieldCheck,
} from 'lucide-react';
import {
    startRegistration,
    startAuthentication,
    browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import TerminalLogo from "@/components/common/Logo";

type TwoFactorMethod = 'TOTP' | 'EMAIL' | null;

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const formRef = useRef<HTMLFormElement>(null);

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [requires2FA, setRequires2FA] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>(null);
    const [code, setCode] = useState('');
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const [showPasskeySetup, setShowPasskeySetup] = useState(false);
    const [passkeySetupLoading, setPasskeySetupLoading] = useState(false);
    const [passkeySetupName, setPasskeySetupName] = useState('');
    const [passkeySetupError, setPasskeySetupError] = useState('');
    const [webAuthnSupported, setWebAuthnSupported] = useState(false);

    useEffect(() => { setWebAuthnSupported(browserSupportsWebAuthn()); }, []);

    useEffect(() => {
        if (searchParams.get('verified') === '1') setInfo('Email verified successfully. You can now sign in.');
        if (searchParams.get('error') === 'verification-failed') setError(searchParams.get('message') || 'Email verification failed.');
    }, [searchParams]);

    useEffect(() => {
        if (typeof window === 'undefined' || !('credentials' in navigator)) return;
        navigator.credentials
            .get({ password: true, mediation: 'optional' } as CredentialRequestOptions)
            .then((cred) => {
                if (cred && cred.type === 'password') {
                    const pc = cred as PasswordCredential;
                    setFormData({ email: pc.id, password: (pc as any).password || '' });
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => clearInterval(t);
    }, [resendCooldown]);

    function handleLoginSuccess(data: any) {
        if (formData.email && typeof window !== 'undefined' && 'PasswordCredential' in window) {
            try {
                const cred = new PasswordCredential({ id: formData.email, password: formData.password, name: formData.email });
                navigator.credentials.store(cred).catch(() => {});
            } catch { /* not supported */ }
        }
        if (data?.suggestPasskeySetup && webAuthnSupported) setShowPasskeySetup(true);
        else router.push('/dashboard');
    }

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void performLogin(); };

    const performLogin = async () => {
        setError(''); setLoading(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            if (!data.success) { setError(data.error || 'Login failed'); setLoading(false); return; }
            if (data.data?.requires2FA) {
                setRequires2FA(true); setTwoFactorMethod(data.data.twoFactorMethod || 'TOTP');
                setInfo(data.data.message || ''); setLoading(false); return;
            }
            handleLoginSuccess(data.data);
        } catch { setError('An error occurred. Please try again.'); setLoading(false); }
    };

    const handleVerify = (e: React.FormEvent) => { e.preventDefault(); void performVerify(); };

    const performVerify = async () => {
        setError(''); setLoading(true);
        try {
            const response = await fetch('/api/auth/verify-2fa', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const data = await response.json();
            if (!data.success) { setError(data.error || 'Verification failed'); setLoading(false); return; }
            handleLoginSuccess(data.data);
        } catch { setError('An error occurred. Please try again.'); setLoading(false); }
    };

    const handlePasskeySignIn = async () => {
        setError(''); setPasskeyLoading(true);
        try {
            const optRes = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email || undefined }),
            });
            const optData = await optRes.json();
            if (!optData.success) { setError(optData.error || 'Failed to start passkey sign-in'); setPasskeyLoading(false); return; }
            const assertion = await startAuthentication({ optionsJSON: optData.data });
            const authRes = await fetch('/api/auth/passkey/authenticate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response: assertion }),
            });
            const authData = await authRes.json();
            if (!authData.success) { setError(authData.error || 'Passkey authentication failed'); setPasskeyLoading(false); return; }
            router.push('/dashboard');
        } catch (err: any) {
            if (err?.name !== 'NotAllowedError') setError('Passkey sign-in failed. Please try with your password.');
            setPasskeyLoading(false);
        }
    };

    const handlePasskeySetup = async () => {
        setPasskeySetupError(''); setPasskeySetupLoading(true);
        try {
            const optRes = await fetch('/api/auth/passkey/register-options');
            const optData = await optRes.json();
            if (!optData.success) { setPasskeySetupError(optData.error || 'Failed to start passkey setup'); setPasskeySetupLoading(false); return; }
            const registrationResponse = await startRegistration({ optionsJSON: optData.data });
            const regRes = await fetch('/api/auth/passkey/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: passkeySetupName.trim() || 'Passkey', response: registrationResponse }),
            });
            const regData = await regRes.json();
            if (!regData.success) { setPasskeySetupError(regData.error || 'Passkey registration failed'); setPasskeySetupLoading(false); return; }
            router.push('/dashboard');
        } catch (err: any) {
            setPasskeySetupError(err?.name === 'NotAllowedError' ? 'Passkey setup was cancelled.' : 'Passkey setup failed. Please try again or skip.');
            setPasskeySetupLoading(false);
        }
    };

    const handleResendEmail = async () => {
        setResendLoading(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'PUT' });
            const data = await res.json();
            if (data.success) { setInfo('A new verification code has been sent to your email.'); setResendCooldown(60); }
            else setError(data.error || 'Failed to resend code');
        } catch { setError('Failed to resend code'); }
        finally { setResendLoading(false); }
    };

    const PageShell = ({ children }: { children: React.ReactNode }) => (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-background to-slate-950">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            </div>
            <div className="relative w-full max-w-md">
                <Card className="bg-card border-border">
                    <CardContent className="p-8">
                        {/* Logo */}
                        <div className="flex items-center justify-center gap-3 mb-8">
                            <TerminalLogo width={48} height={48} className="rounded-xl" />
                            <span className="text-2xl font-bold gradient-text">Termi</span>
                        </div>

                        {children}
                    </CardContent>
                </Card>
            </div>
        </div>
    );

    // ── Passkey setup screen ──────────────────────────────────────────────────

    if (showPasskeySetup) {
        return (
            <PageShell>
                <div className="flex justify-center mb-4">
                    <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Fingerprint className="w-7 h-7 text-primary" />
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-center mb-2">Set up a Passkey</h1>
                <p className="text-muted-foreground text-center mb-6 text-sm">
                    Use Face ID, Touch ID, or your device PIN to sign in faster and more securely.
                </p>

                <div className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border mb-5 text-sm text-muted-foreground">
                    <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>Passkeys are phishing-resistant cryptographic keys — no password needed.</span>
                </div>

                <div className="space-y-2 mb-5">
                    <Label htmlFor="passkeyName">Passkey name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                        id="passkeyName"
                        value={passkeySetupName}
                        onChange={(e) => setPasskeySetupName(e.target.value)}
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

                <Button onClick={handlePasskeySetup} disabled={passkeySetupLoading} className="w-full mb-3">
                    {passkeySetupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                    {passkeySetupLoading ? 'Setting up…' : 'Create Passkey'}
                </Button>

                <Button variant="ghost" onClick={() => router.push('/dashboard')} className="w-full text-muted-foreground">
                    <X className="w-4 h-4" /> Skip for now
                </Button>
            </PageShell>
        );
    }

    // ── Main login UI ─────────────────────────────────────────────────────────

    return (
        <PageShell>
            {/* Info banner (email verified, etc.) */}
            {info && !requires2FA && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-6">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    {info}
                </div>
            )}

            {!requires2FA ? (
                <>
                    <h1 className="text-2xl font-bold text-center mb-2">Welcome back</h1>
                    <p className="text-muted-foreground text-center mb-8">Sign in to your account to continue</p>

                    <form ref={formRef} onSubmit={handleSubmit} method="POST" className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                type="email"
                                id="email"
                                name="username"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="bg-secondary border-border"
                                placeholder="you@example.com"
                                required
                                autoComplete="username email"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="bg-secondary border-border pr-12"
                                    placeholder="••••••••"
                                    required
                                    autoComplete="current-password"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                {error}
                            </div>
                        )}

                        <Button type="submit" disabled={loading} className="w-full">
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
                        </Button>
                    </form>

                    {/* Passkey sign-in */}
                    {webAuthnSupported && (
                        <>
                            <div className="my-5 flex items-center gap-3">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-xs text-muted-foreground">or</span>
                                <div className="flex-1 h-px bg-border" />
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                onClick={handlePasskeySignIn}
                                disabled={passkeyLoading}
                                className="w-full bg-secondary border-border hover:bg-secondary/80"
                            >
                                {passkeyLoading
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Fingerprint className="w-4 h-4 text-primary" />}
                                {passkeyLoading ? 'Waiting for passkey…' : 'Sign in with Passkey'}
                            </Button>
                        </>
                    )}
                </>
            ) : (
                <>
                    <div className="flex justify-center mb-4">
                        {twoFactorMethod === 'EMAIL'
                            ? <Mail className="w-8 h-8 text-primary" />
                            : <Smartphone className="w-8 h-8 text-primary" />}
                    </div>
                    <h1 className="text-2xl font-bold text-center mb-2">Two-Factor Authentication</h1>
                    <p className="text-muted-foreground text-center mb-6 text-sm">
                        {isRecoveryMode
                            ? 'Enter one of your recovery codes (format: XXXX-XXXX)'
                            : twoFactorMethod === 'EMAIL'
                                ? 'Enter the 6-digit code sent to your email'
                                : 'Enter the 6-digit code from your authenticator app'}
                    </p>

                    {info && !isRecoveryMode && (
                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm mb-4">
                            {info}
                        </div>
                    )}

                    <form onSubmit={handleVerify} method="POST" className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="code">{isRecoveryMode ? 'Recovery Code' : 'Verification Code'}</Label>
                            <Input
                                type="text"
                                id="code"
                                value={code}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setCode(isRecoveryMode ? v.toUpperCase().slice(0, 9) : v.replace(/\D/g, '').slice(0, 6));
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

                        <Button
                            type="submit"
                            disabled={loading || (isRecoveryMode ? code.length < 8 : code.length !== 6)}
                            className="w-full"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
                        </Button>

                        {twoFactorMethod === 'EMAIL' && !isRecoveryMode && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleResendEmail}
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
                                onClick={() => { setIsRecoveryMode(!isRecoveryMode); setCode(''); setError(''); }}
                                className="w-full bg-secondary border-border"
                            >
                                <KeyRound className="w-4 h-4" />
                                {isRecoveryMode ? 'Use authenticator app instead' : 'Use a recovery code'}
                            </Button>
                        )}

                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => { setRequires2FA(false); setCode(''); setError(''); setInfo(''); setIsRecoveryMode(false); }}
                            className="w-full text-muted-foreground"
                        >
                            Back to Login
                        </Button>
                    </form>
                </>
            )}

            <div className="mt-6 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-primary hover:text-primary/80">
                    Sign up
                </Link>
            </div>
        </PageShell>
    );
}
