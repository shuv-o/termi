'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import TerminalLogo from '@/components/common/Logo';

function getStrength(p: string): { score: number; label: string; color: string } {
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 16) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[a-z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { score, label: 'Fair', color: 'bg-yellow-500' };
    return { score, label: 'Strong', color: 'bg-green-500' };
}

export default function SetupEncryptionPage() {
    const router = useRouter();
    const [passphrase, setPassphrase] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkingUser, setCheckingUser] = useState(true);
    const [error, setError] = useState('');

    const strength = getStrength(passphrase);
    const passphraseMatch = passphrase === confirm && confirm.length > 0;

    useEffect(() => {
        fetch('/api/auth/me').then(async (res) => {
            const data = await res.json();
            if (!data.success) { router.push('/login'); return; }
            if (data.data.user.hasMasterKey) { router.push('/panel'); return; }
            setCheckingUser(false);
        }).catch(() => router.push('/login'));
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passphraseMatch || passphrase.length < 8) return;
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/setup-encryption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passphrase }),
            });
            const data = await res.json();
            if (!data.success) { setError(data.error || 'Setup failed'); return; }
            router.push('/panel');
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (checkingUser) return <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />;

    return (
        <Card className="w-full max-w-md border-border bg-card">
            <CardContent className="pt-8 pb-6 px-8">
                <div className="flex flex-col items-center mb-6">
                    <TerminalLogo width={48} height={48} className="rounded-xl mb-3" />
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Set Up Encryption</h1>
                    <p className="text-sm text-muted-foreground text-center mt-2">
                        Your server credentials will be encrypted with this passphrase. You'll enter it each time you sign in with Google.
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="passphrase">Encryption Passphrase</Label>
                        <div className="relative">
                            <Input
                                id="passphrase"
                                type={showPassphrase ? 'text' : 'password'}
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder="Choose a strong passphrase"
                                className="pr-10"
                                autoFocus
                                minLength={8}
                            />
                            <button type="button" onClick={() => setShowPassphrase(!showPassphrase)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {passphrase && (
                            <div className="mt-1 space-y-1">
                                <div className="flex gap-1">
                                    {[1,2,3,4,5,6].map((i) => (
                                        <div key={i} className={`h-1 flex-1 rounded ${i <= strength.score ? strength.color : 'bg-muted'}`} />
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">Strength: {strength.label}</p>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="confirm">Confirm Passphrase</Label>
                        <Input
                            id="confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            placeholder="Repeat your passphrase"
                            className={confirm.length > 0 ? (passphraseMatch ? 'border-green-500' : 'border-red-500') : ''}
                        />
                        {passphraseMatch && <p className="text-xs text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Passphrases match</p>}
                    </div>
                    <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 text-xs text-sky-300">
                        ℹ️ This passphrase cannot be recovered. If you forget it, you'll need to reset it — which will delete all your server credentials.
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading || passphrase.length < 8 || !passphraseMatch}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set Up Encryption & Continue'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
