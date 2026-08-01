'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AddToast, AuthSession } from '../types';

/**
 * Signed-in devices for the account. The list is only fetched while the
 * Sessions panel is on screen, so `isActive` gates the load.
 */
export function useAuthSessions(isActive: boolean, addToast: AddToast) {
    const [sessions, setSessions] = useState<AuthSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [revokingAll, setRevokingAll] = useState(false);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/sessions');
            const data = await res.json();
            if (data.success) setSessions(data.data.sessions ?? []);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isActive) void reload();
    }, [isActive, reload]);

    const revoke = useCallback(
        async (id: string) => {
            try {
                const res = await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    setSessions((prev) => prev.filter((s) => s.id !== id));
                    addToast('success', 'Session revoked');
                } else addToast('error', data.error || 'Failed to revoke session');
            } catch {
                addToast('error', 'Failed to revoke session');
            }
        },
        [addToast],
    );

    const revokeAllOthers = useCallback(async () => {
        setRevokingAll(true);
        const others = sessions.filter((s) => !s.isCurrent);
        let count = 0;
        for (const s of others) {
            try {
                const res = await fetch(`/api/auth/sessions/${s.id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) count++;
            } catch {
                /* continue */
            }
        }
        setSessions((prev) => prev.filter((s) => s.isCurrent));
        addToast('success', `Revoked ${count} session${count !== 1 ? 's' : ''}`);
        setRevokingAll(false);
    }, [addToast, sessions]);

    return { sessions, loading, revokingAll, revoke, revokeAllOthers };
}
