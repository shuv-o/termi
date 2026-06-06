'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const requirements = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'Lowercase letter', met: /[a-z]/.test(password) },
        { label: 'Number', met: /\d/.test(password) },
    ];
    const allMet = requirements.every((r) => r.met);
    const passwordsMatch = password === confirm && confirm.length > 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!allMet || !passwordsMatch) return;
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: password }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to reset password');
                return;
            }
            setSuccess(true);
            setTimeout(() => router.push('/login?reset=1'), 22080);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <p className="text-center text-sm text-red-400">
                Invalid reset link. <Link href="/forgot-password" className="underline">Request a new one</Link>.
            </p>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                <strong>Security notice:</strong> Resetting your password will permanently delete your stored server credentials. You&apos;ll need to re-add your servers after reset.
            </div>

            {success ? (
                <div className="text-center space-y-2">
                    <p className="text-green-400 font-medium">Password reset! Redirecting to login…</p>
                </div>
            ) : (
                <>
                    <div className="space-y-1">
                        <Label htmlFor="password">New Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pr-10"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <ul className="text-xs space-y-0.5 mt-1">
                            {requirements.map((r) => (
                                <li key={r.label} className={`flex items-center gap-1 ${r.met ? 'text-green-400' : 'text-muted-foreground'}`}>
                                    {r.met ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                    {r.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="confirm">Confirm Password</Label>
                        <Input
                            id="confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className={confirm.length > 0 ? (passwordsMatch ? 'border-green-500' : 'border-red-500') : ''}
                        />
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading || !allMet || !passwordsMatch}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset Password & Delete Server Credentials'}
                    </Button>
                </>
            )}
        </form>
    );
}

export default function ResetPasswordPage() {
    return (
        <Card className="w-full max-w-md border-border bg-card">
            <CardContent className="pt-8 pb-6 px-8">
                <div className="flex flex-col items-center mb-6">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <h1 className="text-2xl font-bold">Reset Password</h1>
                </div>
                <Suspense fallback={<div className="h-8 bg-muted rounded animate-pulse" />}>
                    <ResetPasswordForm />
                </Suspense>
            </CardContent>
        </Card>
    );
}
