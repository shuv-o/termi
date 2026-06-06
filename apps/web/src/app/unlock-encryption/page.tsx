'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';

export default function UnlockEncryptionPage() {
    const router = useRouter();
    const [passphrase, setPassphrase] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/unlock-encryption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passphrase }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Incorrect passphrase');
                return;
            }
            router.push('/panel');
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        setResetLoading(true);
        try {
            const res = await fetch('/api/auth/reset-encryption-key', { method: 'POST' });
            const data = await res.json();
            if (data.success) router.push('/setup-encryption');
        } catch {
            setError('Failed to reset encryption key.');
        } finally {
            setResetLoading(false);
        }
    };

    if (showResetConfirm) {
        return (
            <Card className="w-full max-w-md border-border bg-card">
                <CardContent className="pt-8 pb-6 px-8 space-y-4">
                    <div className="flex flex-col items-center mb-2">
                        <AlertTriangle className="w-12 h-12 text-red-400 mb-2" />
                        <h1 className="text-xl font-bold text-red-400">
                            Delete All Server Credentials?
                        </h1>
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                        This will permanently delete all your stored servers and credentials. This
                        cannot be undone.
                    </p>
                    <Button
                        variant="destructive"
                        className="w-full"
                        onClick={handleReset}
                        disabled={resetLoading}
                    >
                        {resetLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            'Yes, Delete Everything & Reset'
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => setShowResetConfirm(false)}
                    >
                        Cancel
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md border-border bg-card">
            <CardContent className="pt-8 pb-6 px-8">
                <div className="flex flex-col items-center mb-6">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Unlock Encryption</h1>
                    <p className="text-sm text-muted-foreground text-center mt-2">
                        Enter your encryption passphrase to unlock your server credentials.
                    </p>
                </div>
                <form onSubmit={handleUnlock} className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="passphrase">Passphrase / Account Password</Label>
                        <div className="relative">
                            <Input
                                id="passphrase"
                                type={showPassphrase ? 'text' : 'password'}
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                className="pr-10"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassphrase(!showPassphrase)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            >
                                {showPassphrase ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading || !passphrase}>
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            'Unlock & Continue'
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => router.push('/panel')}
                    >
                        Skip for now (server connections won&apos;t work)
                    </Button>
                    <div className="text-center">
                        <button
                            type="button"
                            className="text-xs text-muted-foreground underline"
                            onClick={() => setShowResetConfirm(true)}
                        >
                            Forgot your passphrase?
                        </button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
