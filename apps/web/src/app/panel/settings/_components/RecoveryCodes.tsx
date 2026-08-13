'use client';

import { AlertTriangle, Check, Copy, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** One-time banner prompting the user to verify their email address. */
export function UnverifiedBanner({
    resending,
    sent,
    onResend,
}: {
    resending: boolean;
    sent: boolean;
    onResend: () => void;
}) {
    return (
        <div className="mb-6 flex max-w-4xl items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-amber-300">
                <Info className="w-4 h-4 shrink-0" />
                Your email address is not verified.
            </div>
            <button
                onClick={onResend}
                disabled={resending || sent}
                className="text-xs font-medium text-amber-300 hover:text-amber-200 underline shrink-0 disabled:opacity-50"
            >
                {sent ? 'Email sent!' : resending ? 'Sending…' : 'Resend verification'}
            </button>
        </div>
    );
}

/** Shown once, right after TOTP enrolment — the codes are never displayed again. */
export function RecoveryCodesPanel({
    codes,
    copiedCode,
    onCopy,
    onDismiss,
}: {
    codes: string[];
    copiedCode: string | null;
    onCopy: (code: string) => void;
    onDismiss: () => void;
}) {
    return (
        <div className="mb-6 max-w-4xl rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h2 className="font-semibold text-amber-400">Save your recovery codes</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
                Store these securely. Each code can only be used once and won&apos;t be shown again.
            </p>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 mb-4">
                {codes.map((code) => (
                    <div
                        key={code}
                        className="flex items-center justify-between bg-background rounded-lg px-3 py-2.5 font-mono text-sm border border-border"
                    >
                        <span className="tracking-wider">{code}</span>
                        <button
                            onClick={() => onCopy(code)}
                            className="text-muted-foreground hover:text-foreground ml-2 transition-colors"
                        >
                            {copiedCode === code ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                                <Copy className="w-3.5 h-3.5" />
                            )}
                        </button>
                    </div>
                ))}
            </div>
            <Button variant="secondary" size="sm" onClick={onDismiss}>
                I&apos;ve saved my recovery codes
            </Button>
        </div>
    );
}
