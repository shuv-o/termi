'use client';

import {
    CheckCircle2,
    Fingerprint,
    Lock,
    Mail,
    Shield,
    ShieldAlert,
    ShieldCheck,
} from 'lucide-react';
import type { Passkey, User } from '../types';

/** Four-point hardening checklist shown at the top of the Profile panel. */
export function SecurityScore({ user, passkeys }: { user: User; passkeys: Passkey[] }) {
    const checks = [
        { label: 'Email verified', done: user.isVerified, icon: Mail },
        { label: '2FA enabled', done: user.twoFactorMethod !== 'NONE', icon: Shield },
        { label: 'Passkey registered', done: passkeys.length > 0, icon: Fingerprint },
        { label: 'Encryption key set', done: user.hasMasterKey || !user.isGoogleUser, icon: Lock },
    ];
    const score = checks.filter((c) => c.done).length;
    const pct = (score / checks.length) * 100;

    const scoreColor =
        score === 4 ? 'text-green-400' : score >= 2 ? 'text-yellow-400' : 'text-red-400';
    const barColor = score === 4 ? 'bg-green-500' : score >= 2 ? 'bg-yellow-500' : 'bg-red-500';
    const label = score === 4 ? 'Excellent' : score >= 3 ? 'Good' : score >= 2 ? 'Fair' : 'Weak';

    return (
        <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {score === 4 ? (
                        <ShieldCheck className="w-5 h-5 text-green-400" />
                    ) : score >= 2 ? (
                        <Shield className="w-5 h-5 text-yellow-400" />
                    ) : (
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                    )}
                    <span className="font-semibold text-sm">Security Score</span>
                </div>
                <span className={`text-sm font-bold ${scoreColor}`}>
                    {label} · {score}/{checks.length}
                </span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-4">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                {checks.map((c) => (
                    <div key={c.label} className="flex items-center gap-2">
                        {c.done ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        ) : (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                        )}
                        <span
                            className={`text-xs ${c.done ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                            {c.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
