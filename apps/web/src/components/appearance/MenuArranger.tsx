'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { MOBILE_BAR_MAX, type MenuItemId } from '@/lib/appearance/prefs';
import { setAppearance, useAppearance } from '@/lib/appearance/store';
import { NAV_ITEMS } from '@/app/panel/_shell/navigation';

const NEEDS_NOTE = {
    'desktop-app': 'Shows in the desktop app only',
    'web-serial': 'Shows in Chrome, Edge and the desktop app',
} as const;

/**
 * Put the menu in your own order, hide what you don't use, and choose what
 * goes in the phone's bottom bar. Settings always stays in the menu (it's
 * where you'd change this back).
 */
export function MenuArranger() {
    const { menu } = useAppearance();
    const [said, setSaid] = useState('');
    const phoneFull = menu.mobile.length >= MOBILE_BAR_MAX;

    // When an item moves, the rows slide to their new places (rather than
    // swapping in a blink), so you can see where it went.
    const listRef = useRef<HTMLOListElement>(null);
    const before = useRef(new Map<string, number>());
    useLayoutEffect(() => {
        const rows = listRef.current?.querySelectorAll<HTMLElement>('li[data-id]') ?? [];
        const calm =
            document.documentElement.dataset.motion === 'reduced' ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const next = new Map<string, number>();
        rows.forEach((row) => {
            const top = row.getBoundingClientRect().top;
            next.set(row.dataset.id!, top);
            const was = before.current.get(row.dataset.id!);
            if (calm || was === undefined || was === top) return;
            row.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'none' }], {
                duration: 260,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            });
        });
        before.current = next;
    }, [menu.order]);

    // Arrived from "Arrange menu": bring this part into view.
    useEffect(() => {
        if (window.location.hash !== '#menu') return;
        const t = setTimeout(
            () => document.getElementById('menu')?.scrollIntoView({ block: 'start' }),
            100,
        );
        return () => clearTimeout(t);
    }, []);

    const move = (id: MenuItemId, by: -1 | 1) => {
        const order = [...menu.order];
        const from = order.indexOf(id);
        const to = from + by;
        if (to < 0 || to >= order.length) return;
        [order[from], order[to]] = [order[to], order[from]];
        setAppearance({ menu: { order } });
        setSaid(
            `${NAV_ITEMS[id].name} moved ${by < 0 ? 'up' : 'down'}, now ${to + 1} of ${order.length}.`,
        );
    };
    const toggleShown = (id: MenuItemId, shown: boolean) =>
        setAppearance({
            menu: {
                hidden: shown ? menu.hidden.filter((h) => h !== id) : [...menu.hidden, id],
            },
        });
    const togglePhone = (id: MenuItemId, on: boolean) =>
        setAppearance({
            menu: { mobile: on ? [...menu.mobile, id] : menu.mobile.filter((m) => m !== id) },
        });

    return (
        <div id="menu" className="scroll-mt-6">
            <h4 className="text-sm font-medium">Menu items</h4>
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
                Put the pages in the order you use them and switch off the ones you don&apos;t. Pick
                up to {MOBILE_BAR_MAX} for the bar at the bottom of your phone. Switched-off pages
                are still one search away (⌘K).
            </p>
            <div
                aria-hidden
                className="mt-3 flex justify-end gap-2 px-3 pb-1.5 text-[11px] text-muted-foreground"
            >
                <span className="w-14 text-center">Phone bar</span>
                <span className="w-9 text-center">Menu</span>
            </div>
            <ol
                ref={listRef}
                className="relative divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border"
            >
                {menu.order.map((id, i) => {
                    const item = NAV_ITEMS[id];
                    const shown = !menu.hidden.includes(id);
                    const onPhone = menu.mobile.includes(id);
                    const locked = id === 'settings';
                    return (
                        <li
                            key={id}
                            data-id={id}
                            className={`relative flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap ${shown ? '' : 'bg-muted/40'}`}
                        >
                            <div className="flex shrink-0 flex-col">
                                <button
                                    type="button"
                                    onClick={() => move(id, -1)}
                                    disabled={i === 0}
                                    aria-label={`Move ${item.name} up`}
                                    className="flex h-5 w-6 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => move(id, 1)}
                                    disabled={i === menu.order.length - 1}
                                    aria-label={`Move ${item.name} down`}
                                    className="flex h-5 w-6 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <item.icon
                                aria-hidden
                                className={`h-[18px] w-[18px] shrink-0 ${shown ? 'text-foreground' : 'text-muted-foreground'}`}
                            />
                            <div className="min-w-0 flex-1">
                                <p
                                    className={`text-sm font-medium ${shown ? '' : 'text-muted-foreground'}`}
                                >
                                    {item.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {item.description}
                                    {item.needs && (
                                        <span className="block text-muted-foreground/80">
                                            {NEEDS_NOTE[item.needs]}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <label
                                className={`flex w-14 shrink-0 items-center justify-center text-xs ${!onPhone && phoneFull ? 'opacity-40' : 'cursor-pointer'}`}
                                title={
                                    !onPhone && phoneFull
                                        ? `The phone bar holds ${MOBILE_BAR_MAX}; take one out first`
                                        : undefined
                                }
                            >
                                <input
                                    type="checkbox"
                                    checked={onPhone}
                                    disabled={!onPhone && phoneFull}
                                    onChange={(e) => togglePhone(id, e.target.checked)}
                                    aria-label={`Show ${item.name} in the phone bar`}
                                    className="h-4 w-4 accent-[var(--primary)]"
                                />
                            </label>
                            <Switch
                                checked={shown}
                                disabled={locked}
                                onCheckedChange={(v) => toggleShown(id, v)}
                                aria-label={
                                    locked
                                        ? 'Settings always stays in the menu'
                                        : `Show ${item.name} in the menu`
                                }
                            />
                        </li>
                    );
                })}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
                Phone bar: {menu.mobile.length} of {MOBILE_BAR_MAX}
            </p>
            <p aria-live="polite" className="sr-only">
                {said}
            </p>
        </div>
    );
}
