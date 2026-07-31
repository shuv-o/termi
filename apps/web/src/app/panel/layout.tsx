'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    Server,
    FolderOpen,
    Settings,
    LogOut,
    Plus,
    Shield,
    Monitor,
    Mail,
    PanelLeftClose,
    PanelLeftOpen,
    ChevronDown,
    ChevronLeft,
    Laptop,
    BookKey,
} from 'lucide-react';
import { SessionsProvider } from './sessions-context';
import SessionsWorkspace from './sessions-workspace';
import { useCachedFetch, clearCache } from '@/lib/hooks/useCachedFetch';
import TerminalLogo from '@/components/common/Logo';
import StarNudge from '@/components/common/StarNudge';
import { Button } from '@/components/ui/button';

interface User {
    id: string;
    email: string;
    name: string | null;
    totpEnabled: boolean;
    hasMasterKey: boolean;
    isVerified: boolean;
    isGoogleUser: boolean;
    createdAt: string;
}

const navigation = [
    { name: 'Servers', href: '/panel', icon: Server },
    { name: 'Sessions', href: '/panel/sessions', icon: Monitor },
    { name: 'Keychain', href: '/panel/keychain', icon: BookKey },
    { name: 'Groups', href: '/panel/groups', icon: FolderOpen },
    { name: 'Settings', href: '/panel/settings', icon: Settings },
];

//  ─ Tooltip for collapsed sidebar                      ─

function CollapseTooltip({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <span className="group relative flex justify-center">
            {children}
            <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap z-50 bg-popover border border-border text-foreground shadow-md opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
                {label}
            </span>
        </span>
    );
}

//  ─ Layout inner                               ─

