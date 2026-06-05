'use client';

import {
    createContext, useContext, useState, useCallback, useId, useEffect, useRef, type ReactNode,
} from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'detached';

export interface Session {
    tabId: string;
    sessionId: string;        // stable UUID, persists across devices via DB
    type: 'remote' | 'local';
    serverId: string;
    serverName: string;
    token: string | null;
    gatewayUrl: string | null;
    status: SessionStatus;
    showFiles: boolean;
    errorMessage?: string | null;
}

interface SessionsContextValue {
    sessions: Session[];
    activeTabId: string | null;
    setActiveTabId: (tabId: string) => void;
    addSession: (serverId: string, serverName?: string) => Promise<void>;
    addLocalSession: () => void;
    removeSession: (tabId: string) => void;
    reconnectSession: (tabId: string, serverId: string) => Promise<void>;
    renewSession: (tabId: string, serverId: string) => Promise<void>;
    toggleFiles: (tabId: string) => void;
    updateSessionStatus: (tabId: string, status: SessionStatus) => void;
    setSessionError: (tabId: string, error: string | null) => void;
    setSessionWs: (tabId: string, ws: WebSocket | null) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function useSessionsContext() {
    const ctx = useContext(SessionsContext);
    if (!ctx) throw new Error('useSessionsContext must be inside SessionsProvider');
    return ctx;
}

// ============================================================================
// DB HELPERS
// ============================================================================

async function dbRegisterSession(sessionId: string, serverId: string, serverName: string) {
    try {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, serverId, serverName }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error('[sessions] Failed to save session to DB:', res.status, text);
        }
    } catch (err) {
        console.error('[sessions] Network error saving session:', err);
    }
}

async function dbDeleteSession(sessionId: string) {
    try {
        const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
        if (!res.ok) console.error('[sessions] Failed to delete session from DB:', res.status);
    } catch (err) {
        console.error('[sessions] Network error deleting session:', err);
    }
}

