'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    Server,
    FolderOpen,
    Settings,
    LogOut,
    Menu,
    X,
    Plus,
    Search,
    Shield,
    Monitor,
    Mail,
    ChevronLeft,
    ChevronRight,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react';
import { SessionsProvider } from './sessions-context';
import SessionsWorkspace from './sessions-workspace';
import TerminalLogo from '@/components/common/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    hasMasterKey: boolean;
    isVerified: boolean;
    isGoogleUser: boolean;
}

const navigation = [
    { name: 'Servers',   href: '/panel',          icon: Server  },
    { name: 'Groups',    href: '/panel/groups',    icon: FolderOpen },
    { name: 'Sessions',  href: '/panel/sessions',  icon: Monitor },
    { name: 'Settings',  href: '/panel/settings',  icon: Settings },
];

// ─── Tooltip wrapper shown only when sidebar is collapsed ─────────────────────

function CollapseTooltip({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <span className="group relative flex">
            {children}
            <span
                className={`
                    pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2
                    px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap z-50
                    bg-popover border border-border text-foreground shadow-md
                    opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0
                    transition-all duration-150
                `}
            >
                {label}
            </span>
        </span>
    );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
    const router   = useRouter();
    const pathname = usePathname();

    const [user,   setUser]   = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Mobile drawer
    const [mobileOpen, setMobileOpen] = useState(false);

    // Desktop collapsed state — persisted to localStorage
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('sidebar-collapsed') === 'true';
    });

    const [resendingVerification, setResendingVerification] = useState(false);
    const [verificationSent,      setVerificationSent]      = useState(false);

    const isSessionsPage = pathname === '/panel/sessions';

    function toggleCollapsed() {
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('sidebar-collapsed', String(next));
            // Let the terminal re-measure after layout settles
            setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
            return next;
        });
    }

    useEffect(() => {
        async function fetchUser() {
            try {
                const response = await fetch('/api/auth/me');
                const data = await response.json();
                if (!data.success) { router.push('/login'); return; }
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
        await fetch('/api/auth/logout', { method: 'POST' });
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

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    // Width tokens used in both the aside and the content offset
    const sidebarW     = collapsed ? 'lg:w-14'  : 'lg:w-64';
    const contentPl    = collapsed ? 'lg:pl-14' : 'lg:pl-64';

    return (
        <div className="min-h-screen bg-background">
            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* ── Sidebar ─────────────────────────────────────────────────── */}
            <aside
                className={`
                    fixed top-0 left-0 bottom-0 bg-card border-r border-border z-50
                    flex flex-col
                    w-64 ${sidebarW}
                    transform transition-[width,transform] duration-200 ease-in-out
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
            >
                {/* Header */}
                <div className={`
                    flex items-center h-16 px-3 border-b border-border shrink-0
                    ${collapsed ? 'justify-center' : 'justify-between'}
                `}>
                    {/* Logo + wordmark */}
                    <Link
                        href="/panel"
                        className={`flex items-center gap-3 overflow-hidden ${collapsed ? 'pointer-events-none' : ''}`}
                        tabIndex={collapsed ? -1 : 0}
                    >
                        <TerminalLogo width={32} height={32} className="rounded-lg shrink-0" />
                        <span
                            className={`text-lg font-bold gradient-text whitespace-nowrap overflow-hidden transition-all duration-200 ${
                                collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
                            }`}
                        >
                            Termi
                        </span>
                    </Link>

                    {/* Desktop collapse toggle */}
                    <button
                        onClick={toggleCollapsed}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        className={`
                            hidden lg:flex items-center justify-center
                            w-7 h-7 rounded-lg
                            text-muted-foreground hover:text-foreground hover:bg-secondary
                            transition-colors shrink-0
                            ${collapsed ? 'mt-0' : ''}
                        `}
                    >
                        {collapsed
                            ? <PanelLeftOpen  className="w-4 h-4" />
                            : <PanelLeftClose className="w-4 h-4" />
                        }
                    </button>

                    {/* Mobile close button */}
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="lg:hidden flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Search — hidden when collapsed */}
                <div
                    className={`px-3 pt-3 overflow-hidden transition-all duration-200 ${
                        collapsed ? 'max-h-0 opacity-0 pt-0' : 'max-h-20 opacity-100'
                    }`}
                >
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search servers..."
                            className="pl-9 text-sm h-9 bg-secondary border-border"
                            tabIndex={collapsed ? -1 : 0}
                        />
                    </div>
                </div>

                {/* Add Server button */}
                <div
                    className={`px-3 pt-3 overflow-hidden transition-all duration-200 ${
                        collapsed ? 'max-h-0 opacity-0 pt-0' : 'max-h-16 opacity-100'
                    }`}
                >
                    <Button asChild className="w-full" tabIndex={collapsed ? -1 : 0}>
                        <Link href="/panel/servers/new">
                            <Plus className="w-4 h-4" />
                            Add Server
                        </Link>
                    </Button>
                </div>

                {/* Add button — collapsed icon only */}
                {collapsed && (
                    <div className="px-2 pt-3">
                        <CollapseTooltip label="Add Server">
                            <Button asChild size="icon" variant="secondary" className="w-full h-9 rounded-lg">
                                <Link href="/panel/servers/new">
                                    <Plus className="w-4 h-4" />
                                </Link>
                            </Button>
                        </CollapseTooltip>
                    </div>
                )}

                {/* Nav items */}
                <nav className="flex-1 px-2 pt-3 space-y-0.5 overflow-y-auto">
                    {navigation.map(item => {
                        const isActive =
                            pathname === item.href ||
                            (item.href !== '/panel' && pathname.startsWith(item.href));

                        const linkClass = `
                            flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                            transition-colors select-none
                            ${isActive
                                ? 'bg-primary/20 text-primary'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            }
                            ${collapsed ? 'justify-center px-0' : ''}
                        `;

                        if (collapsed) {
                            return (
                                <CollapseTooltip key={item.name} label={item.name}>
                                    <Link
                                        href={item.href}
                                        onClick={() => setMobileOpen(false)}
                                        className={linkClass}
                                        title={item.name}
                                    >
                                        <item.icon className="w-5 h-5 shrink-0" />
                                    </Link>
                                </CollapseTooltip>
                            );
                        }

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={linkClass}
                            >
                                <item.icon className="w-5 h-5 shrink-0" />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className={`p-3 border-t border-border shrink-0 space-y-1 ${collapsed ? 'flex flex-col items-center' : ''}`}>
                    {/* User row */}
                    {collapsed ? (
                        <CollapseTooltip label={user.email}>
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-sm cursor-default">
                                {user.email[0].toUpperCase()}
                            </div>
                        </CollapseTooltip>
                    ) : (
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-sm shrink-0">
                                {user.email[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user.email}</p>
                                {user.totpEnabled && (
                                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                                        <Shield className="w-3 h-3" /> 2FA
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Sign out */}
                    {collapsed ? (
                        <CollapseTooltip label="Sign Out">
                            <button
                                onClick={handleLogout}
                                className="flex items-center justify-center w-9 h-9 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors mt-1"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </CollapseTooltip>
                    ) : (
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={handleLogout}
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </Button>
                    )}
                </div>
            </aside>

            {/* ── Main content ────────────────────────────────────────────── */}
            <div className={`${contentPl} transition-[padding] duration-200 ease-in-out`}>

                {/* Email verification banner */}
                {user && !user.isVerified && !user.isGoogleUser && (
                    <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-2.5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-sm text-yellow-300">
                            <Mail className="w-4 h-4 shrink-0" />
                            <span>Please verify your email address to secure your account.</span>
                        </div>
                        <button
                            onClick={handleResendVerification}
                            disabled={resendingVerification || verificationSent}
                            className="text-xs font-medium text-yellow-300 hover:text-yellow-200 underline shrink-0 disabled:opacity-50"
                        >
                            {verificationSent ? 'Email sent!' : resendingVerification ? 'Sending…' : 'Resend verification'}
                        </button>
                    </div>
                )}

                {/* Mobile top bar */}
                <header className="sticky top-0 z-30 h-16 bg-card/80 backdrop-blur-lg border-b border-border lg:hidden">
                    <div className="flex items-center justify-between h-full px-4">
                        <button
                            onClick={() => setMobileOpen(true)}
                            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <Link href="/panel" className="flex items-center gap-2">
                            <TerminalLogo width={28} height={28} className="rounded-md" />
                            <span className="font-bold">Termi</span>
                        </Link>
                        <div className="w-9" />
                    </div>
                </header>

                <div className={isSessionsPage ? 'p-4 lg:p-8' : 'hidden'}>
                    <SessionsWorkspace />
                </div>

                {!isSessionsPage && (
                    <main className="p-4 lg:p-8">{children}</main>
                )}
            </div>
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
