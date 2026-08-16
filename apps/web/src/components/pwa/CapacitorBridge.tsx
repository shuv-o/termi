'use client';

import { useEffect } from 'react';

/**
 * Bridge for when Termi runs inside the Capacitor native shell (`apps/mobile`).
 *
 * Uses the global `window.Capacitor` injected by the native runtime — no
 * `@capacitor/*` import — so the web bundle stays free of native deps and this
 * is a no-op in a normal browser / PWA.
 *
 * - Themes the native status bar to match the app background.
 * - Wires the Android hardware back button to SPA history (exits at the root).
 */
interface CapacitorGlobal {
    isNativePlatform?: () => boolean;
    Plugins?: {
        App?: {
            addListener: (
                event: 'backButton',
                cb: (data: { canGoBack: boolean }) => void,
            ) => Promise<{ remove: () => void }>;
            exitApp?: () => void;
        };
        StatusBar?: {
            setStyle?: (opts: { style: string }) => Promise<void>;
            setBackgroundColor?: (opts: { color: string }) => Promise<void>;
        };
    };
}

export default function CapacitorBridge() {
    useEffect(() => {
        const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
        if (!cap?.isNativePlatform?.()) return;

        const StatusBar = cap.Plugins?.StatusBar;
        StatusBar?.setStyle?.({ style: 'DARK' }).catch(() => {});
        StatusBar?.setBackgroundColor?.({ color: '#0f172a' }).catch(() => {});

        let remove: (() => void) | undefined;
        const App = cap.Plugins?.App;
        App?.addListener('backButton', ({ canGoBack }) => {
            if (canGoBack || window.history.length > 1) {
                window.history.back();
            } else {
                App.exitApp?.();
            }
        }).then((handle) => {
            remove = handle.remove;
        });

        return () => remove?.();
    }, []);

    return null;
}
