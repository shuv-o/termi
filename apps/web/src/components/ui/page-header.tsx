import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The standard top-of-page block: title, one line of context, and the page's
 * primary actions on the right.
 *
 * Every panel page had hand-rolled this with slightly different type sizes and
 * margins, so the title jumped a pixel or two as you moved between Servers,
 * Keychain, Groups and Settings. Rendering it from one place keeps that row
 * fixed, and gives new pages a header for free.
 */
export function PageHeader({
    title,
    description,
    actions,
    className,
}: {
    title: React.ReactNode;
    /** One short line under the title — a count, or what the page is for. */
    description?: React.ReactNode;
    /** Buttons for the right-hand side. Wrapped in a `shrink-0` flex row. */
    actions?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('flex items-start justify-between gap-4', className)}>
            <div className="min-w-0">
                <h1 className="truncate text-xl font-bold sm:text-2xl">{title}</h1>
                {description != null && (
                    <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
                )}
            </div>
            {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}

/**
 * Standard width for a panel page's content column. Wide, data-dense pages
 * (server grid, keychain list, settings) all share it so their left edges line
 * up as you navigate between them.
 */
export const PAGE_CONTENT_WIDTH = 'mx-auto w-full max-w-screen-2xl';
