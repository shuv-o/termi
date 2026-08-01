'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, Laptop, LogOut, Mail, Shield } from 'lucide-react';
import TerminalLogo from '@/components/common/Logo';
import { activeNavName, isNavItemActive, navigation, type PanelUser } from './navigation';

/** Prompt to verify the account email; sits above the mobile header. */
export function VerifyEmailBanner({
    resending,
    sent,
    onResend,
}: {
    resending: boolean;
    sent: boolean;
    onResend: () => void;
}) {
    return (
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
                <span className="truncate">Verify your email to secure your account.</span>
            </div>
            <button
                onClick={onResend}
                disabled={resending || sent}
                className="text-xs font-medium text-yellow-300 hover:text-yellow-200 underline shrink-0 disabled:opacity-50"
            >
                {sent ? 'Sent!' : resending ? 'Sending…' : 'Resend'}
            </button>
        </div>
    );
}

function UserMenu({ user, onLogout }: { user: PanelUser; onLogout: () => void }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1 p-1 rounded-lg hover:bg-secondary transition-colors"
            >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-xs">
                    {(user.name || user.email)[0].toUpperCase()}
                </div>
                <ChevronDown
                    className={`w-3 h-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && (
                <>
                    {/* Click-away catcher behind the menu. */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                        <div className="px-3 py-2.5 border-b border-border">
                            {user.name && (
                                <p className="text-xs font-medium truncate">{user.name}</p>
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
                                setOpen(false);
                                onLogout();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export function MobileTopBar({
    user,
    pathname,
    isRootPage,
    showBanner,
    onBack,
    onLogout,
}: {
    user: PanelUser;
    pathname: string;
    isRootPage: boolean;
    showBanner: boolean;
    onBack: () => void;
    onLogout: () => void;
}) {
    return (
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
                        onClick={onBack}
                        aria-label="Go back"
                        className="flex items-center gap-1 -ml-1.5 pr-2 py-1.5 rounded-lg text-foreground hover:bg-secondary active:scale-95 transition-transform"
                    >
                        <ChevronLeft className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium">Back</span>
                    </button>
                )}

                <span className="text-sm font-medium text-muted-foreground capitalize">
                    {activeNavName(pathname)}
                </span>

                <UserMenu user={user} onLogout={onLogout} />
            </div>
        </header>
    );
}

/**
 * Floating "Liquid Glass" capsule, clear of every edge, rather than a bar
 * docked flush to the screen bottom. The caller omits it entirely on terminal
 * views so those screens get the full viewport.
 */
export function MobileBottomNav({
    pathname,
    keyboardOpen,
    isElectron,
    localTerminalActive,
    onOpenLocalTerminal,
}: {
    pathname: string;
    keyboardOpen: boolean;
    isElectron: boolean;
    localTerminalActive: boolean;
    onOpenLocalTerminal: () => void;
}) {
    const itemClass = (active: boolean, activeBg: string) =>
        `flex flex-col items-center justify-center gap-0.5 w-[60px] h-[48px] rounded-[18px] transition-all active:scale-90 duration-150 ${
            active ? activeBg : ''
        }`;

    return (
        <nav
            className={`lg:hidden fixed inset-x-0 z-40 flex justify-center transition-transform duration-200 ${
                keyboardOpen ? 'translate-y-[calc(100%+2rem)] pointer-events-none' : 'translate-y-0'
            }`}
            style={{
                bottom: 'max(0.625rem, calc(env(safe-area-inset-bottom, 0px) + 0.375rem))',
                paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
            }}
        >
            <div className="relative flex items-center gap-1 h-[58px] px-2 rounded-[27px] bg-card/70 backdrop-blur-2xl border border-border/60 shadow-[0_12px_36px_-8px_rgba(0,0,0,0.45)]">
                {/* Glass sheen — a faint highlight along the top edge of the
                    capsule so the bar reads as glass, not a flat panel */}
                <div className="pointer-events-none absolute inset-x-4 top-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

                {navigation.map((item) => {
                    const isActive = isNavItemActive(item.href, pathname);
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={itemClass(isActive, 'bg-primary/15')}
                        >
                            <item.icon
                                className={`w-[20px] h-[20px] shrink-0 transition-colors ${
                                    isActive ? 'text-primary' : 'text-muted-foreground/55'
                                }`}
                            />
                            <span
                                className={`text-[9.5px] leading-none tracking-tight transition-colors ${
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

                {isElectron && (
                    <button
                        onClick={onOpenLocalTerminal}
                        className={itemClass(localTerminalActive, 'bg-violet-500/15')}
                    >
                        <Laptop
                            className={`w-[20px] h-[20px] shrink-0 transition-colors ${
                                localTerminalActive ? 'text-violet-400' : 'text-violet-400/50'
                            }`}
                        />
                        <span
                            className={`text-[9.5px] leading-none tracking-tight transition-colors ${
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
    );
}
