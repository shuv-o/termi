'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clearCache, useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { navigation, type PanelUser } from './navigation';

/** Visual-viewport shrink beyond this many px means the OSK is up. */
const KEYBOARD_THRESHOLD_PX = 150;

/** Session, route flags, sidebar state and the Electron integrations. */
export function usePanelShell() {
    const router = useRouter();
    const pathname = usePathname();

    // The signed-in user comes from a shared cache, so navigating between panel
    // pages never re-fetches it or flashes the shell behind a spinner — the
    // cached user paints instantly and revalidates in the background.
    const { data: meData, error: meError } = useCachedFetch<{ user: PanelUser }>('/api/auth/me');
    const user = meData?.user ?? null;

    // Same cache key the (unfiltered) dashboard server list uses, so this is
    // typically a free cache hit rather than an extra request — only used here
    // to know whether the user has saved a server, for the star nudge.
    const { data: serversData } = useCachedFetch<{ servers: unknown[] }>('/api/servers');
    const serverCount = serversData?.servers.length ?? 0;

    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('sidebar-collapsed') === 'true';
    });
    const [isElectron, setIsElectron] = useState(false);

    // True while the on-screen keyboard is open (mobile/PWA). A fixed
    // bottom-0 element stays pinned to the layout viewport, which the keyboard
    // does not shrink — so it would otherwise float on top of the keyboard.
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    const [resendingVerification, setResendingVerification] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);

    const isSessionsPage = pathname === '/panel/sessions';
    const isLocalPage = pathname === '/panel/local';
    const isConnectPage = pathname.startsWith('/panel/connect/');

    // A "root" page maps directly to a primary nav item (or the local
    // terminal). Anything deeper (server detail, settings sub-page, connect…)
    // is a sub-page that needs a back affordance on mobile/PWA.
    const isRootPage = navigation.some((n) => n.href === pathname) || isLocalPage;

    const openLocalTerminal = useCallback(() => {
        router.push('/panel/local');
    }, [router]);

    /**
     * Go back through the navigation history. Used by the Electron desktop
     * app and the mobile/PWA top-bar back button. In an iOS standalone PWA
     * there is no browser chrome, so this is the only way back — fall back to
     * the panel root when there is no in-app history (e.g. deep link / reload).
     */
    const goBack = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (window.history.length > 1) router.back();
        else router.push('/panel');
    }, [router]);

    const toggleCollapsed = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', String(next));
            setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
            return next;
        });
    }, []);

    //  Electron: auto-open the local terminal once per app launch
    const autoOpenDoneRef = useRef(false);
    useEffect(() => {
        if (autoOpenDoneRef.current) return;
        if (typeof window === 'undefined' || !window.electronAPI?.isElectron) return;
        const key = 'electron-local-auto-opened';
        if (sessionStorage.getItem(key)) return;
        autoOpenDoneRef.current = true;
        sessionStorage.setItem(key, '1');
        router.push('/panel/local');
    }, [router]);

    //  Electron: navigate when the native "Go" menu is used
    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.onNavigate) return;
        return api.onNavigate((routePath) => router.push(routePath));
    }, [router]);

    //  Electron: shell commands target the sessions workspace, which is only
    //  visible on /panel/sessions — bring it into view before it handles them.
    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.onCommand) return;
        return api.onCommand((command) => {
            if (command.startsWith('shell:') || command === 'palette:open') {
                router.push('/panel/sessions');
            }
        });
    }, [router]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setIsElectron(Boolean(window.electronAPI?.isElectron));
    }, []);

    //  Detect the on-screen keyboard via the VisualViewport API so we can
    //  hide the fixed bottom nav while typing (otherwise it overlaps the
    //  keyboard on iOS/Android PWAs).
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return;
        const onResize = () => {
            // The keyboard is open when the visual viewport is meaningfully
            // shorter than the layout viewport (innerHeight does not shrink).
            setKeyboardOpen(window.innerHeight - vv.height > KEYBOARD_THRESHOLD_PX);
        };
        vv.addEventListener('resize', onResize);
        onResize();
        return () => vv.removeEventListener('resize', onResize);
    }, []);

    // A failed /api/auth/me (expired session, network) means we're not signed in.
    useEffect(() => {
        if (meError) router.push('/login');
    }, [meError, router]);

    useEffect(() => {
        if (isSessionsPage) {
            const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
            return () => clearTimeout(t);
        }
    }, [isSessionsPage]);

    const logout = useCallback(async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        clearCache(); // drop cached user/servers so a re-login starts clean
        router.push('/login');
    }, [router]);

    const resendVerification = useCallback(async () => {
        setResendingVerification(true);
        try {
            await fetch('/api/auth/send-verification', { method: 'POST' });
            setVerificationSent(true);
        } finally {
            setResendingVerification(false);
        }
    }, []);

    return {
        user,
        serverCount,
        pathname,
        collapsed,
        toggleCollapsed,
        isElectron,
        keyboardOpen,
        isSessionsPage,
        isLocalPage,
        isConnectPage,
        isRootPage,
        openLocalTerminal,
        goBack,
        logout,
        verification: {
            resending: resendingVerification,
            sent: verificationSent,
            resend: resendVerification,
        },
    };
}
