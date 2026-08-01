'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Fingerprint, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleIcon } from './PageShell';
import type { LoginState } from './useLogin';

function Divider({ label }: { label: string }) {
    return (
        <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">{label}</span>
            </div>
        </div>
    );
}

/** Email + password sign-in, with Google and passkey alternatives. */
export function LoginForm({ state }: { state: LoginState }) {
    const [showPassword, setShowPassword] = useState(false);
    const { formData, setFormData, loading, error } = state;

    return (
        <>
            <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
            <p className="text-muted-foreground text-sm mb-6">
                Sign in to your account to continue
            </p>

            <a
                href="/api/auth/google/authorize"
                className="flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg border border-border bg-secondary hover:bg-accent transition-colors text-sm font-medium mb-5"
            >
                <GoogleIcon className="w-5 h-5" />
                Continue with Google
            </a>

            <Divider label="or sign in with email" />

            <form onSubmit={state.submitLogin} method="POST" className="space-y-4">
                <div className="space-y-1.5">
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
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
                </Button>
            </form>

            {state.webAuthnSupported && (
                <>
                    <div className="my-4 flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground">or</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={state.signInWithPasskey}
                        disabled={state.passkeyLoading}
                        className="w-full bg-secondary border-border hover:bg-secondary/80"
                    >
                        {state.passkeyLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Fingerprint className="w-4 h-4 text-primary" />
                        )}
                        {state.passkeyLoading ? 'Waiting for passkey…' : 'Sign in with Passkey'}
                    </Button>
                </>
            )}
        </>
    );
}
