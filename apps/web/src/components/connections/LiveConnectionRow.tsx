'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Monitor, Power, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    connectionLabel,
    connectionState,
    connectionTitle,
    openAction,
    type LiveConnectionItem,
} from '@/lib/connections/describe';
import { formatRelativeTime } from '@/lib/format';
import { describeUserAgent } from '@/lib/user-agent';

const STATE_BADGE = {
    'in-use': { label: 'In use', tone: 'bg-success/12 text-success' },
    background: { label: 'Running in the background', tone: 'bg-warning/15 text-warning' },
    closing: { label: 'Closing…', tone: 'bg-muted text-muted-foreground' },
} as const;

/** "From this browser", "From Firefox on Windows, 203.0.113.9, on “Laptop” (desktop app)". */
export function originText(c: LiveConnectionItem): string {
    const where =
        c.via === 'device'
            ? `on ${c.deviceName ? `“${c.deviceName}”` : 'your computer'} (desktop app)`
            : '';
    const who = c.origin.current
        ? 'this browser'
        : [
              describeUserAgent(c.origin.userAgent),
              c.origin.ipAddress && c.origin.ipAddress !== 'unknown' ? c.origin.ipAddress : '',
          ]
              .filter(Boolean)
              .join(', ') || 'another sign-in';
    return `From ${who}${where ? `, ${where}` : ''}`;
}

/**
 * One open connection with Open / Close. `showServer` is off on a server's
 * own page, where the server name would repeat on every row.
 */
export function LiveConnectionRow({
    connection: c,
    busy,
    onClose,
    showServer = true,
}: {
    connection: LiveConnectionItem;
    busy: boolean;
    onClose: (id: string) => void;
    showServer?: boolean;
}) {
    const [confirming, setConfirming] = useState(false);
    const badge = STATE_BADGE[connectionState(c)];
    const action = openAction(c);
    const title = showServer ? connectionTitle(c) : connectionLabel(c);

    return (
        <li
            className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
                c.closing ? 'opacity-60' : ''
            }`}
        >
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                    {showServer && c.serverId && c.kind !== 'guest' ? (
                        <Link
                            href={`/panel/servers/${c.serverId}`}
                            className="truncate text-sm font-medium hover:underline"
                        >
                            {title}
                        </Link>
                    ) : (
                        <span className="truncate text-sm font-medium">{title}</span>
                    )}
                    {showServer && (
                        <span className="text-xs text-muted-foreground">{connectionLabel(c)}</span>
                    )}
                    <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.tone}`}
                    >
                        {badge.label}
                    </span>
                    {c.guests > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {c.guests} joined
                        </span>
                    )}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                    Opened {formatRelativeTime(c.startedAt).toLowerCase()}
                    {' · '}active {formatRelativeTime(c.lastActivityAt).toLowerCase()}
                    {' · '}
                    {originText(c)}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 self-start sm:self-auto">
                {confirming ? (
                    <>
                        <span className="mr-1 text-xs text-muted-foreground">
                            {c.kind === 'session'
                                ? 'Ends the shell and what runs in it.'
                                : 'Disconnect?'}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                            Keep
                        </Button>
                        <Button
                            size="sm"
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={busy}
                            onClick={() => {
                                setConfirming(false);
                                onClose(c.id);
                            }}
                        >
                            Close
                        </Button>
                    </>
                ) : (
                    <>
                        {action && (
                            <Button asChild size="sm" variant="ghost">
                                <Link href={action.href}>
                                    <Monitor /> {action.label}
                                </Link>
                            </Button>
                        )}
                        {!c.closing && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger hover:text-danger"
                                onClick={() => setConfirming(true)}
                                aria-label={`Close ${connectionTitle(c)} ${connectionLabel(c)}`}
                            >
                                <Power /> Close
                            </Button>
                        )}
                        {c.closing && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                    </>
                )}
            </div>
        </li>
    );
}
