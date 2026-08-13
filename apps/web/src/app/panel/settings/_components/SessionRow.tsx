'use client';

import { useState } from 'react';
import { Activity, Laptop2, Loader2, LogOut, MonitorSmartphone, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AuthSession } from '../types';

/** Best-effort browser/OS labels from a stored user-agent string. */
function describeDevice(ua: string) {
    const isPhone = /mobile|android|iphone/i.test(ua);
    const isTablet = /ipad|tablet/i.test(ua);
    const Icon = isPhone ? Smartphone : isTablet ? MonitorSmartphone : Laptop2;

    const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
    const browser = browserMatch ? browserMatch[1] : 'Browser';

    const osRaw = ua.match(/\(([^)]+)\)/)?.[1] ?? '';
    const os = osRaw.includes('Windows')
        ? 'Windows'
        : osRaw.includes('Mac')
          ? 'macOS'
          : osRaw.includes('Linux')
            ? 'Linux'
            : osRaw.includes('Android')
              ? 'Android'
              : osRaw.includes('iPhone') || osRaw.includes('iPad')
                ? 'iOS'
                : 'Unknown OS';

    return { Icon, browser, os };
}

/**
 * Sessions use their own "active N ago" bucketing rather than the shared
 * `formatRelativeTime`: the cutoff for "Just now" is 2 minutes, not 1.
 */
function activeAgo(lastActiveAt: string): string {
    const diffMins = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    if (diffMins < 2) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}

export function SessionRow({
    session,
    onRevoke,
}: {
    session: AuthSession;
    onRevoke: (id: string) => void;
}) {
    const [revoking, setRevoking] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    async function handleRevoke() {
        setRevoking(true);
        await onRevoke(session.id);
        setRevoking(false);
        setConfirmed(false);
    }

    const { Icon: DeviceIcon, browser, os } = describeDevice(session.deviceInfo || '');
    const timeAgo = activeAgo(session.lastActiveAt);

    return (
        <div
            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                session.isCurrent
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-secondary/30 border-border/50 group'
            }`}
        >
            <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    session.isCurrent ? 'bg-primary/20' : 'bg-secondary'
                }`}
            >
                <DeviceIcon
                    className={`w-4 h-4 ${session.isCurrent ? 'text-primary' : 'text-muted-foreground'}`}
                />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                        {browser} on {os}
                    </p>
                    {session.isCurrent && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-medium shrink-0">
                            <Activity className="w-2.5 h-2.5" /> Current
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {session.ipAddress} · Active {timeAgo}
                </p>
            </div>
            {!session.isCurrent &&
                (confirmed ? (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-xs text-destructive">Sign out?</span>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setConfirmed(false)}
                                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                            >
                                Cancel
                            </button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleRevoke}
                                disabled={revoking}
                                className="h-7 text-xs px-2"
                            >
                                {revoking ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    'Sign out'
                                )}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setConfirmed(true)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100"
                        title="Revoke this session"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                    </button>
                ))}
        </div>
    );
}
