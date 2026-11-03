import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The standard top-of-page block: title, one line of context, and the page's
 * primary actions on the right.
 *
 * Every panel page renders its header from here so the title row sits at the
 * same height and size everywhere. The title ends in Termi's block cursor —
 * the one recurring brand mark — which blinks twice when the page appears and
 * then holds still.
 *
 * On phones the actions drop under the title instead of squeezing it, so a
 * long server name never truncates to three letters next to two buttons.
 */
export function PageHeader({
    title,
    description,
    actions,
    cursor = true,
    className,
}: {
    title: React.ReactNode;
    /** One short line under the title — a count, or what the page is for. */
    description?: React.ReactNode;
    /** Buttons for the right-hand side (below the title on phones). */
    actions?: React.ReactNode;
    /** The trailing block cursor. Off for headers nested inside a page. */
    cursor?: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6',
                className,
            )}
        >
            <div className="min-w-0">
                <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.015em] sm:text-2xl">
                    {title}
                    {cursor && <span aria-hidden className="cursor-block" />}
                </h1>
                {description != null && (
                    <p className="mt-1 text-[13px] text-muted-foreground sm:text-sm">
                        {description}
                    </p>
                )}
            </div>
            {actions != null && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            )}
        </div>
    );
}

/**
 * Standard width for a panel page's content column. Wide, data-dense pages
 * (server grid, keychain list, settings) all share it so their left edges line
 * up as you navigate between them.
 */
export const PAGE_CONTENT_WIDTH = 'mx-auto w-full max-w-screen-2xl';
