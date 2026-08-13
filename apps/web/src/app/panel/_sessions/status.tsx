'use client';

import type { SessionStatus } from '../sessions-context';

const DOT_CLASS: Record<SessionStatus, string> = {
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-emerald-400',
    disconnected: 'bg-slate-500',
    error: 'bg-red-400',
    detached: 'bg-amber-400 animate-pulse',
};

const LABELS: Record<SessionStatus, string> = {
    connecting: 'Connecting…',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Error',
    detached: 'Restoring…',
};

const COLORS: Record<SessionStatus, string> = {
    connecting: 'text-yellow-400',
    connected: 'text-emerald-400',
    disconnected: 'text-slate-400',
    error: 'text-red-400',
    detached: 'text-amber-400',
};

export function StatusDot({ status, size = 'sm' }: { status: SessionStatus; size?: 'sm' | 'md' }) {
    const dim = size === 'md' ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5';
    return <span className={`${dim} rounded-full shrink-0 ${DOT_CLASS[status]}`} />;
}

export function statusLabel(status: SessionStatus): string {
    return LABELS[status];
}

export function statusColor(status: SessionStatus): string {
    return COLORS[status];
}
