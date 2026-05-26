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
    { name: 'Servers', href: '/panel', icon: Server },
    { name: 'Groups', href: '/panel/groups', icon: FolderOpen },
    { name: 'Sessions', href: '/panel/sessions', icon: Monitor },
    { name: 'Settings', href: '/panel/settings', icon: Settings },
];

function LayoutInner({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [resendingVerification, setResendingVerification] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);

    const isSessionsPage = pathname === '/panel/sessions';

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

    return (
        <div className="min-h-screen bg-background">
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside
                className={`fixed top-0 left-0 bottom-0 w-64 bg-card border-r border-border z-50 transform transition-transform duration-200 lg:translate-x-0 ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between h-16 px-4 border-b border-border">
                        <Link href="/panel" className="flex items-center gap-3">
                            <TerminalLogo width={36} height={36} className="rounded-lg" />
                            <span className="text-lg font-bold gradient-text">Termi</span>
                        </Link>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    <div className="p-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search servers..."
                                className="pl-9 text-sm h-9 bg-secondary border-border"
                            />
                        </div>
                    </div>

                    <div className="px-4 mb-4">
                        <Button asChild className="w-full">
                            <Link href="/panel/servers/new">
                                <Plus className="w-4 h-4" />
                                Add Server
                            </Link>
                        </Button>
                    </div>

                    <nav className="flex-1 px-2 space-y-1">
                        {navigation.map((item) => {
                            const isActive =
                                pathname === item.href ||
                                (item.href !== '/panel' && pathname.startsWith(item.href));
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                        isActive
                                            ? 'bg-primary/20 text-primary'
                                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                    }`}
                                >
                                    <item.icon className="w-5 h-5" />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-border">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-linear-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium">
                                {user.email[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user.email}</p>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    {user.totpEnabled && (
                                        <span className="flex items-center gap-1 text-emerald-400">
                                            <Shield className="w-3 h-3" />
                                            2FA
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={handleLogout}
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            </aside>

            <div className="lg:pl-64">
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

                <header className="sticky top-0 z-30 h-16 bg-card/80 backdrop-blur-lg border-b border-border lg:hidden">
                    <div className="flex items-center justify-between h-full px-4">
                        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
                            <Menu className="w-6 h-6" />
                        </Button>
                        <Link href="/panel" className="flex items-center gap-2">
                            <TerminalLogo width={28} height={28} className="rounded-md" />
                            <span className="font-bold">Termi</span>
                        </Link>
                        <div className="w-10" />
                    </div>
                </header>

                <div className={isSessionsPage ? '' : 'hidden'}>
                    <main className="p-4 lg:p-8">
                        <SessionsWorkspace />
                    </main>
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
