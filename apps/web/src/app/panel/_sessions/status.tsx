'use client';

import { toneDot, toneText, type Tone } from '@/lib/status-style';
import type { SessionStatus } from '../sessions-context';

/**
 * Session lifecycle mapped onto the shared tone scale. Previously "connecting"
 * was yellow and "detached" amber — two near-identical colours for two states a
 * user cannot tell apart anyway — while "disconnected" used a raw slate that
 * matched nothing else. Both transient states are now the one warning tone, and
 * "disconnected" is the neutral muted foreground used for every other
 * inactive/unknown state in the app.
 */
const TONE: Record<SessionStatus, Tone> = {
    connecting: 'warning',
    connected: 'success',
    disconnected: 'neutral',
    error: 'danger',
    detached: 'warning',
};

/** Transient states pulse; settled ones sit still. */
const PULSING: Record<SessionStatus, boolean> = {
    connecting: true,
    connected: false,
    disconnected: false,
    error: false,
    detached: true,
};

const LABELS: Record<SessionStatus, string> = {
    connecting: 'Connecting…',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Error',
    detached: 'Restoring…',
};

export function StatusDot({ status, size = 'sm' }: { status: SessionStatus; size?: 'sm' | 'md' }) {
    const dim = size === 'md' ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5';
    return (
        <span
            className={`${dim} rounded-full shrink-0 ${toneDot[TONE[status]]} ${
                PULSING[status] ? 'animate-pulse' : ''
            }`}
        />
    );
}

export function statusLabel(status: SessionStatus): string {
    return LABELS[status];
}

export function statusColor(status: SessionStatus): string {
    return toneText[TONE[status]];
}
