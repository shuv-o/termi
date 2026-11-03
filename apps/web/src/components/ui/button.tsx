import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default: 'bg-primary font-semibold text-primary-foreground hover:bg-primary/88',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/88',
                outline:
                    'border border-input bg-transparent text-foreground hover:border-muted-foreground/40 hover:bg-accent',
                secondary:
                    'border border-border bg-secondary text-secondary-foreground hover:bg-accent',
                ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
                link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-10 px-4 sm:h-9',
                sm: 'h-9 px-3 text-[13px] sm:h-8',
                lg: 'h-11 px-6 text-[15px] sm:h-10',
                icon: 'h-10 w-10 sm:h-9 sm:w-9',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
