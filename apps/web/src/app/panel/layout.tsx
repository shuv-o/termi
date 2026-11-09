'use client';

import dynamic from 'next/dynamic';
import { SessionsProvider } from './_sessions/sessions-context';
import SessionsWorkspace from './_sessions/SessionsWorkspace';
import { AppLock } from './_shell/AppLock';
import StarNudge from '@/components/common/StarNudge';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';

import { CommandPalette } from './_shell/CommandPalette';
import { DesktopSidebar } from './_shell/DesktopSidebar';
import { TopNav } from './_shell/TopNav';
import { mutateCache } from '@/lib/hooks/useCachedFetch';
import type { PanelUser } from '@/lib/navigation';
import { MobileBottomNav, MobileTopBar, VerifyEmailBanner } from './_shell/MobileChrome';
import { usePanelShell } from './_shell/usePanelShell';
import { useRouteFade } from './_shell/useRouteFade';

// Only new accounts ever see it, so it isn't part of every panel page's bundle.
const FirstRunSetup = dynamic(
    () => import('@/components/appearance/FirstRunSetup').then((m) => m.FirstRunSetup),
    { ssr: false },
);

function LayoutInner({ children }: { children: React.ReactNode }) {
    const shell = usePanelShell();
    const {
        user,
        pathname,
        collapsed,
        isSessionsPage,
        isLocalPage,
        isConnectPage,
        isAssistantPage,
    } = shell;
    const fading = useRouteFade(pathname);

    // Only block on the very first load, when nothing is cached yet. On every
    // later navigation `user` is already present, so the shell paints instantly.
    if (!user) {
        return (
            <div
                className="min-h-screen flex items-center justify-center bg-background text-2xl"
                role="status"
                aria-label="Loading"
            >
                <span className="cursor-block cursor-waiting" />
                {/* A locked session has no user until it's unlocked. */}
                <AppLock lockAfterMinutes={null} />
            </div>
        );
    }

    // Room for the menu: a sidebar or rail on either side, or a bar on top
    // (which also sets --shell-top for the full-height screens).
    const { navStyle, navSide } = shell;
    // Full class names only: Tailwind can't see names built at runtime.
    const contentPad =
        navStyle === 'topbar'
            ? 'lg:pt-12 lg:[--shell-top:3rem]'
            : navSide === 'right'
              ? collapsed
                  ? 'lg:pr-14'
                  : 'lg:pr-60'
              : collapsed
                ? 'lg:pl-14'
                : 'lg:pl-60';
    // First sign-in: set up the look and layout (not while joining someone's session).
    const showSetup = user.onboarded === false && !pathname.startsWith('/panel/join/');
    const finishSetup = () =>
        mutateCache<{ user: PanelUser }>('/api/auth/me', (prev) =>
            prev ? { user: { ...prev.user, onboarded: true } } : prev!,
        );

    // Email banner is the top-most element on mobile, so it (rather than the
    // sticky header) carries the safe-area inset when shown.
    const showBanner = !user.isVerified && !user.isGoogleUser;

    return (
        <div className="min-h-screen bg-background">
            <AppLock lockAfterMinutes={user.lockAfterMinutes ?? null} />
            {showSetup && <FirstRunSetup name={user.name} onDone={finishSetup} />}
            {navStyle === 'topbar' ? (
                <TopNav
                    user={user}
                    items={shell.desktopItems}
                    pathname={pathname}
                    isElectron={shell.isElectron}
                    onBack={shell.goBack}
                    onLogout={shell.logout}
                />
            ) : (
                <DesktopSidebar
                    user={user}
                    items={shell.desktopItems}
                    pathname={pathname}
                    collapsed={collapsed}
                    side={navSide}
                    onToggleCollapsed={shell.toggleCollapsed}
                    isElectron={shell.isElectron}
                    onBack={shell.goBack}
                    onLogout={shell.logout}
                />
            )}

            <div className={`${contentPad} transition-[padding] duration-200 ease-in-out`}>
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

                {isSessionsPage || isConnectPage || isAssistantPage ? (
                    /* Both render full-bleed, with no page chrome around them.
                       The sessions page in particular draws nothing itself —
                       the workspace above is the UI — but its component must
                       still mount, because it carries the `?add=<serverId>`
                       handler that every Connect button in the app routes
                       through. It was previously left unrendered here, which
                       made that deep link silently do nothing. */
                    <>{children}</>
                ) : (
                    <main
                        // No `key={pathname}` here deliberately: re-keying would
                        // unmount/remount the whole page subtree on every nav
                        // (a real blank frame), rather than just updating it.
                        // `useRouteFade` gets the same fade cue without that.
                        className={`transition-[opacity,transform] duration-150 ease-out ${
                            fading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
                        } ${isLocalPage ? 'px-4 py-5 sm:px-6 lg:px-10 lg:py-8' : 'px-4 pt-5 pb-32 sm:px-6 lg:px-10 lg:py-8'}`}
                    >
                        {children}
                    </main>
                )}
            </div>

            {/* Omitted on the terminal views (connect pages, sessions workspace,
                dedicated local terminal) — the terminal is the whole point of
                those screens, so it gets the full viewport with no nav bar
                reserving margin underneath it. */}
            {!isConnectPage && !isSessionsPage && !isLocalPage && !isAssistantPage && (
                <MobileBottomNav
                    items={shell.phoneItems}
                    pathname={pathname}
                    keyboardOpen={shell.keyboardOpen}
                />
            )}

            <StarNudge userCreatedAt={user.createdAt} serverCount={shell.serverCount} />
            <CommandPalette />
        </div>
    );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <ToastProvider>
            {/* One provider for the whole panel. `delayDuration` is short
                because these are icon buttons in a dense toolbar — the label is
                the only thing telling you what the glyph does, so waiting the
                Radix default of 700ms for it feels broken. */}
            <TooltipProvider delayDuration={250} skipDelayDuration={300}>
                <SessionsProvider>
                    <LayoutInner>{children}</LayoutInner>
                </SessionsProvider>
            </TooltipProvider>
        </ToastProvider>
    );
}
