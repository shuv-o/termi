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
            <div className="min-h-screen flex items-center justify-center bg-background">
                <span role="status" aria-label="Loading" className="cursor-block cursor-waiting text-2xl" />
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

                <div className="flex flex-1 flex-col justify-center p-6 sm:p-8">
                    {/* Mobile logo (hidden on md+) */}
                    <div className="mb-6 flex items-center gap-2.5 md:hidden">
                        <TerminalLogo width={28} height={28} className="rounded-md" />
                        <span className="text-[15px] font-semibold">Termi</span>
                    </div>

                    {state.info && !state.requires2FA && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm mb-5">
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
                        <div className="h-8 w-40 mx-auto bg-muted rounded-sm animate-pulse" />
                    </div>
                </PageShell>
            }
        >
            <LoginContent />
        </Suspense>
    );
}
