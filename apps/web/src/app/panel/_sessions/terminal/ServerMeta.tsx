'use client';

import { useCallback, useState } from 'react';

import { Check, Copy } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

/** What the session pane knows about the box it is connected to. */
export interface SessionServerMeta {
    id: string;
    host?: string;
    username?: string;
    port?: number;
    hasPassword?: boolean;
}

/** Builds the `ssh user@host -p port` line, omitting the default port. */
export function sshCommand(meta: SessionServerMeta | null): string | null {
    if (!meta?.host) return null;
    const target = meta.username ? `${meta.username}@${meta.host}` : meta.host;
    return meta.port && meta.port !== 22 ? `ssh ${target} -p ${meta.port}` : `ssh ${target}`;
}

/**
 * Copy-to-clipboard that reports through the app toaster.
 *
 * `navigator.clipboard` rejects on a non-secure origin and when the page has
 * lost focus, and a silent failure here is the worst outcome — you paste the
 * previous clipboard contents into a terminal without noticing.
 */
export function useCopyToClipboard() {
    const { toast } = useToast();

    return useCallback(
        async (label: string, value: string | null | undefined) => {
            if (!value) {
                toast('error', `No ${label.toLowerCase()} stored for this server`);
                return;
            }
            try {
                await navigator.clipboard.writeText(value);
                toast('success', `${label} copied`);
            } catch {
                toast('error', 'Clipboard is not available in this browser');
            }
        },
        [toast],
    );
}

/**
 * Host address shown inline in the session header, click-to-copy.
 *
 * Worth the space: the thing people reach for mid-session is the box's
 * address — to paste into a ticket, an `scp` on their laptop, or a DNS check —
 * and until now the only place it appeared was the server detail page, two
 * navigations away from the terminal already in front of them.
 */
export function HostChip({ host, port }: { host: string; port?: number }) {
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(host);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast('error', 'Clipboard is not available in this browser');
        }
    };

    return (
        <button
            type="button"
            onClick={copy}
            title={`Copy ${host}`}
            aria-label={`Copy address ${host}`}
            className="hidden items-center gap-1.5 rounded-md border border-border/60 bg-secondary/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground md:inline-flex"
        >
            <span className="max-w-[16ch] truncate lg:max-w-[28ch]">{host}</span>
            {port != null && port !== 22 && <span className="opacity-60">:{port}</span>}
            {copied ? (
                <Check className="h-3 w-3 shrink-0 text-success" />
            ) : (
                <Copy className="h-3 w-3 shrink-0 opacity-50" />
            )}
        </button>
    );
}
