'use client';

import Link from 'next/link';
import { ChevronLeft, Laptop, LogOut, Mail, Search, Settings, Shield } from 'lucide-react';
import TerminalLogo from '@/components/common/Logo';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette';
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
            className="bg-warning/10 border-b border-warning/30 px-4 py-2.5 flex items-center justify-between gap-3"
            style={{
                paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))',
                paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
            }}
        >
            <div className="flex items-center gap-2 text-sm text-warning min-w-0">
                <Mail className="w-4 h-4 shrink-0" />
                <span className="truncate">Verify your email to secure your account.</span>
            </div>
            <button
                onClick={onResend}
                disabled={resending || sent}
                className="h-8 shrink-0 rounded-md border border-warning/30 px-2.5 text-xs font-medium text-warning transition-colors hover:bg-warning/10 disabled:opacity-50"
            >
                {sent ? 'Email sent' : resending ? 'Sending…' : 'Resend email'}
            </button>
        </div>
    );
}

function UserMenu({ user, onLogout }: { user: PanelUser; onLogout: () => void }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    aria-label="Account"
                    className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-accent"
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-input bg-accent text-xs font-semibold">
                        {(user.name || user.email)[0].toUpperCase()}
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
                <div className="px-2.5 py-2">
                    {user.name && <p className="truncate text-sm font-medium">{user.name}</p>}
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    {user.totpEnabled && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-success">
                            <Shield className="h-3 w-3" /> 2FA on
                        </p>
                    )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/panel/settings">
                        <Settings /> Settings
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={onLogout}
                    className="text-danger focus:bg-danger/10 focus:text-danger"
                >
                    <LogOut /> Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
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
    const section = activeNavName(pathname);

    return (
        <header
            className="lg:hidden sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-lg"
            style={{
                // The banner (when shown) already pushes content below
                // the status bar / Dynamic Island, so only the header
                // carries the top inset when there is no banner.
                paddingTop: showBanner ? undefined : 'env(safe-area-inset-top, 0px)',
                paddingLeft: 'env(safe-area-inset-left, 0px)',
                paddingRight: 'env(safe-area-inset-right, 0px)',
            }}
        >
            <div className="flex h-14 items-center gap-1 px-2">
                {isRootPage ? (
                    <Link href="/panel" className="flex items-center gap-2 rounded-md px-2 py-1.5">
                        <TerminalLogo width={24} height={24} className="rounded-md" />
                        <span className="text-[15px] font-semibold">Termi</span>
                    </Link>
                ) : (
                    <button
                        onClick={onBack}
                        className="flex h-10 items-center gap-0.5 rounded-md pl-1 pr-2.5 text-foreground transition-colors hover:bg-accent active:bg-accent"
                    >
                        <ChevronLeft className="h-5 w-5 shrink-0" />
                        <span className="text-sm font-medium">{section || 'Back'}</span>
                    </button>
                )}

                <div className="flex-1" />

                <button
                    onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
                    aria-label="Search"
                    className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <Search className="h-[18px] w-[18px]" />
                </button>
                <UserMenu user={user} onLogout={onLogout} />
            </div>
        </header>
    );
}

/**
 * Floating capsule, clear of every edge, rather than a bar docked flush to the
 * screen bottom. The caller omits it entirely on terminal views so those
 * screens get the full viewport.
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
    const item = (active: boolean) =>
        `relative flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors active:bg-accent ${
            active ? 'text-foreground' : 'text-muted-foreground'
        }`;

    return (
        <nav
            aria-label="Main"
            className={`lg:hidden fixed inset-x-0 z-40 flex justify-center transition-transform duration-200 ${
                keyboardOpen ? 'translate-y-[calc(100%+2rem)] pointer-events-none' : 'translate-y-0'
            }`}
            style={{
                bottom: 'max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.25rem))',
                paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
                paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
            }}
        >
            <div className="glass flex w-full max-w-md items-center gap-0.5 rounded-2xl p-1 shadow-xl">
                {navigation.map((nav) => {
                    const isActive = isNavItemActive(nav.href, pathname);
                    return (
                        <Link
                            key={nav.name}
                            href={nav.href}
                            aria-current={isActive ? 'page' : undefined}
                            className={item(isActive)}
                        >
                            <nav.icon
                                className={`h-5 w-5 shrink-0 ${isActive ? 'text-primary' : ''}`}
                            />
                            <span
                                className={`text-[11px] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}
                            >
                                {nav.name}
                            </span>
                            {/* Cursor mark under the active tab. */}
                            {isActive && (
                                <span
                                    aria-hidden
                                    className="absolute bottom-1 h-[3px] w-4 rounded-full bg-primary"
                                />
                            )}
                        </Link>
                    );
                })}

                {isElectron && (
                    <button onClick={onOpenLocalTerminal} className={item(localTerminalActive)}>
                        <Laptop className="h-5 w-5 shrink-0 text-local" />
                        <span
                            className={`text-[11px] leading-none ${localTerminalActive ? 'font-semibold' : 'font-medium'}`}
                        >
                            Local
                        </span>
                    </button>
                )}
            </div>
        </nav>
    );
}
