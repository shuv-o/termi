'use client';

import { toneDot, tonePill, type Tone } from '@/lib/status-style';

export type ServerStatus = 'online' | 'offline' | 'unknown';

const TONE: Record<ServerStatus, Tone> = {
    online: 'success',
    offline: 'danger',
    unknown: 'neutral',
};

/**
 * The one server-reachability pill — dot + label — used by the dashboard
 * cards/rows and the server detail header, so "online"/"offline" always
 * looks like the same status system no matter which page renders it.
 *
 * Colours come from the shared tone scale (`lib/status-style`), which is what
 * keeps this pill, the session status dot and the toaster speaking the same
 * green/amber/red.
 */
export function ServerStatusPill({
    status,
    label,
    size = 'sm',
}: {
    status: ServerStatus;
    label: string;
    size?: 'sm' | 'md';
}) {
    const tone = TONE[status];
    const sizeClass =
        size === 'md' ? 'gap-1.5 px-2 py-0.5 text-xs' : 'gap-1 px-1.5 py-0.5 text-[10px]';
    const dotSizeClass = size === 'md' ? 'w-1.5 h-1.5' : 'w-1 h-1';

    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full border font-medium ${tonePill[tone]} ${sizeClass}`}
        >
            <span
                className={`shrink-0 rounded-full ${toneDot[tone]} ${dotSizeClass} ${status === 'online' ? 'animate-pulse' : ''}`}
            />
            {label}
        </span>
    );
}
