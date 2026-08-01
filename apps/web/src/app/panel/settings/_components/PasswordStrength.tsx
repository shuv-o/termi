'use client';

import { Check } from 'lucide-react';

const COLORS = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
const LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

export function PasswordStrength({ password }: { password: string }) {
    if (!password) return null;
    const checks = [
        { label: '8+ characters', ok: password.length >= 8 },
        { label: 'Uppercase', ok: /[A-Z]/.test(password) },
        { label: 'Number', ok: /\d/.test(password) },
        { label: 'Symbol', ok: /[^A-Za-z0-9]/.test(password) },
    ];
    const strength = checks.filter((c) => c.ok).length;

    return (
        <div className="mt-2 space-y-2">
            <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className={`flex-1 h-1 rounded-full transition-colors ${i < strength ? COLORS[strength - 1] : 'bg-secondary'}`}
                    />
                ))}
            </div>
            <div className="flex items-center justify-between">
                <div className="flex gap-3">
                    {checks.map((c) => (
                        <span
                            key={c.label}
                            className={`text-[10px] flex items-center gap-1 ${c.ok ? 'text-green-400' : 'text-muted-foreground/50'}`}
                        >
                            {c.ok ? (
                                <Check className="w-2.5 h-2.5" />
                            ) : (
                                <div className="w-2.5 h-2.5 rounded-full border border-current opacity-30" />
                            )}
                            {c.label}
                        </span>
                    ))}
                </div>
                {strength > 0 && (
                    <span
                        className={`text-[10px] font-medium ${COLORS[strength - 1].replace('bg-', 'text-')}`}
                    >
                        {LABELS[strength - 1]}
                    </span>
                )}
            </div>
        </div>
    );
}
