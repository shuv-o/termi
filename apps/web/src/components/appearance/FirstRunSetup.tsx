'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TerminalLogo from '@/components/common/Logo';
import { AppearanceEditor } from './AppearanceEditor';
import { AppearancePreview } from './AppearancePreview';
import { completeOnboarding, useAppearance } from '@/lib/appearance/store';

/**
 * Shown once, right after someone's first sign-in: pick how Termi looks and
 * is laid out, watching the whole app change as you choose. Every choice is
 * already applied, so "Start" only has to save it; skipping keeps the
 * defaults (and anything picked so far).
 */
export function FirstRunSetup({ name, onDone }: { name: string | null; onDone: () => void }) {
    const appearance = useAppearance();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const finish = async () => {
        setSaving(true);
        setError('');
        if (await completeOnboarding()) {
            onDone();
        } else {
            setSaving(false);
            setError('Your choices couldn’t be saved. Check your connection and try again.');
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="first-run-title"
            className="fixed inset-0 z-[70] overflow-y-auto bg-background"
        >
            <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-8 sm:px-8 sm:pt-14">
                <header className="max-w-2xl">
                    <TerminalLogo width={32} height={32} className="rounded-md" />
                    <h1
                        id="first-run-title"
                        className="mt-5 text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem]"
                    >
                        {name ? `Welcome, ${name.split(' ')[0]}.` : 'Welcome to Termi.'} Set it up
                        the way you work.
                    </h1>
                    <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                        Choose a theme, where the menu goes and how terminals share the screen.
                        Everything changes as you pick it, and you can change it again any time in
                        Settings → Appearance.
                    </p>
                </header>

                <div className="mt-10 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-12">
                    <div className="lg:order-2 lg:sticky lg:top-8">
                        <AppearancePreview appearance={appearance} />
                    </div>
                    <div className="min-w-0 lg:order-1">
                        <AppearanceEditor />
                    </div>
                </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 pb-[var(--safe-area-inset-bottom)] backdrop-blur-md">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-3 px-4 py-3 sm:px-8">
                    {error && (
                        <p role="alert" className="mr-auto text-xs text-danger">
                            {error}
                        </p>
                    )}
                    <Button variant="ghost" onClick={finish} disabled={saving}>
                        Skip for now
                    </Button>
                    <Button onClick={finish} disabled={saving}>
                        {saving && <Loader2 className="animate-spin" />}
                        Start using Termi
                    </Button>
                </div>
            </div>
        </div>
    );
}
