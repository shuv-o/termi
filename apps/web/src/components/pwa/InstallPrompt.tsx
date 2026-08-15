'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

/**
 * The `beforeinstallprompt` event isn't in the standard DOM lib types.
 * It fires on Chromium (Android + desktop) when the PWA is installable.
 */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'termix:install-dismissed';

export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari exposes this non-standard flag for home-screen apps.
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

export function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return (
        /iphone|ipad|ipod/i.test(navigator.userAgent) &&
        !(window as unknown as { MSStream?: unknown }).MSStream
    );
}

/**
 * Floating, dismissible install banner.
 *
 * - Chromium (Android/desktop): captures `beforeinstallprompt` and shows a
 *   real Install button that triggers the native prompt.
 * - iOS Safari: no install API exists, so we show the manual
 *   "Share → Add to Home Screen" instruction instead.
 *
 * Renders nothing when already installed (standalone) or previously dismissed.
 */
export default function InstallPrompt() {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [showIOS, setShowIOS] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isStandalone()) return;
        if (localStorage.getItem(DISMISS_KEY) === '1') return;

        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
            setVisible(true);
        };

        window.addEventListener('beforeinstallprompt', onBeforeInstall);

        // iOS never fires beforeinstallprompt — show the manual hint instead.
        if (isIOS()) {
            setShowIOS(true);
            setVisible(true);
        }

        // Hide the banner once the app gets installed.
        const onInstalled = () => {
            setVisible(false);
            localStorage.setItem(DISMISS_KEY, '1');
        };
        window.addEventListener('appinstalled', onInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const dismiss = () => {
        setVisible(false);
        localStorage.setItem(DISMISS_KEY, '1');
    };

    const install = async () => {
        if (!deferred) return;
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === 'accepted') {
            setVisible(false);
        }
        setDeferred(null);
    };

    if (!visible) return null;

    return (
        <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/95 p-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-slate-900/80">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Download className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1 text-sm">
                    {showIOS ? (
                        <p className="text-slate-300">
                            Install Termix: tap{' '}
                            <Share className="inline h-3.5 w-3.5 -translate-y-0.5 text-slate-400" />{' '}
                            <span className="text-slate-400">Share</span> →{' '}
                            <span className="text-slate-200">Add to Home Screen</span>.
                        </p>
                    ) : (
                        <p className="text-slate-300">
                            Install Termix for a faster, full-screen, app-like experience.
                        </p>
                    )}
                </div>

                {!showIOS && (
                    <button
                        type="button"
                        onClick={install}
                        className="shrink-0 rounded-lg bg-gradient-to-r from-primary to-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
                    >
                        Install
                    </button>
                )}

                <button
                    type="button"
                    onClick={dismiss}
                    title="Dismiss"
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
