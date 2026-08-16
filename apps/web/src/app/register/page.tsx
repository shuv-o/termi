'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Check, X, Terminal, Shield, Zap, Globe, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
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

const features = [
    { icon: Terminal, text: 'Manage SSH servers from one place' },
    { icon: Shield, text: 'End-to-end encrypted credentials' },
    { icon: Zap, text: 'Instant terminal sessions' },
    { icon: Globe, text: 'Access from anywhere, securely' },
];

// ── OTP verification step ────────────────────────────────────────────────────

function VerifyStep({
    email,
    userId,
    onSuccess,
}: {
    email: string;
    userId: string;
    onSuccess: () => void;
}) {
    const [digits, setDigits] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const code = digits.join('');

    const handleDigit = (i: number, value: string) => {
        const v = value.replace(/\D/g, '').slice(-1);
        const next = [...digits];
        next[i] = v;
        setDigits(next);
        if (v && i < 5) inputRefs.current[i + 1]?.focus();
    };

    const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !digits[i] && i > 0) {
            inputRefs.current[i - 1]?.focus();
        }
        if (e.key === 'ArrowLeft' && i > 0) inputRefs.current[i - 1]?.focus();
        if (e.key === 'ArrowRight' && i < 5) inputRefs.current[i + 1]?.focus();
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;
        const next = Array(6).fill('');
        for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
        setDigits(next);
        const focus = Math.min(pasted.length, 5);
        inputRefs.current[focus]?.focus();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length < 6) return;
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/verify-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, code }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Verification failed');
                setDigits(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
                return;
            }
            onSuccess();
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        setError('');
        try {
            await fetch('/api/auth/resend-signup-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            setResent(true);
            setTimeout(() => setResent(false), 30_000);
        } catch {
            setError('Failed to resend code.');
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="flex flex-col items-center text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
                <Mail className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-1">Check your email</h1>
            <p className="text-muted-foreground text-sm mb-2">We sent a 6-digit code to</p>
            <p className="font-medium text-sm mb-6 truncate max-w-full">{email}</p>

            <form onSubmit={handleSubmit} className="w-full space-y-5">
                <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                    {digits.map((d, i) => (
                        <input
                            key={i}
                            ref={(el) => {
                                inputRefs.current[i] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={d}
                            onChange={(e) => handleDigit(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            className="w-10 h-12 text-center text-xl font-bold rounded-lg border border-border bg-secondary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                        />
                    ))}
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                        {error}
                    </div>
                )}

                <Button type="submit" disabled={loading || code.length < 6} className="w-full">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Email'}
                </Button>
            </form>

            <p className="mt-5 text-sm text-muted-foreground">
                {resent ? (
                    <span className="text-emerald-400">Code resent!</span>
                ) : (
                    <>
                        Didn&apos;t receive it?{' '}
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={resending}
                            className="text-primary hover:text-primary/80 disabled:opacity-50"
                        >
                            {resending ? 'Sending…' : 'Resend code'}
                        </button>
                    </>
                )}
            </p>
        </div>
    );
}

// ── Registration form ────────────────────────────────────────────────────────

function RegisterContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // After successful registration: switch to verification step
    const [verifying, setVerifying] = useState(false);
    const [pendingUserId, setPendingUserId] = useState('');
    const [pendingEmail, setPendingEmail] = useState('');

    useEffect(() => {
        const emailParam = searchParams.get('email');
        if (emailParam) setFormData((f) => ({ ...f, email: emailParam }));
    }, [searchParams]);

    const passwordRequirements = [
        { label: 'At least 8 characters', met: formData.password.length >= 8 },
        { label: 'Uppercase letter', met: /[A-Z]/.test(formData.password) },
        { label: 'Lowercase letter', met: /[a-z]/.test(formData.password) },
        { label: 'Number', met: /\d/.test(formData.password) },
    ];

    const passwordsMatch =
        formData.password === formData.confirmPassword && formData.confirmPassword.length > 0;
    const allRequirementsMet = passwordRequirements.every((req) => req.met);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!formData.name.trim()) {
            setError('Name is required');
            return;
        }
        if (!allRequirementsMet) {
            setError('Please meet all password requirements');
            return;
        }
        if (!passwordsMatch) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name.trim(),
                    email: formData.email,
                    password: formData.password,
                }),
            });
            const data = await response.json();
            if (!data.success) {
                setError(data.error || 'Registration failed');
                setLoading(false);
                return;
            }
            setPendingUserId(data.data.userId);
            setPendingEmail(data.data.email || formData.email);
            setVerifying(true);
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const handleVerified = () => {
        router.push('/panel');
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-background to-slate-950">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-3xl">
                <Card className="bg-card border-border overflow-hidden">
                    <div className="flex min-h-0">
                        {/* Left brand panel */}
                        <div className="hidden md:flex flex-col justify-between w-[42%] shrink-0 bg-gradient-to-b from-primary/10 to-purple-500/10 border-r border-border p-8">
                            <div>
                                <div className="flex items-center gap-3 mb-8">
                                    <TerminalLogo width={40} height={40} className="rounded-xl" />
                                    <span className="text-xl font-bold gradient-text">Termi</span>
                                </div>
                                <h2 className="text-2xl font-bold leading-snug mb-2">
                                    Start managing
                                    <br />
                                    servers smarter.
                                </h2>
                                <p className="text-sm text-muted-foreground mb-8">
                                    Join developers who trust Termi for secure, instant server
                                    access.
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

                        {/* Right form / verify panel */}
                        <div className="flex-1 p-8 flex flex-col justify-center">
                            {/* Mobile logo */}
                            <div className="flex items-center justify-center gap-3 mb-6 md:hidden">
                                <TerminalLogo width={40} height={40} className="rounded-xl" />
                                <span className="text-xl font-bold gradient-text">Termi</span>
                            </div>

                            {verifying ? (
                                <VerifyStep
                                    email={pendingEmail}
                                    userId={pendingUserId}
                                    onSuccess={handleVerified}
                                />
                            ) : (
                                <>
                                    <h1 className="text-2xl font-bold mb-1">Create Account</h1>
                                    <p className="text-muted-foreground text-sm mb-6">
                                        Start managing your servers securely
                                    </p>

                                    {/* Google Sign-Up */}
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
                                                or register with email
                                            </span>
                                        </div>
                                    </div>

                                    <form
                                        onSubmit={handleSubmit}
                                        method="POST"
                                        action="#"
                                        className="space-y-4"
                                    >
                                        <div className="space-y-1.5">
                                            <Label htmlFor="name">Full Name</Label>
                                            <Input
                                                type="text"
                                                id="name"
                                                value={formData.name}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        name: e.target.value,
                                                    })
                                                }
                                                className="bg-secondary border-border"
                                                placeholder="Jane Smith"
                                                required
                                                autoComplete="name"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="email">Email Address</Label>
                                            <Input
                                                type="email"
                                                id="email"
                                                value={formData.email}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        email: e.target.value,
                                                    })
                                                }
                                                className="bg-secondary border-border"
                                                placeholder="you@example.com"
                                                required
                                                autoComplete="email"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="password">Password</Label>
                                            <div className="relative">
                                                <Input
                                                    type={showPassword ? 'text' : 'password'}
                                                    id="password"
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
                                                    autoComplete="new-password"
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

                                            {formData.password && (
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                                                    {passwordRequirements.map((req, i) => (
                                                        <div
                                                            key={i}
                                                            className={`flex items-center gap-1.5 text-xs ${req.met ? 'text-emerald-400' : 'text-muted-foreground'}`}
                                                        >
                                                            {req.met ? (
                                                                <Check className="w-3 h-3 shrink-0" />
                                                            ) : (
                                                                <X className="w-3 h-3 shrink-0" />
                                                            )}
                                                            {req.label}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="confirmPassword">
                                                Confirm Password
                                            </Label>
                                            <Input
                                                type="password"
                                                id="confirmPassword"
                                                value={formData.confirmPassword}
                                                onChange={(e) =>
                                                    setFormData({
                                                        ...formData,
                                                        confirmPassword: e.target.value,
                                                    })
                                                }
                                                className={`bg-secondary border-border ${formData.confirmPassword && !passwordsMatch ? 'border-destructive' : ''}`}
                                                placeholder="••••••••"
                                                required
                                                autoComplete="new-password"
                                            />
                                            {formData.confirmPassword && !passwordsMatch && (
                                                <p className="text-xs text-destructive">
                                                    Passwords do not match
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex gap-2 p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs text-sky-300">
                                            <span className="shrink-0">🔒</span>
                                            <span>
                                                Credentials are encrypted using a key derived from
                                                your password. Keep it safe.
                                            </span>
                                        </div>

                                        {error && (
                                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                                {error}
                                            </div>
                                        )}

                                        <Button
                                            type="submit"
                                            disabled={
                                                loading || !allRequirementsMet || !passwordsMatch
                                            }
                                            className="w-full"
                                        >
                                            {loading ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : (
                                                'Create Account'
                                            )}
                                        </Button>
                                    </form>

                                    <p className="mt-6 text-center text-sm text-muted-foreground">
                                        Already have an account?{' '}
                                        <Link
                                            href="/login"
                                            className="text-primary hover:text-primary/80"
                                        >
                                            Sign in
                                        </Link>
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-background to-slate-950">
                    <div className="h-8 w-40 bg-muted rounded animate-pulse" />
                </div>
            }
        >
            <RegisterContent />
        </Suspense>
    );
}
