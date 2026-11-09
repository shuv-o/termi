'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Inline copy-to-clipboard affordance that flips to a tick for 1.5s.
 * Stops propagation so it can sit inside clickable cards and rows.
 */
export function CopyButton({ text, className }: { text: string; className?: string }) {
    const [copied, setCopied] = useState(false);

    const copy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <button
            onClick={copy}
            className={`p-0.5 rounded-sm text-muted-foreground/50 hover:text-muted-foreground transition-colors ${className ?? ''}`}
            title={`Copy ${text}`}
        >
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
        </button>
    );
}

/**
 * A secondary button that copies `text`. Shows `label` ("Copy" by default)
 * and "Copied" for 1.5s after; with `iconOnly`, the label is only the
 * accessible name.
 */
export function CopyTextButton({
    text,
    label = 'Copy',
    iconOnly = false,
}: {
    text: string;
    label?: string;
    iconOnly?: boolean;
}) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            aria-label={iconOnly ? label : undefined}
            onClick={() =>
                navigator.clipboard
                    .writeText(text)
                    .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => {})
            }
        >
            {copied ? <Check className="text-success" /> : <Copy />}
            {!iconOnly && (copied ? 'Copied' : label)}
        </Button>
    );
}

export default CopyButton;
