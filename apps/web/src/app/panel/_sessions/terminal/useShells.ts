'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '../sessions-context';
import { requestConnection } from '@/lib/gateway/connect';

export interface ShellTab {
    id: string; // React key, stable across re-renders
    sessionId: string; // unique gateway session — each shell gets its own
    token: string | null;
}

/** A token for another shell, on the same route (device or gateway) as its session. */
async function issueConnectionToken(session: Session): Promise<string | null> {
    try {
        const grant = await requestConnection(
            { serverId: session.serverId, protocol: 'ssh' },
            session.via === 'device' ? 'auto' : 'gateway',
        );
        return grant.token;
    } catch {
        return null;
    }
}

/**
 * Multi-shell state for one remote session.
 *
 * Shell 0 mirrors the session in `sessions-context` (its token, status and
 * WebSocket are tracked there); shells 1..n are local to this pane and fetch
 * their own connection tokens.
 */
export function useShells(session: Session, removeSession: (tabId: string) => void) {
    const [shells, setShells] = useState<ShellTab[]>([]);
    const [activeShellId, setActiveShellId] = useState('');
    const shellsInitialized = useRef(false);

    // Per-shell key-handlers and WS refs
    const keyHandlers = useRef(new Map<string, (key: string) => void>());
    const wsRefs = useRef(new Map<string, WebSocket>());

    // Initialize the first shell once the session token arrives
    useEffect(() => {
        if (shellsInitialized.current || !session.token || session.type !== 'remote') return;
        shellsInitialized.current = true;
        const shellId = crypto.randomUUID();
        setShells([{ id: shellId, sessionId: session.sessionId, token: session.token }]);
        setActiveShellId(shellId);
    }, [session.token, session.sessionId, session.type]);

    // Keep shell[0] token in sync with context (reconnect / renew updates it)
    useEffect(() => {
        setShells((prev) => {
            if (!prev[0]) return prev;
            return prev.map((s, i) => (i === 0 ? { ...s, token: session.token } : s));
        });
    }, [session.token]);

    /**
     * xterm needs a resize nudge once a hidden pane becomes visible. Memoized
     * because callers list it as an effect dependency — an unstable identity
     * would re-subscribe the Electron command listener on every render.
     */
    const nudgeResize = useCallback((delay = 50) => {
        setTimeout(() => window.dispatchEvent(new Event('resize')), delay);
    }, []);

    const activateShell = useCallback(
        (shellId: string) => {
            setActiveShellId(shellId);
            nudgeResize();
        },
        [nudgeResize],
    );

    const addShell = useCallback(async () => {
        const shellId = crypto.randomUUID();
        const sessionId = crypto.randomUUID();
        setShells((prev) => [...prev, { id: shellId, sessionId, token: null }]);
        setActiveShellId(shellId);
        nudgeResize();
        try {
            const token = await issueConnectionToken(session);
            setShells((prev) => prev.map((s) => (s.id === shellId ? { ...s, token } : s)));
        } catch {
            // token stays null → shows "Establishing connection…" loading state
        }
    }, [session, nudgeResize]);

    const closeShell = useCallback(
        (shellId: string) => {
            // Tell gateway to tear down this shell's session
            const ws = wsRefs.current.get(shellId);
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'close-session' }));
            }
            wsRefs.current.delete(shellId);
            keyHandlers.current.delete(shellId);

            setShells((prev) => {
                const remaining = prev.filter((s) => s.id !== shellId);
                if (remaining.length === 0) {
                    // Last shell closed → remove the whole session
                    removeSession(session.tabId);
                    return prev;
                }
                setActiveShellId((curr) =>
                    curr === shellId ? remaining[remaining.length - 1].id : curr,
                );
                return remaining;
            });
        },
        [removeSession, session.tabId],
    );

    /** Re-issues a token for a non-first shell, resetting its gateway session. */
    const refreshShellToken = useCallback(
        (shellId: string) => {
            const sessionId = crypto.randomUUID();
            setShells((prev) =>
                prev.map((s) => (s.id === shellId ? { ...s, sessionId, token: null } : s)),
            );
            issueConnectionToken(session)
                .then((token) => {
                    setShells((prev) => prev.map((s) => (s.id === shellId ? { ...s, token } : s)));
                })
                .catch(() => {});
        },
        [session],
    );

    // The session moved between this computer and the Termi server (device
    // fallback): the other shells need tokens for the new route too.
    const routeRef = useRef(session.via);
    useEffect(() => {
        if (routeRef.current === session.via) return;
        routeRef.current = session.via;
        for (const shell of shells.slice(1)) refreshShellToken(shell.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.via]);

    const activeShellIndex = shells.findIndex((s) => s.id === activeShellId);

    return {
        shells,
        activeShellId,
        setActiveShellId,
        activeShellIndex,
        activateShell,
        addShell,
        closeShell,
        refreshShellToken,
        keyHandlers,
        wsRefs,
        nudgeResize,
    };
}