async function dbRenewSession(oldSessionId: string, newSessionId: string) {
    try {
        const res = await fetch(`/api/sessions/${oldSessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newSessionId }),
        });
        if (!res.ok) console.error('[sessions] Failed to update session in DB:', res.status);
    } catch (err) {
        console.error('[sessions] Network error updating session:', err);
    }
}

// ============================================================================
// PROVIDER
// ============================================================================

type SessionsProvider_AddSession = (serverId: string, serverName?: string) => Promise<void>;
type SessionsProvider_AddLocalSession = () => void;

export function SessionsProvider({ children }: { children: ReactNode }) {
    const uid = useId();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    // Map of tabId → active WebSocket, used to send close-session before removing
    const wsRefs = useRef(new Map<string, WebSocket>());
    // Always-current snapshot of sessions (avoids stale closure reads)
    const sessionsRef = useRef<Session[]>([]);
    useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

    // ── Helpers ──

    const updateSessionStatus = useCallback((tabId: string, status: SessionStatus) => {
        setSessions(prev => prev.map(s => s.tabId === tabId ? { ...s, status } : s));
    }, []);

    const setSessionError = useCallback((tabId: string, error: string | null) => {
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, errorMessage: error, status: 'error' } : s
        ));
    }, []);

    const setSessionWs = useCallback((tabId: string, ws: WebSocket | null) => {
        if (ws) {
            wsRefs.current.set(tabId, ws);
        } else {
            wsRefs.current.delete(tabId);
        }
    }, []);

    // ── Fetch token helper ──

    async function fetchToken(serverId: string): Promise<{ token: string; gatewayUrl: string | null } | null> {
        try {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'ssh' }),
            });
            const data = await res.json();
            return data.success ? { token: data.data.token, gatewayUrl: data.data.gatewayUrl ?? null } : null;
        } catch {
            return null;
        }
    }

    // ── Session management ──

    const addLocalSession: SessionsProvider_AddLocalSession = useCallback(() => {
        const tabId = `${uid}-local-${Date.now()}`;
        const isElectronMode = typeof window !== 'undefined' && Boolean((window as any).electronAPI?.isElectron);
        const serverName = isElectronMode ? 'Local Terminal' : 'Gateway Shell';

        setSessions(prev => [...prev, {
            tabId,
            sessionId: crypto.randomUUID(),
            type: 'local',
            serverId: 'local',
            serverName,
            token: null,
            gatewayUrl: null,
            status: 'connecting',
            showFiles: false,
        }]);
        setActiveTabId(tabId);

        if (!isElectronMode) {
            // Fetch a gateway token for the WebSocket-based cloud path
            fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ protocol: 'local' }),
            })
                .then(res => res.json())
                .then(data => {
                    setSessions(prev => prev.map(s => {
                        if (s.tabId !== tabId) return s;
                        if (data.success) {
                            return { ...s, token: data.data.token, gatewayUrl: data.data.gatewayUrl };
                        }
                        return { ...s, status: 'error', errorMessage: data.error || 'Local terminal not available on this server' };
                    }));
                })
                .catch(() => {
                    setSessions(prev => prev.map(s =>
                        s.tabId === tabId ? { ...s, status: 'error', errorMessage: 'Failed to connect' } : s
                    ));
                });
        }
    }, [uid]);

    const addSession: SessionsProvider_AddSession = useCallback(async (serverId: string, serverName?: string) => {
        const tabId = `${uid}-${Date.now()}`;
        const sessionId = crypto.randomUUID();
        let name = serverName ?? '';
        if (!name) {
            try {
                const res = await fetch(`/api/servers/${serverId}`);
                const data = await res.json();
                if (data.success) name = data.data.server.name;
            } catch { name = serverId; }
        }

        setSessions(prev => [...prev, {
            tabId,
            sessionId,
            type: 'remote',
            serverId, serverName: name,
            token: null, gatewayUrl: null, status: 'connecting', showFiles: false,
        }]);
        setActiveTabId(tabId);

        // Persist to DB so other devices can see this session
        await dbRegisterSession(sessionId, serverId, name);

        const result = await fetchToken(serverId);
        setSessions(prev => prev.map(s => {
            if (s.tabId !== tabId) return s;
            return result
                ? { ...s, token: result.token, gatewayUrl: result.gatewayUrl }
                : { ...s, status: 'error' };
        }));
    }, [uid]);

    /** Reconnect an existing session, reusing its sessionId (for reattach to persistent gateway session). */
    const reconnectSession = useCallback(async (tabId: string, serverId: string) => {
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, token: null, status: 'connecting' } : s
        ));
        const result = await fetchToken(serverId);
        setSessions(prev => prev.map(s => {
            if (s.tabId !== tabId) return s;
            return result
                ? { ...s, token: result.token, gatewayUrl: result.gatewayUrl, status: 'connecting' }
                : { ...s, status: 'error' };
        }));
    }, []);

    /** Generate a new sessionId and reconnect (used when gateway reports session-not-found). */
    const renewSession = useCallback(async (tabId: string, serverId: string) => {
        const newSessionId = crypto.randomUUID();
        // Read old sessionId from ref (avoids stale closure)
        const oldSessionId = sessionsRef.current.find(s => s.tabId === tabId)?.sessionId ?? null;
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, sessionId: newSessionId, token: null, status: 'connecting' } : s
        ));
        // Update DB with new sessionId
        if (oldSessionId) await dbRenewSession(oldSessionId, newSessionId);

        const result = await fetchToken(serverId);
        setSessions(prev => prev.map(s => {
            if (s.tabId !== tabId) return s;
            return result
                ? { ...s, token: result.token, gatewayUrl: result.gatewayUrl, status: 'connecting' }
                : { ...s, status: 'error' };
        }));
    }, []);

    const removeSession = useCallback((tabId: string) => {
        // Send close-session to gateway before unmounting the terminal
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'close-session' }));
        }
        wsRefs.current.delete(tabId);

        setSessions(prev => {
            const target = prev.find(s => s.tabId === tabId);
            if (target?.type === 'remote') {
                // Remove from DB — fire and forget
                dbDeleteSession(target.sessionId);
            }
            const remaining = prev.filter(s => s.tabId !== tabId);
            setActiveTabId(curr => {
                if (curr !== tabId) return curr;
                return remaining.length > 0 ? remaining[remaining.length - 1].tabId : null;
            });
            return remaining;
        });
    }, []);

    const toggleFiles = useCallback((tabId: string) => {
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, showFiles: !s.showFiles } : s
        ));
    }, []);

    // ── Refs so restore effect can call stable functions without re-running ──

    const reconnectSessionRef = useRef<typeof reconnectSession | null>(null);
    reconnectSessionRef.current = reconnectSession;

    // ── Restore sessions on mount from DB (cross-device persistence) ──
    // Sessions start as 'detached' then immediately begin reconnecting.

    useEffect(() => {
        async function restoreSessions() {
            try {
                const res = await fetch('/api/sessions');
                const data = await res.json();
                if (!data.success || !data.data.sessions?.length) return;

                const saved: { sessionId: string; serverId: string; serverName: string }[] = data.data.sessions;

                const restoredSessions: Session[] = saved.map((s, i) => ({
                    tabId: `${uid}-restored-${i}-${Date.now()}`,
                    sessionId: s.sessionId,
                    type: 'remote' as const,
                    serverId: s.serverId,
                    serverName: s.serverName,
                    token: null,
                    gatewayUrl: null,
                    status: 'detached' as const,
                    showFiles: false,
                }));

                if (restoredSessions.length > 0) {
                    setSessions(restoredSessions);
                    setActiveTabId(restoredSessions[restoredSessions.length - 1].tabId);
                    restoredSessions.forEach(s => reconnectSessionRef.current?.(s.tabId, s.serverId));
                }
            } catch { /* silently ignore — network issues shouldn't break the page */ }
        }
        restoreSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — runs once on mount only

    return (
        <SessionsContext.Provider value={{
            sessions, activeTabId, setActiveTabId,
            addSession, addLocalSession, removeSession, reconnectSession, renewSession,
            toggleFiles, updateSessionStatus, setSessionError, setSessionWs,
        }}>
            {children}
        </SessionsContext.Provider>
    );
}
