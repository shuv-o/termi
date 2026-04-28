'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Terminal, Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

export default function RegisterPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        masterKey: '',
        useMasterKey: false,
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const passwordRequirements = [
        { label: 'At least 8 characters', met: formData.password.length >= 8 },
        { label: 'Uppercase letter', met: /[A-Z]/.test(formData.password) },
        { label: 'Lowercase letter', met: /[a-z]/.test(formData.password) },
        { label: 'Number', met: /\d/.test(formData.password) },
    ];

    const passwordsMatch =
        formData.password === formData.confirmPassword &&
        formData.confirmPassword.length > 0;

    const allRequirementsMet = passwordRequirements.every((req) => req.met);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

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
                    email: formData.email,
                    password: formData.password,
                    masterKey: formData.useMasterKey ? formData.masterKey : undefined,
                }),
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Registration failed');
                setLoading(false);
                return;
            }

            router.push('/login?registered=true');
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-background to-slate-950">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <Card className="bg-card border-border">
                    <CardContent className="p-8">
                        <div className="flex items-center justify-center gap-3 mb-8">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-sky-700 flex items-center justify-center">
                                <Terminal className="w-7 h-7 text-white" />
                            </div>
                            <span className="text-2xl font-bold gradient-text">Termi</span>
                        </div>

                        <h1 className="text-2xl font-bold text-center mb-2">Create Account</h1>
                        <p className="text-muted-foreground text-center mb-8">
                            Start managing your servers securely
                        </p>

                        <form onSubmit={handleSubmit} method="POST" action="#" className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    type="email"
                                    id="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="bg-secondary border-border"
                                    placeholder="you@example.com"
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </Button>
                                </div>

                                {formData.password && (
                                    <div className="mt-3 space-y-1">
                                        {passwordRequirements.map((req, i) => (
                                            <div
                                                key={i}
                                                className={`flex items-center gap-2 text-xs ${req.met ? 'text-emerald-400' : 'text-muted-foreground'}`}
                                            >
                                                {req.met ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                                {req.label}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <Input
                                    type="password"
                                    id="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    className={`bg-secondary border-border ${
                                        formData.confirmPassword && !passwordsMatch ? 'border-destructive' : ''
                                    }`}
                                    placeholder="••••••••"
                                    required
                                    autoComplete="new-password"
                                />
                                {formData.confirmPassword && !passwordsMatch && (
                                    <p className="text-sm text-destructive">Passwords do not match</p>
                                )}
                            </div>

                            <div className="p-4 rounded-lg bg-muted/30 border border-border">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        id="useMasterKey"
                                        checked={formData.useMasterKey}
                                        onCheckedChange={(checked) =>
                                            setFormData({ ...formData, useMasterKey: !!checked })
                                        }
                                        className="mt-1"
                                    />
                                    <div>
                                        <Label htmlFor="useMasterKey" className="font-medium cursor-pointer">
                                            Use Master Key
                                        </Label>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Add an extra layer of encryption. You&apos;ll need this key
                                            to access your credentials.
                                        </p>
                                    </div>
                                </div>

                                {formData.useMasterKey && (
                                    <div className="mt-3">
                                        <Input
                                            type="password"
                                            value={formData.masterKey}
                                            onChange={(e) => setFormData({ ...formData, masterKey: e.target.value })}
                                            className="bg-secondary border-border"
                                            placeholder="Enter master key (min 8 characters)"
                                            minLength={8}
                                            required={formData.useMasterKey}
                                        />
                                        <p className="text-xs text-yellow-500 mt-2">
                                            ⚠️ If you lose this key, you will not be able to recover
                                            your credentials.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={loading || !allRequirementsMet || !passwordsMatch}
                                className="w-full"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
                            </Button>
                        </form>

                        <div className="mt-6 text-center text-sm text-muted-foreground">
                            Already have an account?{' '}
                            <Link href="/login" className="text-primary hover:text-primary/80">
                                Sign in
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
