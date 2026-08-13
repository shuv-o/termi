'use client';

export type ServerStatus = 'online' | 'offline' | 'unknown';

/**
 * The one server-reachability pill — dot + label — used by the dashboard
 * cards/rows and the server detail header, so "online"/"offline" always
 * looks like the same status system no matter which page renders it.
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
    const pillClass =
        status === 'online'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : status === 'offline'
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : 'bg-secondary border-border text-muted-foreground';
    const dotClass =
        status === 'online'
            ? 'bg-emerald-400'
            : status === 'offline'
              ? 'bg-red-400'
              : 'bg-muted-foreground/50';
    const sizeClass =
        size === 'md' ? 'gap-1.5 px-2 py-0.5 text-xs' : 'gap-1 px-1.5 py-0.5 text-[10px]';
    const dotSizeClass = size === 'md' ? 'w-1.5 h-1.5' : 'w-1 h-1';

    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full border font-medium ${pillClass} ${sizeClass}`}
        >
            <span
                className={`shrink-0 rounded-full ${dotClass} ${dotSizeClass} ${status === 'online' ? 'animate-pulse' : ''}`}
            />
            {label}
        </span>
    );
}
