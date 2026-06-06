'use client';

import {useEffect, useState, useCallback, useRef} from 'react';
import {useRouter, usePathname} from 'next/navigation';
import Link from 'next/link';
import {
    Server, FolderOpen, Settings, LogOut,
    Plus, Search, Shield, Monitor, Mail,
    PanelLeftClose, PanelLeftOpen, ChevronDown, Laptop,
} from 'lucide-react';
import {SessionsProvider} from './sessions-context';
import SessionsWorkspace from './sessions-workspace';
import TerminalLogo from '@/components/common/Logo';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    hasMasterKey: boolean;
    isVerified: boolean;
    isGoogleUser: boolean;
}

const navigation = [
    {name: 'Servers', href: '/panel', icon: Server},
    {name: 'Groups', href: '/panel/groups', icon: FolderOpen},
    {name: 'Sessions', href: '/panel/sessions', icon: Monitor},
    {name: 'Settings', href: '/panel/settings', icon: Settings},
];

// ─── Tooltip for collapsed sidebar ───────────────────────────────────────────

function CollapseTooltip({label, children}: { label: string; children: React.ReactNode }) {
    return (
        <span className="group relative flex justify-center">
            {children}
            <span
                className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap z-50 bg-popover border border-border text-foreground shadow-md opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
                {label}
            </span>
        </span>
    );
}

// ─── Layout inner ─────────────────────────────────────────────────────────────

