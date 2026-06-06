'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            setSent(true);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md border-border bg-card">
            <CardContent className="pt-8 pb-6 px-8">
                <div className="flex flex-col items-center mb-6">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <h1 className="text-2xl font-bold">Forgot Password</h1>
                </div>

                {sent ? (
                    <div className="text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                            <Mail className="w-6 h-6 text-green-400" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            If that email address has an account, we&apos;ve sent a password reset
                            link. Check your inbox.
                        </p>
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs text-yellow-300">
                            ⚠️ Resetting your password will permanently delete your stored server
                            credentials.
                        </div>
                        <Button asChild variant="ghost" className="w-full">
                            <Link href="/login">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Sign In
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                            Enter your email address and we&apos;ll send a reset link.
                        </p>
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
                            ⚠️ Warning: Resetting your password will permanently delete all stored
                            server credentials (passwords, private keys). This cannot be undone.
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoFocus
                            />
                        </div>
                        {error && <p className="text-sm text-red-400">{error}</p>}
                        <Button type="submit" className="w-full" disabled={loading || !email}>
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                'Send Reset Link'
                            )}
                        </Button>
                        <Button asChild variant="ghost" className="w-full">
                            <Link href="/login">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Sign In
                            </Link>
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