function LayoutInner({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();

    // The signed-in user comes from a shared cache, so navigating between panel
    // pages never re-fetches it or flashes the shell behind a spinner — the
    // cached user paints instantly and revalidates in the background.
    const { data: meData, error: meError } = useCachedFetch<{ user: User }>('/api/auth/me');
    const user = meData?.user ?? null;

    // Same cache key the (unfiltered) dashboard server list uses, so this is
    // typically a free cache hit rather than an extra request — only used here
    // to know whether the user has saved a server, for the star nudge below.
    const { data: serversData } = useCachedFetch<{ servers: unknown[] }>('/api/servers');
    const serverCount = serversData?.servers.length ?? 0;

    // Desktop collapsed sidebar state
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('sidebar-collapsed') === 'true';
    });

    // Mobile user menu (top-bar avatar dropdown)
    const [userMenuOpen, setUserMenuOpen] = useState(false);
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

    /** Navigate to the dedicated local-terminal page. */
    const handleOpenLocalTerminal = useCallback(() => {
        router.push('/panel/local');
    }, [router]);

    /**
     * Go back through the navigation history. Used by the Electron desktop
     * app and the mobile/PWA top-bar back button. In an iOS standalone PWA
     * there is no browser chrome, so this is the only way back — fall back to
     * the panel root when there is no in-app history (e.g. deep link / reload).
     */
    const handleBack = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (window.history.length > 1) {
            router.back();
        } else {
            router.push('/panel');
        }
    }, [router]);

    /** True when the dedicated local terminal page is open. */
    const localTerminalActive = isLocalPage;

    //   Electron: auto-open the local terminal once per app launch
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

    //   Electron: navigate when the native "Go" menu is used
    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.onNavigate) return;
        return api.onNavigate((routePath) => router.push(routePath));
    }, [router]);

    //   Electron: shell commands target the sessions workspace, which is only
    //   visible on /panel/sessions — bring it into view before it handles them.
    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.onCommand) return;
        return api.onCommand((command) => {
            if (command.startsWith('shell:') || command === 'palette:open') {
                router.push('/panel/sessions');
            }
        });
    }, [router]);

    function toggleCollapsed() {
        setCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', String(next));
            setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
            return next;
        });
    }

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setIsElectron(Boolean(window.electronAPI?.isElectron));
    }, []);

    //   Detect the on-screen keyboard via the VisualViewport API so we can
    //   hide the fixed bottom nav while typing (otherwise it overlaps the
    //   keyboard on iOS/Android PWAs).
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return;
        const onResize = () => {
            // The keyboard is open when the visual viewport is meaningfully
            // shorter than the layout viewport (innerHeight does not shrink).
            setKeyboardOpen(window.innerHeight - vv.height > 150);
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

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        clearCache(); // drop cached user/servers so a re-login starts clean
        router.push('/login');
    };

    const handleResendVerification = async () => {
        setResendingVerification(true);
        try {
            await fetch('/api/auth/send-verification', { method: 'POST' });
            setVerificationSent(true);
        } finally {
            setResendingVerification(false);
        }
    };

    // Only block on the very first load, when nothing is cached yet. On every
    // later navigation `user` is already present, so the shell paints instantly.
    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    const sidebarW = collapsed ? 'lg:w-14' : 'lg:w-64 2xl:w-72';
    const contentPl = collapsed ? 'lg:pl-14' : 'lg:pl-64 2xl:pl-72';

    // Email banner is the top-most element on mobile, so it (rather than the
    // sticky header) carries the safe-area inset when shown.
    const showBanner = !user.isVerified && !user.isGoogleUser;

    return (
        <div className="min-h-screen bg-background">
            {/*   Desktop sidebar                      */}
            <aside
                className={`
                hidden lg:flex flex-col
                fixed top-0 left-0 bottom-0
                bg-card border-r border-border z-50
                ${sidebarW}
                transition-[width] duration-200 ease-in-out
            `}
            >
                <div className="h-0.5 w-full bg-gradient-to-r from-primary via-violet-500 to-transparent absolute top-0 left-0" />
                {/* Header */}
                <div
                    className={`flex items-center h-14 px-2.5 border-b border-border shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}
                >
                    {!collapsed && (
                        <Link
                            href="/panel"
                            className="flex items-center gap-2.5 overflow-hidden min-w-0"
                        >
                            <TerminalLogo width={30} height={30} className="rounded-lg shrink-0" />
                            <span className="text-base font-bold gradient-text whitespace-nowrap overflow-hidden">
                                Termi
                            </span>
                        </Link>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                        {isElectron && !collapsed && (
                            <button
                                onClick={handleBack}
                                title="Back (Cmd/Alt+←)"
                                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            onClick={toggleCollapsed}
                            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                        >
                            {collapsed ? (
                                <PanelLeftOpen className="w-4 h-4" />
                            ) : (
                                <PanelLeftClose className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Add Server */}
                <div
                    className={`px-3 pt-3 overflow-hidden transition-all duration-200 ${collapsed ? 'max-h-0 opacity-0 pt-0' : 'max-h-16 opacity-100'}`}
                >
                    <Button
                        asChild
                        className="w-full h-10 rounded-xl"
                        tabIndex={collapsed ? -1 : 0}
                    >
                        <Link href="/panel/servers/new">
                            <Plus className="w-4 h-4" />
                            Add Server
                        </Link>
                    </Button>
                </div>
                {collapsed && (
                    <div className="px-2 pt-3">
                        <CollapseTooltip label="Add Server">
                            <Button
                                asChild
                                size="icon"
                                variant="secondary"
                                className="w-full h-9 rounded-lg"
                            >
                                <Link href="/panel/servers/new">
                                    <Plus className="w-4 h-4" />
                                </Link>
                            </Button>
                        </CollapseTooltip>
                    </div>
                )}

                {/* Nav */}
                <nav className="flex-1 px-2 pt-3 space-y-1">
                    {/* Local Terminal (Electron only) */}
                    {isElectron &&
                        (collapsed ? (
                            <CollapseTooltip label="Local Terminal">
                                <button
                                    onClick={handleOpenLocalTerminal}
                                    title="Local Terminal"
                                    className={`relative flex items-center justify-center py-2.5 rounded-xl text-sm font-medium transition-colors select-none w-full ${
                                        localTerminalActive
                                            ? 'bg-primary/15 text-primary'
                                            : 'text-violet-400 hover:bg-accent hover:text-violet-300'
                                    }`}
                                >
                                    {localTerminalActive && (
                                        <span className="absolute left-0 h-4 w-0.5 rounded-full bg-primary" />
                                    )}
                                    <Laptop className="w-5 h-5 shrink-0" />
                                </button>
                            </CollapseTooltip>
                        ) : (
                            <button
                                onClick={handleOpenLocalTerminal}
                                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors select-none w-full ${
                                    localTerminalActive
                                        ? 'bg-primary/15 text-primary'
                                        : 'text-violet-400 hover:bg-accent hover:text-violet-300'
                                }`}
                            >
                                {localTerminalActive && (
                                    <span className="absolute left-0 h-4 w-0.5 rounded-full bg-primary" />
                                )}
                                <Laptop className="w-5 h-5 shrink-0" />
                                <span className="truncate">Local Terminal</span>
                            </button>
                        ))}

                    {navigation.map((item) => {
                        const isActive =
                            pathname === item.href ||
                            (item.href !== '/panel' && pathname.startsWith(item.href));
                        const cls = `relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-colors select-none ${
                            isActive
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        } ${collapsed ? 'justify-center px-0 w-full' : 'px-3'}`;

                        if (collapsed)
                            return (
                                <CollapseTooltip key={item.name} label={item.name}>
                                    <Link
                                        href={item.href}
                                        prefetch
                                        className={cls}
                                        title={item.name}
                                    >
                                        {isActive && (
                                            <span className="absolute left-0 h-4 w-0.5 rounded-full bg-primary" />
                                        )}
                                        <item.icon className="w-5 h-5 shrink-0" />
                                    </Link>
                                </CollapseTooltip>
                            );

                        return (
                            <Link key={item.name} href={item.href} prefetch className={cls}>
                                {isActive && (
                                    <span className="absolute left-0 h-4 w-0.5 rounded-full bg-primary" />
                                )}
                                <item.icon className="w-5 h-5 shrink-0" />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div
                    className={`p-3 border-t border-border shrink-0 ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}
                >
                    {collapsed ? (
                        <CollapseTooltip label={user.name || user.email}>
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-sm cursor-default shadow-sm">
                                {(user.name || user.email)[0].toUpperCase()}
                            </div>
                        </CollapseTooltip>
                    ) : (
                        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-sm shrink-0 shadow-sm">
                                {(user.name || user.email)[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                    {user.name || user.email}
                                </p>
                                {user.name && (
                                    <p className="truncate text-xs text-muted-foreground">
                                        {user.email}
                                    </p>
                                )}
                                {!user.name && user.totpEnabled && (
                                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                                        <Shield className="w-3 h-3" /> 2FA enabled
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-300"
                                title="Sign Out"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    {collapsed && (
                        <CollapseTooltip label="Sign Out">
                            <button
                                onClick={handleLogout}
                                className="flex items-center justify-center w-9 h-9 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </CollapseTooltip>
                    )}
                    {!collapsed && (
                        <div className="mt-2.5 text-center">
                            <a
                                href="https://shuvoo.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
                            >
                                Developed by Shuvo
                            </a>
                        </div>
                    )}
                </div>
            </aside>

            {/*   Main content                      ─ */}
            <div className={`${contentPl} transition-[padding] duration-200 ease-in-out`}>
                {/* Email verification banner */}
                {showBanner && (
                    <div
                        className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2.5 flex items-center justify-between gap-3"
                        style={{
                            paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))',
                            paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                            paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
                        }}
                    >
                        <div className="flex items-center gap-2 text-sm text-yellow-300 min-w-0">
                            <Mail className="w-4 h-4 shrink-0" />
                            <span className="truncate">
                                Verify your email to secure your account.
                            </span>
                        </div>
                        <button
                            onClick={handleResendVerification}
                            disabled={resendingVerification || verificationSent}
                            className="text-xs font-medium text-yellow-300 hover:text-yellow-200 underline shrink-0 disabled:opacity-50"
                        >
                            {verificationSent
                                ? 'Sent!'
                                : resendingVerification
                                  ? 'Sending…'
                                  : 'Resend'}
                        </button>
                    </div>
                )}

                {/*   Mobile top bar   */}
                <header
                    className="lg:hidden sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border"
                    style={{
                        // The banner (when shown) already pushes content below
                        // the status bar / Dynamic Island, so only the header
                        // carries the top inset when there is no banner.
                        paddingTop: showBanner ? undefined : 'env(safe-area-inset-top, 0px)',
                        paddingLeft: 'env(safe-area-inset-left, 0px)',
                        paddingRight: 'env(safe-area-inset-right, 0px)',
                    }}
                >
                    <div className="flex items-center justify-between h-14 px-4">
                        {isRootPage ? (
                            <Link href="/panel" className="flex items-center gap-2.5">
                                <TerminalLogo width={26} height={26} className="rounded-md" />
                                <span className="font-bold text-sm">Termi</span>
                            </Link>
                        ) : (
                            <button
                                onClick={handleBack}
                                aria-label="Go back"
                                className="flex items-center gap-1 -ml-1.5 pr-2 py-1.5 rounded-lg text-foreground hover:bg-secondary active:scale-95 transition-transform"
                            >
                                <ChevronLeft className="w-5 h-5 shrink-0" />
                                <span className="text-sm font-medium">Back</span>
                            </button>
                        )}

                        {/* Current page title */}
                        <span className="text-sm font-medium text-muted-foreground capitalize">
                            {navigation.find(
                                (n) =>
                                    pathname === n.href ||
                                    (n.href !== '/panel' && pathname.startsWith(n.href)),
                            )?.name ?? ''}
                        </span>

                        {/* User avatar + logout dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setUserMenuOpen((o) => !o)}
                                className="flex items-center gap-1 p-1 rounded-lg hover:bg-secondary transition-colors"
                            >
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-xs">
                                    {(user.name || user.email)[0].toUpperCase()}
                                </div>
                                <ChevronDown
                                    className={`w-3 h-3 text-muted-foreground transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {userMenuOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setUserMenuOpen(false)}
                                    />
                                    <div className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                                        <div className="px-3 py-2.5 border-b border-border">
                                            {user.name && (
                                                <p className="text-xs font-medium truncate">
                                                    {user.name}
                                                </p>
                                            )}
                                            <p
                                                className={`truncate ${user.name ? 'text-[10px] text-muted-foreground' : 'text-xs font-medium'}`}
                                            >
                                                {user.email}
                                            </p>
                                            {user.totpEnabled && (
                                                <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                                                    <Shield className="w-2.5 h-2.5" /> 2FA enabled
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => {
                                                setUserMenuOpen(false);
                                                handleLogout();
                                            }}
                                            className="w-full flex items-center gap-2.5 px-3 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" /> Sign Out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <div className={isSessionsPage ? '' : 'hidden'}>
                    <SessionsWorkspace />
                </div>

                {!isSessionsPage && !isConnectPage && (
                    <main
                        // Re-key on the path so each navigation replays the fade;
                        // scoped to ordinary pages only — the sessions workspace
                        // and connect views are rendered elsewhere and never
                        // re-animate, protecting their live terminals.
                        key={pathname}
                        className={`animate-fade-in ${
                            isLocalPage ? 'p-4 sm:p-5 lg:p-8' : 'p-4 sm:p-5 lg:p-8 pb-28 lg:pb-8'
                        }`}
                    >
                        {children}
                    </main>
                )}
                {isConnectPage && <>{children}</>}
            </div>

            {/*   Mobile bottom navigation bar — floating "Liquid Glass" capsule,
                clear of every edge, rather than a bar docked flush to the
                screen bottom.                          ─ */}
            <nav
                className={`lg:hidden fixed inset-x-0 z-40 flex justify-center transition-transform duration-200 ${
                    keyboardOpen ? 'translate-y-[calc(100%+2rem)] pointer-events-none' : 'translate-y-0'
                }`}
                style={{
                    bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.9rem))',
                    paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                    paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
                }}
            >
                <div className="relative flex items-center gap-0.5 h-[50px] px-1.5 rounded-[24px] bg-card/70 backdrop-blur-2xl border border-border/60 shadow-[0_12px_36px_-8px_rgba(0,0,0,0.45)]">
                    {/* Glass sheen — a faint highlight along the top edge of the
                        capsule so the bar reads as glass, not a flat panel */}
                    <div className="pointer-events-none absolute inset-x-4 top-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

                    {navigation.map((item) => {
                        const isActive =
                            pathname === item.href ||
                            (item.href !== '/panel' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex flex-col items-center justify-center gap-0.5 w-[54px] h-[42px] rounded-[16px] transition-all active:scale-90 duration-150 ${
                                    isActive ? 'bg-primary/15' : ''
                                }`}
                            >
                                <item.icon
                                    className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                                        isActive ? 'text-primary' : 'text-muted-foreground/55'
                                    }`}
                                />
                                <span
                                    className={`text-[9px] leading-none tracking-tight transition-colors ${
                                        isActive
                                            ? 'font-semibold text-primary'
                                            : 'font-medium text-muted-foreground/55'
                                    }`}
                                >
                                    {item.name}
                                </span>
                            </Link>
                        );
                    })}

                    {/* Local Terminal (mobile, Electron only) */}
                    {isElectron && (
                        <button
                            onClick={handleOpenLocalTerminal}
                            className={`flex flex-col items-center justify-center gap-0.5 w-[54px] h-[42px] rounded-[16px] transition-all active:scale-90 duration-150 ${
                                localTerminalActive ? 'bg-violet-500/15' : ''
                            }`}
                        >
                            <Laptop
                                className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                                    localTerminalActive ? 'text-violet-400' : 'text-violet-400/50'
                                }`}
                            />
                            <span
                                className={`text-[9px] leading-none tracking-tight transition-colors ${
                                    localTerminalActive
                                        ? 'font-semibold text-violet-400'
                                        : 'font-medium text-violet-400/50'
                                }`}
                            >
                                Local
                            </span>
                        </button>
                    )}
                </div>
            </nav>

            <StarNudge userCreatedAt={user.createdAt} serverCount={serverCount} />
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <SessionsProvider>
            <LayoutInner>{children}</LayoutInner>
        </SessionsProvider>
    );
}