function LayoutInner({children}: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Desktop collapsed sidebar state
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('sidebar-collapsed') === 'true';
    });

    // Mobile user menu (top-bar avatar dropdown)
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const [resendingVerification, setResendingVerification] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);

    const isSessionsPage = pathname === '/panel/sessions';
    const isLocalPage = pathname === '/panel/local';

    /** Navigate to the dedicated local-terminal page. */
    const handleOpenLocalTerminal = useCallback(() => {
        router.push('/panel/local');
    }, [router]);

    /** True when the dedicated local terminal page is open. */
    const localTerminalActive = isLocalPage;

    // ── Electron: auto-open the local terminal once per app launch ──
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

    // ── Electron: navigate when the native "Go" menu is used ──
    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.onNavigate) return;
        return api.onNavigate((routePath) => router.push(routePath));
    }, [router]);

    function toggleCollapsed() {
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', String(next));
            setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
            return next;
        });
    }

    useEffect(() => {
        async function fetchUser() {
            try {
                const response = await fetch('/api/auth/me');
                const data = await response.json();
                if (!data.success) {
                    router.push('/login');
                    return;
                }
                setUser(data.data.user);
            } catch {
                router.push('/login');
            } finally {
                setLoading(false);
            }
        }

        fetchUser();
    }, [router]);

    useEffect(() => {
        if (isSessionsPage) {
            const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
            return () => clearTimeout(t);
        }
    }, [isSessionsPage]);

    const handleLogout = async () => {
        await fetch('/api/auth/logout', {method: 'POST'});
        router.push('/login');
    };

    const handleResendVerification = async () => {
        setResendingVerification(true);
        try {
            await fetch('/api/auth/send-verification', {method: 'POST'});
            setVerificationSent(true);
        } finally {
            setResendingVerification(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"/>
            </div>
        );
    }

    if (!user) return null;

    const sidebarW = collapsed ? 'lg:w-14' : 'lg:w-64';
    const contentPl = collapsed ? 'lg:pl-14' : 'lg:pl-64';

    return (
        <div className="min-h-screen bg-background">

            {/* ── Desktop sidebar ──────────────────────────────────────── */}
            <aside className={`
                hidden lg:flex flex-col
                fixed top-0 left-0 bottom-0
                bg-card border-r border-border z-50
                ${sidebarW}
                transition-[width] duration-200 ease-in-out
            `}>
                {/* Header */}
                <div
                    className={`flex items-center h-16 px-3 border-b border-border shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                    {!collapsed && (
                        <Link href="/panel" className="flex items-center gap-3 overflow-hidden min-w-0">
                            <TerminalLogo width={32} height={32} className="rounded-lg shrink-0"/>
                            <span className="text-lg font-bold gradient-text whitespace-nowrap overflow-hidden">
                                Termi
                            </span>
                        </Link>
                    )}
                    <button
                        onClick={toggleCollapsed}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                    >
                        {collapsed ? <PanelLeftOpen className="w-4 h-4"/> : <PanelLeftClose className="w-4 h-4"/>}
                    </button>
                </div>

                {/* Search */}
                <div
                    className={`px-3 pt-3 overflow-hidden transition-all duration-200 ${collapsed ? 'max-h-0 opacity-0 pt-0' : 'max-h-20 opacity-100'}`}>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                        <Input type="text" placeholder="Search servers..."
                               className="pl-9 text-sm h-9 bg-secondary border-border" tabIndex={collapsed ? -1 : 0}/>
                    </div>
                </div>

                {/* Add Server */}
                <div
                    className={`px-3 pt-3 overflow-hidden transition-all duration-200 ${collapsed ? 'max-h-0 opacity-0 pt-0' : 'max-h-16 opacity-100'}`}>
                    <Button asChild className="w-full" tabIndex={collapsed ? -1 : 0}>
                        <Link href="/panel/servers/new"><Plus className="w-4 h-4"/>Add Server</Link>
                    </Button>
                </div>
                {collapsed && (
                    <div className="px-2 pt-3">
                        <CollapseTooltip label="Add Server">
                            <Button asChild size="icon" variant="secondary" className="w-full h-9 rounded-lg">
                                <Link href="/panel/servers/new"><Plus className="w-4 h-4"/></Link>
                            </Button>
                        </CollapseTooltip>
                    </div>
                )}

                {/* Nav */}
                <nav className="flex-1 px-2 pt-3 space-y-0.5">
                    {/* Local Terminal */}
                    {collapsed ? (
                        <CollapseTooltip label="Local Terminal">
                            <button
                                onClick={handleOpenLocalTerminal}
                                title="Local Terminal"
                                className={`flex items-center justify-center py-2.5 rounded-lg text-sm font-medium transition-colors select-none w-full ${
                                    localTerminalActive
                                        ? 'bg-primary/20 text-primary'
                                        : 'text-violet-400 hover:bg-accent hover:text-violet-300'
                                }`}
                            >
                                <Laptop className="w-5 h-5 shrink-0"/>
                            </button>
                        </CollapseTooltip>
                    ) : (
                        <button
                            onClick={handleOpenLocalTerminal}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors select-none w-full ${
                                localTerminalActive
                                    ? 'bg-primary/20 text-primary'
                                    : 'text-violet-400 hover:bg-accent hover:text-violet-300'
                            }`}
                        >
                            <Laptop className="w-5 h-5 shrink-0"/>
                            <span className="truncate">Local Terminal</span>
                        </button>
                    )}

                    {navigation.map(item => {
                        const isActive = pathname === item.href || (item.href !== '/panel' && pathname.startsWith(item.href));
                        const cls = `flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors select-none ${
                            isActive ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        } ${collapsed ? 'justify-center px-0 w-full' : 'px-3'}`;

                        if (collapsed) return (
                            <CollapseTooltip key={item.name} label={item.name}>
                                <Link href={item.href} className={cls} title={item.name}>
                                    <item.icon className="w-5 h-5 shrink-0"/>
                                </Link>
                            </CollapseTooltip>
                        );

                        return (
                            <Link key={item.name} href={item.href} className={cls}>
                                <item.icon className="w-5 h-5 shrink-0"/>
                                <span className="truncate">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div
                    className={`p-3 border-t border-border shrink-0 space-y-1 ${collapsed ? 'flex flex-col items-center' : ''}`}>
                    {collapsed ? (
                        <CollapseTooltip label={user.email}>
                            <div
                                className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-sm cursor-default">
                                {user.email[0].toUpperCase()}
                            </div>
                        </CollapseTooltip>
                    ) : (
                        <div className="flex items-center gap-3 mb-1">
                            <div
                                className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-sm shrink-0">
                                {user.email[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user.email}</p>
                                {user.totpEnabled && (
                                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                                        <Shield className="w-3 h-3"/> 2FA
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    {collapsed ? (
                        <CollapseTooltip label="Sign Out">
                            <button onClick={handleLogout}
                                    className="flex items-center justify-center w-9 h-9 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors mt-1">
                                <LogOut className="w-4 h-4"/>
                            </button>
                        </CollapseTooltip>
                    ) : (
                        <Button variant="ghost"
                                className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={handleLogout}>
                            <LogOut className="w-4 h-4"/> Sign Out
                        </Button>
                    )}
                </div>
            </aside>

            {/* ── Main content ─────────────────────────────────────────── */}
            <div className={`${contentPl} transition-[padding] duration-200 ease-in-out`}>

                {/* Email verification banner */}
                {user && !user.isVerified && !user.isGoogleUser && (
                    <div
                        className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-yellow-300 min-w-0">
                            <Mail className="w-4 h-4 shrink-0"/>
                            <span className="truncate">Verify your email to secure your account.</span>
                        </div>
                        <button
                            onClick={handleResendVerification}
                            disabled={resendingVerification || verificationSent}
                            className="text-xs font-medium text-yellow-300 hover:text-yellow-200 underline shrink-0 disabled:opacity-50"
                        >
                            {verificationSent ? 'Sent!' : resendingVerification ? 'Sending…' : 'Resend'}
                        </button>
                    </div>
                )}

                {/* ── Mobile top bar ── */}
                <header className="lg:hidden sticky top-0 z-30 h-14 bg-card/90 backdrop-blur-md border-b border-border">
                    <div className="flex items-center justify-between h-full px-4">
                        <Link href="/panel" className="flex items-center gap-2.5">
                            <TerminalLogo width={26} height={26} className="rounded-md"/>
                            <span className="font-bold text-sm">Termi</span>
                        </Link>

                        {/* Current page title */}
                        <span className="text-sm font-medium text-muted-foreground capitalize">
                            {navigation.find(n => pathname === n.href || (n.href !== '/panel' && pathname.startsWith(n.href)))?.name ?? ''}
                        </span>

                        {/* User avatar + logout dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setUserMenuOpen(o => !o)}
                                className="flex items-center gap-1 p-1 rounded-lg hover:bg-secondary transition-colors"
                            >
                                <div
                                    className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-xs">
                                    {user.email[0].toUpperCase()}
                                </div>
                                <ChevronDown
                                    className={`w-3 h-3 text-muted-foreground transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}/>
                            </button>

                            {userMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)}/>
                                    <div
                                        className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                                        <div className="px-3 py-2.5 border-b border-border">
                                            <p className="text-xs font-medium truncate">{user.email}</p>
                                            {user.totpEnabled && (
                                                <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                                                    <Shield className="w-2.5 h-2.5"/> 2FA enabled
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
                                            <LogOut className="w-4 h-4"/> Sign Out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <div className={isSessionsPage ? 'p-4 lg:p-8' : 'hidden'}>
                    <SessionsWorkspace/>
                </div>

                {!isSessionsPage && (
                    <main className={isLocalPage ? 'p-4 lg:p-8' : 'p-4 lg:p-8 pb-24 lg:pb-8'}>{children}</main>
                )}
            </div>

            {/* ── Mobile bottom navigation bar ─────────────────────────── */}
            <nav
                className="lg:hidden fixed bottom-0 left-0 right-0 z-40"
                style={{paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}
            >
                {/* Frosted glass background */}
                <div className="absolute inset-0 bg-card/80 backdrop-blur-xl border-t border-border/60"/>

                <div className="relative flex items-center justify-around h-16 px-3">
                    {navigation.map(item => {
                        const isActive = pathname === item.href || (item.href !== '/panel' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className="flex flex-col items-center justify-center gap-1 transition-transform active:scale-90 min-w-0"
                            >
                                {isActive ? (
                                    /* Active: pill with icon + label inside */
                                    <div
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary shadow-[0_0_14px_3px_rgba(14,165,233,0.30)]">
                                        <item.icon className="w-[17px] h-[17px] text-white shrink-0"/>
                                        <span className="text-[12px] font-semibold text-white leading-none">
                                            {item.name}
                                        </span>
                                    </div>
                                ) : (
                                    /* Inactive: icon only */
                                    <div className="flex items-center justify-center w-10 h-[34px]">
                                        <item.icon className="w-[20px] h-[20px] text-muted-foreground/50"/>
                                    </div>
                                )}
                            </Link>
                        );
                    })}

                    {/* Local Terminal (mobile) */}
                    <button
                        onClick={handleOpenLocalTerminal}
                        className="flex flex-col items-center justify-center gap-1 transition-transform active:scale-90 min-w-0"
                    >
                        {localTerminalActive ? (
                            <div
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-violet-600 shadow-[0_0_14px_3px_rgba(124,58,237,0.30)]">
                                <Laptop className="w-[17px] h-[17px] text-white shrink-0"/>
                                <span className="text-[12px] font-semibold text-white leading-none">Local</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center w-10 h-[34px]">
                                <Laptop className="w-[20px] h-[20px] text-violet-400/60"/>
                            </div>
                        )}
                    </button>
                </div>
            </nav>
        </div>
    );
}

export default function DashboardLayout({children}: { children: React.ReactNode }) {
    return (
        <SessionsProvider>
            <LayoutInner>{children}</LayoutInner>
        </SessionsProvider>
    );
}
