/**
 * Shared display formatters.
 *
 * These were previously copy-pasted into the dashboard, server details, groups,
 * sessions workspace and file manager. Keep new formatting helpers here so the
 * whole UI renders sizes and timestamps the same way.
 */

/**
 * Human-readable byte size, e.g. `1.5 GB`.
 *
 * @param zeroLabel rendered instead of `0 B` when the value is zero/missing —
 *   file listings and transfer queues show a dash for empty sizes.
 */
export function formatBytes(bytes: number, zeroLabel?: string): string {
    if (!bytes) return zeroLabel ?? `${bytes || 0} B`;
    if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

/** Coarse "time ago" label, falling back to `Never` for a missing date. */
export function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Absolute date for SFTP mtimes, which arrive as **seconds** since the epoch.
 * The year is omitted for dates in the current year to keep listings narrow.
 */
export function formatUnixDate(ts: number): string {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    const now = new Date();
    const month = d.toLocaleString('default', { month: 'short' });
    if (d.getFullYear() !== now.getFullYear()) return `${month} ${d.getDate()}, ${d.getFullYear()}`;
    return `${month} ${d.getDate()}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
