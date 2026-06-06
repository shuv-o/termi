'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    Eye,
    EyeOff,
    Loader2,
    Mail,
    Smartphone,
    KeyRound,
    RefreshCw,
    CheckCircle,
    Fingerprint,
    X,
    ShieldCheck,
    Terminal,
    Shield,
    Zap,
    Globe,
} from 'lucide-react';
import {
    startRegistration,
    startAuthentication,
    browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import TerminalLogo from '@/components/common/Logo';

function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
            />
            <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
            />
            <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
            />
            <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
            />
        </svg>
    );
}

type TwoFactorMethod = 'TOTP' | 'EMAIL' | null;

const features = [
    { icon: Terminal, text: 'Manage SSH servers from one place' },
    { icon: Shield, text: 'End-to-end encrypted credentials' },
    { icon: Zap, text: 'Instant terminal sessions' },
    { icon: Globe, text: 'Access from anywhere, securely' },
];

function PageShell({
    children,
    fullWidth = false,
}: {
    children: React.ReactNode;
    fullWidth?: boolean;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-950 via-background to-slate-950">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            </div>
            <div className={cn('relative w-full', fullWidth ? 'max-w-3xl' : 'max-w-lg')}>
                <Card className="bg-card border-border overflow-hidden">{children}</Card>
            </div>
        </div>
    );
}

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
    const [isElectron, setIsElectron] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    useEffect(() => {
        setWebAuthnSupported(browserSupportsWebAuthn());
        setIsElectron(!!window.electronAPI?.isElectron);
    }, []);

    // If already signed in, skip the login form and go straight to the app.
    useEffect(() => {
        let cancelled = false;
        fetch('/api/auth/me')
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                if (data.success) {
                    const nextUrl = searchParams.get('next');
                    router.replace(nextUrl && nextUrl.startsWith('/') ? nextUrl : '/panel');
                } else {
                    setCheckingSession(false);
                }
            })
            .catch(() => {
                if (!cancelled) setCheckingSession(false);
            });
        return () => {
            cancelled = true;
        };
    }, [router, searchParams]);

    useEffect(() => {
        if (searchParams.get('verified') === '1')
            setInfo('Email verified successfully. You can now sign in.');
        if (searchParams.get('error') === 'verification-failed')
            setError(searchParams.get('message') || 'Email verification failed.');
        if (searchParams.get('error') === 'oauth_failed')
            setError('Google sign-in failed. Please try again.');
        if (searchParams.get('error') === 'oauth_state')
            setError('Authentication error. Please try again.');
        if (searchParams.get('error') === 'oauth_cancelled')
            setInfo('Google sign-in was cancelled.');
        if (searchParams.get('reset') === '1')
            setInfo('Password reset successfully. Please sign in with your new password.');
    }, [searchParams]);

    // useEffect(() => {
    //     if (typeof window === 'undefined' || !('credentials' in navigator)) return;
    //     navigator.credentials
    //         .get({ password: true, mediation: 'optional' } as CredentialRequestOptions)
    //         .then((cred) => {
    //             if (cred && cred.type === 'password') {
    //                 const pc = cred as PasswordCredential;
    //                 setFormData({ email: pc.id, password: pc.password || '' });
    //             }
    //         })
    //         .catch(() => {});
    // }, []);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => clearInterval(t);
    }, [resendCooldown]);

    function handleLoginSuccess(data: { suggestPasskeySetup?: boolean }) {
        if (formData.email && typeof window !== 'undefined' && 'PasswordCredential' in window) {
            try {
                const cred = new PasswordCredential({
                    id: formData.email,
                    password: formData.password,
                    name: formData.email,
                });
                navigator.credentials.store(cred).catch(() => {});
            } catch {
                /* not supported */
            }
        }
        const nextUrl = searchParams.get('next');
        // Don't offer passkey setup in Electron — platform authenticator unavailable
        if (data?.suggestPasskeySetup && webAuthnSupported && !isElectron)
            setShowPasskeySetup(true);
        else router.push(nextUrl && nextUrl.startsWith('/') ? nextUrl : '/panel');
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void performLogin();
    };

    const performLogin = async () => {
        setError('');
        setLoading(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            if (!data.success) {
                setError(data.error || 'Login failed');
                setLoading(false);
                return;
            }
            if (data.data?.requires2FA) {
                setRequires2FA(true);
                setTwoFactorMethod(data.data.twoFactorMethod || 'TOTP');
                setInfo(data.data.message || '');
                setLoading(false);
                return;
            }
            handleLoginSuccess(data.data);
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const handleVerify = (e: React.FormEvent) => {
        e.preventDefault();
        void performVerify();
    };

    const performVerify = async () => {
        setError('');
        setLoading(true);
        try {
            const response = await fetch('/api/auth/verify-2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const data = await response.json();
            if (!data.success) {
                setError(data.error || 'Verification failed');
                setLoading(false);
                return;
            }
            handleLoginSuccess(data.data);
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const handlePasskeySignIn = async () => {
        setError('');
        setPasskeyLoading(true);
        // Track whether the 30s server timeout fired so we can distinguish it
        // from an intentional user cancel (both surface as NotAllowedError).
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
        }, 32000);
        try {
            const optRes = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email || undefined }),
            });
            const optData = await optRes.json();
            if (!optData.success) {
                clearTimeout(timeoutId);
                setError(optData.error || 'Failed to start passkey sign-in');
                setPasskeyLoading(false);
                return;
            }
            const assertion = await startAuthentication({ optionsJSON: optData.data });
            clearTimeout(timeoutId);
            const authRes = await fetch('/api/auth/passkey/authenticate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response: assertion }),
            });
            const authData = await authRes.json();
            if (!authData.success) {
                setError(authData.error || 'Passkey authentication failed');
                setPasskeyLoading(false);
                return;
            }
            router.push(
                searchParams.get('next') && searchParams.get('next')!.startsWith('/')
                    ? searchParams.get('next')!
                    : '/panel',
            );
        } catch (err: unknown) {
            clearTimeout(timeoutId);
            if (timedOut) {
                setError(
                    'Passkey request timed out. Please try again or sign in with your password.',
                );
            } else if ((err as { name?: string })?.name !== 'NotAllowedError') {
                setError('Passkey sign-in failed. Please try with your password.');
            }
            setPasskeyLoading(false);
        }
    };

    const handlePasskeySetup = async () => {
        setPasskeySetupError('');
        setPasskeySetupLoading(true);
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
        }, 32000);
        try {
            const optRes = await fetch('/api/auth/passkey/register-options');
            const optData = await optRes.json();
            if (!optData.success) {
                clearTimeout(timeoutId);
                setPasskeySetupError(optData.error || 'Failed to start passkey setup');
                setPasskeySetupLoading(false);
                return;
            }
            const registrationResponse = await startRegistration({ optionsJSON: optData.data });
            clearTimeout(timeoutId);
            const regRes = await fetch('/api/auth/passkey/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: passkeySetupName.trim() || 'Passkey',
                    response: registrationResponse,
                }),
            });
            const regData = await regRes.json();
            if (!regData.success) {
                setPasskeySetupError(regData.error || 'Passkey registration failed');
                setPasskeySetupLoading(false);
                return;
            }
            router.push(
                searchParams.get('next') && searchParams.get('next')!.startsWith('/')
                    ? searchParams.get('next')!
                    : '/panel',
            );
        } catch (err: unknown) {
            clearTimeout(timeoutId);
            if (timedOut) {
                setPasskeySetupError(
                    'Passkey setup timed out. Check for a Touch ID or system dialog on your screen, then try again.',
                );
            } else if ((err as { name?: string })?.name === 'NotAllowedError') {
                setPasskeySetupError('Passkey setup was cancelled.');
            } else {
                setPasskeySetupError('Passkey setup failed. Please try again or skip.');
            }
            setPasskeySetupLoading(false);
        }
    };

    const handleResendEmail = async () => {
        setResendLoading(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'PUT' });
            const data = await res.json();
            if (data.success) {
                setInfo('A new verification code has been sent to your email.');
                setResendCooldown(60);
            } else setError(data.error || 'Failed to resend code');
        } catch {
            setError('Failed to resend code');
        } finally {
            setResendLoading(false);
        }
    };

    //   Session check gate — avoids flashing the form for signed-in users   ─

    if (checkingSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-950 via-background to-slate-950">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    //   Passkey setup screen

    if (showPasskeySetup) {
        return (
            <PageShell>
                <div className="p-8">
                    <div className="flex justify-center mb-4">
                        <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <Fingerprint className="w-7 h-7 text-primary" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-center mb-2">Set up a Passkey</h1>
                    <p className="text-muted-foreground text-center mb-5 text-sm">
                        Use Face ID, Touch ID, or your device PIN to sign in faster and more
                        securely.
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
                    <Button
                        onClick={handlePasskeySetup}
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
                        onClick={() =>
                            router.push(
                                searchParams.get('next') &&
                                    searchParams.get('next')!.startsWith('/')
                                    ? searchParams.get('next')!
                                    : '/panel',
                            )
                        }
                        className="w-full text-muted-foreground"
                    >
                        <X className="w-4 h-4" /> Skip for now
                    </Button>
                </div>
            </PageShell>
        );
    }

    //   Main login UI — two-column layout                   ─

    return (
        <PageShell fullWidth>
            <div className="flex min-h-0">
                {/*   Left brand panel   */}
                <div className="hidden md:flex flex-col justify-between w-[42%] shrink-0 bg-gradient-to-b from-primary/10 to-purple-500/10 border-r border-border p-8">
                    <div>
                        <div className="flex items-center gap-3 mb-8">
                            <TerminalLogo width={40} height={40} className="rounded-xl" />
                            <span className="text-xl font-bold gradient-text">Termi</span>
                        </div>
                        <h2 className="text-2xl font-bold leading-snug mb-2">
                            Your servers,
                            <br />
                            always within reach.
                        </h2>
                        <p className="text-sm text-muted-foreground mb-8">
                            A secure, modern SSH manager built for developers and teams.
                        </p>
                        <ul className="space-y-3">
                            {features.map(({ icon: Icon, text }) => (
                                <li
                                    key={text}
                                    className="flex items-center gap-3 text-sm text-muted-foreground"
                                >
                                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                                        <Icon className="w-3.5 h-3.5 text-primary" />
                                    </span>
                                    {text}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="text-xs text-muted-foreground/50 mt-8">
                        © {new Date().getFullYear()} Termi. All rights reserved.
                    </p>
                </div>

                {/*   Right form panel   */}
                <div className="flex-1 p-8 flex flex-col justify-center">
                    {/* Mobile logo (hidden on md+) */}
                    <div className="flex items-center justify-center gap-3 mb-6 md:hidden">
                        <TerminalLogo width={40} height={40} className="rounded-xl" />
                        <span className="text-xl font-bold gradient-text">Termi</span>
                    </div>

                    {/* Info banner */}
                    {info && !requires2FA && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-5">
                            <CheckCircle className="w-4 h-4 shrink-0" />
                            {info}
                        </div>
                    )}

                    {!requires2FA ? (
                        <>
                            <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
                            <p className="text-muted-foreground text-sm mb-6">
                                Sign in to your account to continue
                            </p>

                            {/* Google Sign-In */}
                            <a
                                href="/api/auth/google/authorize"
                                className="flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent transition-colors text-sm font-medium mb-5"
                            >
                                <GoogleIcon className="w-5 h-5" />
                                Continue with Google
                            </a>

                            <div className="relative mb-5">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-border" />
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="bg-card px-2 text-muted-foreground">
                                        or sign in with email
                                    </span>
                                </div>
                            </div>

                            <form
                                ref={formRef}
                                onSubmit={handleSubmit}
                                method="POST"
                                className="space-y-4"
                            >
                                <div className="space-y-1.5">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input
                                        type="email"
                                        id="email"
                                        name="username"
                                        value={formData.email}
                                        onChange={(e) =>
                                            setFormData({ ...formData, email: e.target.value })
                                        }
                                        className="bg-secondary border-border"
                                        placeholder="you@example.com"
                                        required
                                        autoComplete="username email"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="password">Password</Label>
                                        <Link
                                            href="/forgot-password"
                                            className="text-xs text-muted-foreground hover:text-foreground underline"
                                        >
                                            Forgot password?
                                        </Link>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    password: e.target.value,
                                                })
                                            }
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
                                            {showPassword ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                        {error}
                                    </div>
                                )}

                                <Button type="submit" disabled={loading} className="w-full">
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        'Sign In'
                                    )}
                                </Button>
                            </form>

                            {/* Passkey sign-in — hidden in Electron (platform authenticator unavailable) */}
                            {webAuthnSupported && !isElectron && (
                                <>
                                    <div className="my-4 flex items-center gap-3">
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
                                        {passkeyLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Fingerprint className="w-4 h-4 text-primary" />
                                        )}
                                        {passkeyLoading
                                            ? 'Waiting for passkey…'
                                            : 'Sign in with Passkey'}
                                    </Button>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="flex justify-center mb-4">
                                {twoFactorMethod === 'EMAIL' ? (
                                    <Mail className="w-8 h-8 text-primary" />
                                ) : (
                                    <Smartphone className="w-8 h-8 text-primary" />
                                )}
                            </div>
                            <h1 className="text-xl font-bold text-center mb-1">
                                Two-Factor Authentication
                            </h1>
                            <p className="text-muted-foreground text-center mb-5 text-sm">
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

                                <Button
                                    type="submit"
                                    disabled={
                                        loading ||
                                        (isRecoveryMode ? code.length < 8 : code.length !== 6)
                                    }
                                    className="w-full"
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        'Verify'
                                    )}
                                </Button>

                                {twoFactorMethod === 'EMAIL' && !isRecoveryMode && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleResendEmail}
                                        disabled={resendLoading || resendCooldown > 0}
                                        className="w-full bg-secondary border-border"
                                    >
                                        <RefreshCw
                                            className={cn(
                                                'w-4 h-4',
                                                resendLoading && 'animate-spin',
                                            )}
                                        />
                                        {resendCooldown > 0
                                            ? `Resend in ${resendCooldown}s`
                                            : 'Resend code'}
                                    </Button>
                                )}

                                {twoFactorMethod === 'TOTP' && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setIsRecoveryMode(!isRecoveryMode);
                                            setCode('');
                                            setError('');
                                        }}
                                        className="w-full bg-secondary border-border"
                                    >
                                        <KeyRound className="w-4 h-4" />
                                        {isRecoveryMode
                                            ? 'Use authenticator app instead'
                                            : 'Use a recovery code'}
                                    </Button>
                                )}

                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setRequires2FA(false);
                                        setCode('');
                                        setError('');
                                        setInfo('');
                                        setIsRecoveryMode(false);
                                    }}
                                    className="w-full text-muted-foreground"
                                >
                                    Back to Login
                                </Button>
                            </form>
                        </>
                    )}

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Don&apos;t have an account?{' '}
                        <Link href="/register" className="text-primary hover:text-primary/80">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </PageShell>
    );
}
