'use client';

import Link from 'next/link';
import {
    ChevronLeft,
    Laptop,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TerminalLogo from '@/components/common/Logo';
import { isNavItemActive, navigation, type PanelUser } from './navigation';

/** Hover label shown beside icons while the sidebar is collapsed. */
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

/** Left accent bar marking the active nav entry. */
function ActiveMarker() {
    return <span className="absolute left-0 h-4 w-0.5 rounded-full bg-primary" />;
}

function LocalTerminalButton({
    collapsed,
    active,
    onClick,
}: {
    collapsed: boolean;
    active: boolean;
    onClick: () => void;
}) {
    const tone = active
        ? 'bg-primary/15 text-primary'
        : 'text-violet-400 hover:bg-accent hover:text-violet-300';

    const button = (
        <button
            onClick={onClick}
            title={collapsed ? 'Local Terminal' : undefined}
            className={`relative flex items-center rounded-xl text-sm font-medium transition-colors select-none w-full ${tone} ${
                collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5'
            }`}
        >
            {active && <ActiveMarker />}
            <Laptop className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="truncate">Local Terminal</span>}
        </button>
    );

    return collapsed ? <CollapseTooltip label="Local Terminal">{button}</CollapseTooltip> : button;
}

function SidebarFooter({
    user,
    collapsed,
    onLogout,
}: {
    user: PanelUser;
    collapsed: boolean;
    onLogout: () => void;
}) {
    const initial = (user.name || user.email)[0].toUpperCase();

    return (
        <div
            className={`p-3 border-t border-border shrink-0 ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}
        >
            {collapsed ? (
                <>
                    <CollapseTooltip label={user.name || user.email}>
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-sm cursor-default shadow-sm">
                            {initial}
                        </div>
                    </CollapseTooltip>
                    <CollapseTooltip label="Sign Out">
                        <button
                            onClick={onLogout}
                            className="flex items-center justify-center w-9 h-9 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </CollapseTooltip>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-sm shrink-0 shadow-sm">
                            {initial}
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
                            onClick={onLogout}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-300"
                            title="Sign Out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
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
                </>
            )}
        </div>
    );
}

export function DesktopSidebar({
    user,
    pathname,
    collapsed,
    onToggleCollapsed,
    isElectron,
    localTerminalActive,
    onOpenLocalTerminal,
    onBack,
    onLogout,
}: {
    user: PanelUser;
    pathname: string;
    collapsed: boolean;
    onToggleCollapsed: () => void;
    isElectron: boolean;
    localTerminalActive: boolean;
    onOpenLocalTerminal: () => void;
    onBack: () => void;
    onLogout: () => void;
}) {
    const sidebarW = collapsed ? 'lg:w-14' : 'lg:w-64 2xl:w-72';

    return (
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
                            onClick={onBack}
                            title="Back (Cmd/Alt+←)"
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={onToggleCollapsed}
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

            {/* Add Server — the expanded button collapses to zero height rather
                than unmounting, so the transition stays smooth. */}
            <div
                className={`px-3 pt-3 overflow-hidden transition-all duration-200 ${collapsed ? 'max-h-0 opacity-0 pt-0' : 'max-h-16 opacity-100'}`}
            >
                <Button asChild className="w-full h-10 rounded-xl" tabIndex={collapsed ? -1 : 0}>
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

            <nav className="flex-1 px-2 pt-3 space-y-1">
                {isElectron && (
                    <LocalTerminalButton
                        collapsed={collapsed}
                        active={localTerminalActive}
                        onClick={onOpenLocalTerminal}
                    />
                )}

                {navigation.map((item) => {
                    const isActive = isNavItemActive(item.href, pathname);
                    const cls = `relative flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-colors select-none ${
                        isActive
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    } ${collapsed ? 'justify-center px-0 w-full' : 'px-3'}`;

                    const link = (
                        <Link
                            key={item.name}
                            href={item.href}
                            prefetch
                            className={cls}
                            title={collapsed ? item.name : undefined}
                        >
                            {isActive && <ActiveMarker />}
                            <item.icon className="w-5 h-5 shrink-0" />
                            {!collapsed && <span className="truncate">{item.name}</span>}
                        </Link>
                    );

                    // Expanded items sit directly in the nav so `space-y-1`
                    // spaces them; collapsed ones need the tooltip wrapper.
                    return collapsed ? (
                        <CollapseTooltip key={item.name} label={item.name}>
                            {link}
                        </CollapseTooltip>
                    ) : (
                        link
                    );
                })}
            </nav>

            <SidebarFooter user={user} collapsed={collapsed} onLogout={onLogout} />
        </aside>
    );
}
