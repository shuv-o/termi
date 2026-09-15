import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The "nothing here yet" panel.
 *
 * The dashboard, keychain and groups screens each grew their own version of
 * this — same idea, but a 20px icon tile in one, a 16px one in another, an
 * `<h2>` here and an `<h3>` there, and different minimum heights so the page
 * visibly resized as you switched tabs. One component, one set of proportions.
 *
 * Heading level is `h2` by default because an empty state sits under the page
 * `h1`; pass `headingLevel` when it is nested deeper inside a section.
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    headingLevel: Heading = 'h2',
    compact = false,
    className,
}: {
    icon: LucideIcon;
    title: string;
    description?: React.ReactNode;
    /** Usually a single `<Button>`. */
    action?: React.ReactNode;
    headingLevel?: 'h2' | 'h3';
    /** Tighter version for empty states inside a sidebar or a section card. */
    compact?: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center px-6 text-center',
                compact ? 'gap-3 py-10' : 'min-h-[320px] gap-4 py-14',
                className,
            )}
        >
            <div
                className={cn(
                    'flex items-center justify-center rounded-2xl border border-border bg-secondary/30',
                    compact ? 'h-14 w-14' : 'h-20 w-20',
                )}
            >
                <Icon
                    className={cn('text-muted-foreground/35', compact ? 'h-7 w-7' : 'h-10 w-10')}
                />
            </div>
            <div className="max-w-md">
                <Heading className={compact ? 'text-base font-semibold' : 'text-xl font-semibold'}>
                    {title}
                </Heading>
                {description != null && (
                    <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            {action != null && <div className="mt-1">{action}</div>}
        </div>
    );
}

/** `EmptyState` on its own card — the usual form for a page-level empty list. */
export function EmptyStateCard(props: React.ComponentProps<typeof EmptyState>) {
    return (
        <Card className="border-border">
            <CardContent className="p-0">
                <EmptyState {...props} />
            </CardContent>
        </Card>
    );
}
