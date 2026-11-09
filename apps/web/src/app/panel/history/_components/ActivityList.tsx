'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

interface Entry {
    id: string;
    action: string;
    resource: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    details: Record<string, string | boolean>;
}

/** Plain-language labels; anything else falls back to a humanised action name. */
const LABELS: Record<string, string> = {
    USER_LOGIN: 'Signed in',
    USER_LOGIN_FAILED: 'Failed sign-in attempt',
    USER_LOGOUT: 'Signed out',
    USER_REGISTER: 'Account created',
    USER_PASSWORD_CHANGED: 'Password changed',
    USER_PASSWORD_RESET_REQUESTED: 'Password reset requested',
    USER_PASSWORD_RESET: 'Password reset',
    USER_PASSWORD_LOGIN_TOGGLED: '"Passkey only" changed',
    USER_2FA_ENABLED: 'Two-factor authentication turned on',
    USER_2FA_DISABLED: 'Two-factor authentication turned off',
    USER_RECOVERY_CODE_USED: 'Recovery code used',
    USER_EMAIL_VERIFIED: 'Email verified',
    USER_OAUTH_LINKED: 'Google account linked',
    PASSKEY_REGISTERED: 'Passkey added',
    PASSKEY_REMOVED: 'Passkey removed',
    PASSKEY_USED: 'Signed in with a passkey',
    SERVER_CREDENTIAL_REVEALED: 'Server credential revealed',
    KEYCHAIN_REVEALED: 'Keychain secret revealed',
    SERVERS_EXPORTED: 'Servers exported',
    SERVER_HARDENED: 'Server secured',
    SERVER_HARDENING_FAILED: 'Server hardening failed',
    SERVER_HOST_KEY_TRUSTED: 'New server host key trusted',
    SERVER_HOST_KEY_MISMATCH: 'Server host key changed — connection refused',
};

const ALERT_ACTIONS = new Set([
    'USER_LOGIN_FAILED',
    'USER_2FA_DISABLED',
    'USER_RECOVERY_CODE_USED',
    'SERVERS_EXPORTED',
    'SERVER_HARDENING_FAILED',
    'SERVER_HOST_KEY_MISMATCH',
]);

const humanise = (action: string) =>
    action.charAt(0) + action.slice(1).toLowerCase().replace(/_/g, ' ');

/** "Chrome on macOS"-style summary of a user agent. */
export function device(ua: string | null): string {
    if (!ua) return '';
    const browser = /TermiDesktop/.test(ua)
        ? 'Termi desktop app'
        : /Edg\//.test(ua)
          ? 'Edge'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Firefox\//.test(ua)
              ? 'Firefox'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Browser';
    const os = /Windows/.test(ua)
        ? 'Windows'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Mac OS X/.test(ua)
            ? 'macOS'
            : /Android/.test(ua)
              ? 'Android'
              : /Linux/.test(ua)
                ? 'Linux'
                : '';
    return os ? `${browser} on ${os}` : browser;
}

export function ActivityList() {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [nextBefore, setNextBefore] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async (before?: string) => {
        const res = await fetch(
            `/api/account/activity${before ? `?before=${encodeURIComponent(before)}` : ''}`,
        );
        const data = await res.json();
        if (!data.success) return;
        setEntries((prev) => (before ? [...prev, ...data.data.entries] : data.data.entries));
        setNextBefore(data.data.nextBefore);
    }, []);

    useEffect(() => {
        load().finally(() => setLoading(false));
    }, [load]);

    return (
        <>
            <p className="mb-4 text-sm text-muted-foreground">
                Sign-ins and changes to your account&apos;s security. See something you don&apos;t
                recognise? Change your password, then sign out your other devices.
            </p>
            {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading activity…</span>
                </div>
            ) : entries.length === 0 ? (
                <EmptyState compact icon={History} title="Nothing recorded yet" />
            ) : (
                <ul className="divide-y divide-border/50 rounded-xl border border-border/50">
                    {entries.map((e) => {
                        const meta = [
                            device(e.userAgent),
                            e.ipAddress && e.ipAddress !== 'unknown' ? e.ipAddress : '',
                            typeof e.details.method === 'string' ? String(e.details.method) : '',
                        ]
                            .filter(Boolean)
                            .join(' · ');
                        return (
                            <li
                                key={e.id}
                                className="flex items-start justify-between gap-4 px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <p
                                        className={`text-sm font-medium ${ALERT_ACTIONS.has(e.action) ? 'text-warning' : ''}`}
                                    >
                                        {LABELS[e.action] ?? humanise(e.action)}
                                    </p>
                                    {meta && (
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {meta}
                                        </p>
                                    )}
                                </div>
                                <time
                                    dateTime={e.createdAt}
                                    className="shrink-0 text-xs text-muted-foreground"
                                >
                                    {new Date(e.createdAt).toLocaleString()}
                                </time>
                            </li>
                        );
                    })}
                </ul>
            )}

            {nextBefore && (
                <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    disabled={loadingMore}
                    onClick={async () => {
                        setLoadingMore(true);
                        await load(nextBefore).finally(() => setLoadingMore(false));
                    }}
                >
                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                    Show older
                </Button>
            )}
        </>
    );
}
