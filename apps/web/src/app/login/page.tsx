'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import TerminalLogo from '@/components/common/Logo';

import { LoginForm } from './_components/LoginForm';
import { PasskeySetup } from './_components/PasskeySetup';
import { BrandPanel, PageShell } from './_components/PageShell';
import { TwoFactorForm } from './_components/TwoFactorForm';
import { useLogin } from './_components/useLogin';

function LoginContent() {
    const state = useLogin();

    // Session check gate — avoids flashing the form for signed-in users.
    if (state.checkingSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-950 via-background to-slate-950">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (state.showPasskeySetup) {
        return (
            <PageShell>
                <PasskeySetup state={state} />
            </PageShell>
        );
    }

    return (
        <PageShell fullWidth>
            <div className="flex min-h-0">
                <BrandPanel />

                <div className="flex-1 p-8 flex flex-col justify-center">
                    {/* Mobile logo (hidden on md+) */}
                    <div className="flex items-center justify-center gap-3 mb-6 md:hidden">
                        <TerminalLogo width={40} height={40} className="rounded-xl" />
                        <span className="text-xl font-bold gradient-text">Termix</span>
                    </div>

                    {state.info && !state.requires2FA && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-5">
                            <CheckCircle className="w-4 h-4 shrink-0" />
                            {state.info}
                        </div>
                    )}

                    {state.requires2FA ? (
                        <TwoFactorForm state={state} />
                    ) : (
                        <LoginForm state={state} />
                    )}

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Don&apos;t have an account?{' '}
                        <Link href="/register" className="text-primary hover:text-primary/80">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </PageShell>
    );
}

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <PageShell>
                    <div className="p-8">
                        <div className="h-8 w-40 mx-auto bg-muted rounded animate-pulse" />
                    </div>
                </PageShell>
            }
        >
            <LoginContent />
        </Suspense>
    );
}
