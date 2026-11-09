'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TerminalLogo from '@/components/common/Logo';
import { useActiveRect } from '@/lib/hooks/useActiveRect';
import { openSearch } from './DesktopSidebar';
import { UserMenu } from './MobileChrome';
import { isNavItemActive, type NavItem, type PanelUser } from '@/lib/navigation';

/** Height of the top bar; the page and the sessions workspace sit below it. */
export const TOP_NAV_H = 'lg:pt-12';

/**
 * The desktop menu as one bar across the top, leaving the full width for
 * terminals. Names show on wide screens; narrower ones keep the icons (with
 * the name as their accessible label and tooltip).
 */
export function TopNav({
    user,
    items,
    pathname,
    isElectron,
    onBack,
    onLogout,
}: {
    user: PanelUser;
    items: NavItem[];
    pathname: string;
    isElectron: boolean;
    onBack: () => void;
    onLogout: () => void;
}) {
    const navRef = useRef<HTMLElement>(null);
    // Names need room: with a long menu they show only on the widest screens,
    // and narrower ones keep the icons (named in the tooltip).
    const roomy = items.length <= 7;
    const labelShown = roomy ? 'hidden xl:inline' : 'hidden 2xl:inline';
    const labelHidden = roomy ? 'sr-only xl:hidden' : 'sr-only 2xl:hidden';
    // One underline for the bar: it slides to the page you open.
    const rect = useActiveRect(navRef, '[aria-current="page"]', `${pathname}|${items.length}`);
    return (
        <header className="fixed inset-x-0 top-0 z-50 hidden h-12 items-center gap-1 border-b border-border bg-card px-3 lg:flex">
            {isElectron && (
                <button
                    onClick={onBack}
                    title="Back (Cmd/Alt+←)"
                    aria-label="Back"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
            )}
            <Link href="/panel" className="mr-3 flex shrink-0 items-center gap-2 rounded-md">
                <TerminalLogo width={22} height={22} className="rounded-[5px]" />
                <span className="text-[14px] font-semibold tracking-[-0.01em]">Termi</span>
            </Link>

            <nav
                ref={navRef}
                aria-label="Main"
                className="relative flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
            >
                {rect && (
                    <span
                        aria-hidden
                        className={`pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-primary ${rect.moved ? 'termi-glide' : ''}`}
                        style={{ left: rect.left + 6, width: rect.width - 12 }}
                    />
                )}
                {items.map((item) => {
                    const active = isNavItemActive(item.href, pathname);
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            prefetch
                            title={item.name}
                            aria-current={active ? 'page' : undefined}
                            className={`relative flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors ${
                                active
                                    ? 'bg-accent text-foreground'
                                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                            }`}
                        >
                            <item.icon
                                className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : item.id === 'local' ? 'text-local' : ''}`}
                            />
                            <span className={labelShown}>{item.name}</span>
                            <span className={labelHidden}>{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            <button
                onClick={openSearch}
                className="flex h-8 w-56 shrink-0 items-center gap-2 rounded-md border border-input bg-background/60 px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
            >
                <Search className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Search or run…</span>
                <kbd className="data shrink-0 rounded-[4px] border border-border px-1.5 py-px text-[11px]">
                    ⌘K
                </kbd>
            </button>
            <Button asChild size="sm" className="ml-1 h-8 shrink-0">
                <Link href="/panel/servers/new">
                    <Plus />
                    Add server
                </Link>
            </Button>
            <UserMenu user={user} onLogout={onLogout} />
        </header>
    );
}
