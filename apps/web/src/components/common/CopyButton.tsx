'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

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
            className={`p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors ${className ?? ''}`}
            title={`Copy ${text}`}
        >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
    );
}

export default CopyButton;
