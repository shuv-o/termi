'use client';

import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'size'> {
    /** Tooltip text, and the button's accessible name. Always required. */
    label: string;
    icon: LucideIcon;
    /** Renders the pressed/on state for a toggle. */
    active?: boolean;
    /** Extra classes for the glyph — e.g. a tone colour on a recording dot. */
    iconClassName?: string;
    size?: 'sm' | 'default';
    side?: 'top' | 'bottom' | 'left' | 'right';
    /** Trailing detail in the tooltip — a shortcut, a caveat, the value copied. */
    hint?: string;
    /** Render as a link instead of a button, keeping middle-click and open-in-new-tab. */
    href?: string;
}

/**
 * An icon-only button that always carries a real tooltip and an accessible
 * name.
 *
 * Icon buttons were previously labelled with the native `title` attribute,
 * which waits about a second, renders in the OS's own style rather than the
 * app's, and is skipped by some screen readers. Routing them through one
 * component means a toolbar icon can never ship unlabelled: `label` is required
 * and feeds both the tooltip and `aria-label`.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    (
        {
            label,
            icon: Icon,
            active = false,
            iconClassName,
            className,
            variant,
            size = 'default',
            side = 'bottom',
            hint,
            href,
            ...props
        },
        ref,
    ) => {
        const glyph = <Icon className={cn('h-3.5 w-3.5', iconClassName)} />;
        const shared = {
            ref,
            variant: variant ?? (active ? ('default' as const) : ('ghost' as const)),
            size: 'icon' as const,
            'aria-label': label,
            className: cn(size === 'sm' ? 'h-7 w-7' : 'h-8 w-8', className),
        };

        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    {href ? (
                        <Button {...shared} asChild {...props}>
                            <Link href={href}>{glyph}</Link>
                        </Button>
                    ) : (
                        <Button {...shared} aria-pressed={variant ? undefined : active} {...props}>
                            {glyph}
                        </Button>
                    )}
                </TooltipTrigger>
                <TooltipContent side={side}>
                    {label}
                    {hint && <span className="ml-1.5 font-normal opacity-60">{hint}</span>}
                </TooltipContent>
            </Tooltip>
        );
    },
);
IconButton.displayName = 'IconButton';

/** Hairline divider between groups of icon buttons in a toolbar. */
export function IconButtonDivider({ className }: { className?: string }) {
    return <span aria-hidden className={cn('mx-0.5 h-5 w-px shrink-0 bg-border', className)} />;
}
