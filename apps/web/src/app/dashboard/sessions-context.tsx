'use client';

import {
    createContext, useContext, useState, useCallback, useId, useEffect, useRef, type ReactNode,
} from 'react';

const STORAGE_KEY = 'termi-sessions';

// ============================================================================
// TYPES
// ============================================================================

export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'detached';

export interface Session {
    tabId: string;
    sessionId: string;        // stable UUID, persists across browser restarts
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
// PROVIDER
// ============================================================================

interface PersistedSession { sessionId: string; serverId: string; serverName: string; }
interface PersistedState { sessions: PersistedSession[]; activeServerId: string | null; }
type SessionsProvider_AddSession = (serverId: string, serverName?: string) => Promise<void>;
type SessionsProvider_AddLocalSession = () => void;

export function SessionsProvider({ children }: { children: ReactNode }) {
    const uid = useId();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    // Map of tabId → active WebSocket, used to send close-session before removing
    const wsRefs = useRef(new Map<string, WebSocket>());

    // Guard: don't persist until after the restore effect has run (avoids wiping saved sessions)
    const hasRestoredRef = useRef(false);

    // ── Persist sessions to localStorage (survives browser close) ──
    // Local terminal sessions are excluded: their PTY processes die on refresh.

    useEffect(() => {
        if (!hasRestoredRef.current) return; // Wait until restore has run
        const remote = sessions.filter(s => s.type !== 'local');
        const state: PersistedState = {
            sessions: remote.map(s => ({ sessionId: s.sessionId, serverId: s.serverId, serverName: s.serverName })),
            activeServerId: remote.find(s => s.tabId === activeTabId)?.serverId ?? null,
        };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
    }, [sessions, activeTabId]);

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
        setSessions(prev => [...prev, {
            tabId,
            sessionId: crypto.randomUUID(),
            type: 'local',
            serverId: 'local',
            serverName: 'Local Terminal',
            token: null,
            gatewayUrl: null,
            status: 'connecting',
            showFiles: false,
        }]);
        setActiveTabId(tabId);
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
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, sessionId: newSessionId, token: null, status: 'connecting' } : s
        ));
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

    const addSessionRef = useRef<SessionsProvider_AddSession | null>(null);
    const addLocalSessionRef = useRef<SessionsProvider_AddLocalSession | null>(null);
    const reconnectSessionRef = useRef<typeof reconnectSession | null>(null);
    addSessionRef.current = addSession;
    addLocalSessionRef.current = addLocalSession;
    reconnectSessionRef.current = reconnectSession;

    // ── Restore sessions on mount (after a full browser restart) ──
    // Sessions start as 'detached' then immediately begin reconnecting.

    useEffect(() => {
        hasRestoredRef.current = true; // Allow persist effect to run after this
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const { sessions: saved, activeServerId }: PersistedState = JSON.parse(raw);
            if (!saved?.length) return;

            const ordered = [
                ...saved.filter(s => s.serverId !== activeServerId),
                ...saved.filter(s => s.serverId === activeServerId),
            ];

            // Insert sessions as 'detached', then immediately start reconnecting each one
            const restoredSessions: Session[] = ordered.map((s, i) => ({
                tabId: `${uid}-restored-${i}-${Date.now()}`,
                sessionId: s.sessionId || crypto.randomUUID(), // defensive: regenerate if missing/empty
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
                // Kick off token fetch for each restored session immediately
                restoredSessions.forEach(s => reconnectSessionRef.current?.(s.tabId, s.serverId));
            }
        } catch { /* corrupted data — ignore */ }
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
