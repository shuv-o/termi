'use client';

import { SessionsProvider } from './sessions-context';
import SessionsWorkspace from './sessions-workspace';
import StarNudge from '@/components/common/StarNudge';

import { DesktopSidebar } from './_shell/DesktopSidebar';
import { MobileBottomNav, MobileTopBar, VerifyEmailBanner } from './_shell/MobileChrome';
import { usePanelShell } from './_shell/usePanelShell';

function LayoutInner({ children }: { children: React.ReactNode }) {
    const shell = usePanelShell();
    const { user, pathname, collapsed, isSessionsPage, isLocalPage, isConnectPage } = shell;

    // Only block on the very first load, when nothing is cached yet. On every
    // later navigation `user` is already present, so the shell paints instantly.
    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const contentPl = collapsed ? 'lg:pl-14' : 'lg:pl-64 2xl:pl-72';

    // Email banner is the top-most element on mobile, so it (rather than the
    // sticky header) carries the safe-area inset when shown.
    const showBanner = !user.isVerified && !user.isGoogleUser;

    return (
        <div className="min-h-screen bg-background">
            <DesktopSidebar
                user={user}
                pathname={pathname}
                collapsed={collapsed}
                onToggleCollapsed={shell.toggleCollapsed}
                isElectron={shell.isElectron}
                localTerminalActive={isLocalPage}
                onOpenLocalTerminal={shell.openLocalTerminal}
                onBack={shell.goBack}
                onLogout={shell.logout}
            />

            <div className={`${contentPl} transition-[padding] duration-200 ease-in-out`}>
                {showBanner && (
                    <VerifyEmailBanner
                        resending={shell.verification.resending}
                        sent={shell.verification.sent}
                        onResend={shell.verification.resend}
                    />
                )}

                <MobileTopBar
                    user={user}
                    pathname={pathname}
                    isRootPage={shell.isRootPage}
                    showBanner={showBanner}
                    onBack={shell.goBack}
                    onLogout={shell.logout}
                />

                {/* The sessions workspace stays mounted and is merely hidden, so
                    its live terminals survive navigating away and back. */}
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

            {/* Omitted on the terminal views (connect pages, sessions workspace,
                dedicated local terminal) — the terminal is the whole point of
                those screens, so it gets the full viewport with no nav bar
                reserving margin underneath it. */}
            {!isConnectPage && !isSessionsPage && !isLocalPage && (
                <MobileBottomNav
                    pathname={pathname}
                    keyboardOpen={shell.keyboardOpen}
                    isElectron={shell.isElectron}
                    localTerminalActive={isLocalPage}
                    onOpenLocalTerminal={shell.openLocalTerminal}
                />
            )}

            <StarNudge userCreatedAt={user.createdAt} serverCount={shell.serverCount} />
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
