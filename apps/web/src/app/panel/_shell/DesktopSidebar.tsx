'use client';

import Link from 'next/link';
import {
    ChevronLeft,
    Laptop,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Search,
    Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import TerminalLogo from '@/components/common/Logo';
import { OPEN_COMMAND_PALETTE_EVENT } from './CommandPalette';
import { isNavItemActive, navigation, type PanelUser } from './navigation';

function openCommandPalette() {
    window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

/** Hover label shown beside icons while the sidebar is collapsed. */
function CollapseTooltip({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <span className="group relative flex justify-center">
            {children}
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-[5px] border border-border bg-popover px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
                {label}
            </span>
        </span>
    );
}

/**
 * The active nav entry is marked with the logo's block cursor, parked in the
 * left gutter — the same mark that ends every page title.
 */
function ActiveMarker() {
    return (
        <span
            aria-hidden
            className="absolute -left-2 top-1/2 h-4 w-[5px] -translate-y-1/2 rounded-[1.5px] bg-primary"
        />
    );
}

const itemBase =
    'relative flex h-9 w-full items-center rounded-md text-sm font-medium transition-colors select-none';

function itemTone(active: boolean) {
    return active
        ? 'bg-accent text-foreground'
        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground';
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
    const button = (
        <button
            onClick={onClick}
            aria-label={collapsed ? 'Local terminal' : undefined}
            className={`${itemBase} ${itemTone(active)} ${collapsed ? 'justify-center' : 'gap-3 px-2.5'}`}
        >
            {active && <ActiveMarker />}
            <Laptop className="h-[18px] w-[18px] shrink-0 text-local" />
            {!collapsed && <span className="truncate">Local terminal</span>}
        </button>
    );

    return collapsed ? <CollapseTooltip label="Local terminal">{button}</CollapseTooltip> : button;
}

/** Plain initial on the raised surface — no gradient avatar. */
function Avatar({ user, size = 'md' }: { user: PanelUser; size?: 'sm' | 'md' }) {
    return (
        <div
            className={`flex shrink-0 items-center justify-center rounded-full border border-input bg-accent font-semibold text-foreground ${
                size === 'sm' ? 'h-7 w-7 text-xs' : 'h-8 w-8 text-[13px]'
            }`}
        >
            {(user.name || user.email)[0].toUpperCase()}
        </div>
    );
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
    if (collapsed) {
        return (
            <div className="flex shrink-0 flex-col items-center gap-2 border-t border-border p-2">
                <CollapseTooltip label={user.name || user.email}>
                    <Avatar user={user} />
                </CollapseTooltip>
                <CollapseTooltip label="Sign out">
                    <button
                        onClick={onLogout}
                        aria-label="Sign out"
                        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </CollapseTooltip>
            </div>
        );
    }

    return (
        <div className="shrink-0 border-t border-border p-3">
            <div className="flex items-center gap-2.5">
                <Avatar user={user} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium leading-tight">
                        {user.name || user.email}
                    </p>
                    {user.totpEnabled ? (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-success">
                            <Shield className="h-3 w-3" /> 2FA on
                        </span>
                    ) : (
                        user.name && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {user.email}
                            </p>
                        )
                    )}
                </div>
                <button
                    onClick={onLogout}
                    aria-label="Sign out"
                    title="Sign out"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                >
                    <LogOut className="h-4 w-4" />
                </button>
            </div>
            <a
                href="https://shuvoo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
                Made by Shuvo
            </a>
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
    const sidebarW = collapsed ? 'lg:w-14' : 'lg:w-60';

    return (
        <aside
            className={`fixed bottom-0 left-0 top-0 z-50 hidden flex-col border-r border-border bg-card lg:flex ${sidebarW} transition-[width] duration-200 ease-in-out`}
        >
            <div
                className={`flex h-14 shrink-0 items-center px-3 ${collapsed ? 'justify-center' : 'justify-between'}`}
            >
                {!collapsed && (
                    <Link href="/panel" className="flex min-w-0 items-center gap-2.5 rounded-md">
                        <TerminalLogo width={26} height={26} className="shrink-0 rounded-md" />
                        <span className="text-[15px] font-semibold tracking-[-0.01em]">Termi</span>
                    </Link>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                    {isElectron && !collapsed && (
                        <button
                            onClick={onBack}
                            title="Back (Cmd/Alt+←)"
                            aria-label="Back"
                            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    )}
                    <button
                        onClick={onToggleCollapsed}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        {collapsed ? (
                            <PanelLeftOpen className="h-4 w-4" />
                        ) : (
                            <PanelLeftClose className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>

            <div className={`flex flex-col gap-2 ${collapsed ? 'px-2' : 'px-3'}`}>
                {collapsed ? (
                    <>
                        <CollapseTooltip label="Search  ⌘K">
                            <button
                                onClick={openCommandPalette}
                                aria-label="Search"
                                className="flex h-9 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <Search className="h-4 w-4" />
                            </button>
                        </CollapseTooltip>
                        <CollapseTooltip label="Add server">
                            <Button asChild size="icon" className="h-9 w-full">
                                <Link href="/panel/servers/new" aria-label="Add server">
                                    <Plus />
                                </Link>
                            </Button>
                        </CollapseTooltip>
                    </>
                ) : (
                    <>
                        <button
                            onClick={openCommandPalette}
                            className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background/60 px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
                        >
                            <Search className="h-4 w-4 shrink-0" />
                            <span className="flex-1 text-left">Search or run…</span>
                            <kbd className="data shrink-0 rounded-[4px] border border-border px-1.5 py-px text-[11px]">
                                ⌘K
                            </kbd>
                        </button>
                        <Button asChild className="h-9 w-full">
                            <Link href="/panel/servers/new">
                                <Plus />
                                Add server
                            </Link>
                        </Button>
                    </>
                )}
            </div>

            <nav
                aria-label="Main"
                className={`flex flex-1 flex-col gap-0.5 overflow-y-auto pt-4 ${collapsed ? 'px-2' : 'px-3'}`}
            >
                {navigation.map((item) => {
                    const isActive = isNavItemActive(item.href, pathname);
                    const link = (
                        <Link
                            key={item.name}
                            href={item.href}
                            prefetch
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={collapsed ? item.name : undefined}
                            className={`${itemBase} ${itemTone(isActive)} ${collapsed ? 'justify-center' : 'gap-3 px-2.5'}`}
                        >
                            {isActive && <ActiveMarker />}
                            <item.icon
                                className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-primary' : ''}`}
                            />
                            {!collapsed && <span className="truncate">{item.name}</span>}
                        </Link>
                    );

                    return collapsed ? (
                        <CollapseTooltip key={item.name} label={item.name}>
                            {link}
                        </CollapseTooltip>
                    ) : (
                        link
                    );
                })}

                {isElectron && (
                    <div className="mt-3 border-t border-border pt-3">
                        <LocalTerminalButton
                            collapsed={collapsed}
                            active={localTerminalActive}
                            onClick={onOpenLocalTerminal}
                        />
                    </div>
                )}
            </nav>

            <SidebarFooter user={user} collapsed={collapsed} onLogout={onLogout} />
        </aside>
    );
}
