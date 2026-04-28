'use client';

import {
    createContext, useContext, useState, useCallback, useId, useEffect, useRef, type ReactNode,
} from 'react';

const STORAGE_KEY = 'termi-sessions';

// ============================================================================
// TYPES
// ============================================================================

export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface Session {
    tabId: string;
    type: 'remote' | 'local';
    serverId: string;
    serverName: string;
    token: string | null;
    gatewayUrl: string | null;
    status: SessionStatus;
    showFiles: boolean;
}

interface SessionsContextValue {
    sessions: Session[];
    activeTabId: string | null;
    setActiveTabId: (tabId: string) => void;
    addSession: (serverId: string, serverName?: string) => Promise<void>;
    addLocalSession: () => void;
    removeSession: (tabId: string) => void;
    reconnectSession: (tabId: string, serverId: string) => Promise<void>;
    toggleFiles: (tabId: string) => void;
    updateSessionStatus: (tabId: string, status: SessionStatus) => void;
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

interface PersistedSession { serverId: string; serverName: string; }
interface PersistedState { sessions: PersistedSession[]; activeServerId: string | null; }
type SessionsProvider_AddSession = (serverId: string, serverName?: string) => Promise<void>;
type SessionsProvider_AddLocalSession = () => void;

export function SessionsProvider({ children }: { children: ReactNode }) {
    const uid = useId();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    // ── Persist sessions to sessionStorage (survives refresh, cleared on tab close) ──
    // Local terminal sessions are excluded: their PTY processes die on refresh.

    useEffect(() => {
        const remote = sessions.filter(s => s.type !== 'local');
        const state: PersistedState = {
            sessions: remote.map(s => ({ serverId: s.serverId, serverName: s.serverName })),
            activeServerId: remote.find(s => s.tabId === activeTabId)?.serverId ?? null,
        };
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
    }, [sessions, activeTabId]);

    // ── Restore sessions on mount (after a refresh) ──

    // addSession / addLocalSession are defined below; refs let the restore effect call
    // them without listing them as dependencies (stable but ESLint can't prove it).
    const addSessionRef = useRef<SessionsProvider_AddSession | null>(null);
    const addLocalSessionRef = useRef<SessionsProvider_AddLocalSession | null>(null);

    const updateSessionStatus = useCallback((tabId: string, status: SessionStatus) => {
        setSessions(prev => prev.map(s => s.tabId === tabId ? { ...s, status } : s));
    }, []);

    const addLocalSession: SessionsProvider_AddLocalSession = useCallback(() => {
        const tabId = `${uid}-local-${Date.now()}`;
        setSessions(prev => [...prev, {
            tabId,
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
            type: 'remote',
            serverId, serverName: name,
            token: null, gatewayUrl: null, status: 'connecting', showFiles: false,
        }]);
        setActiveTabId(tabId);

        try {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'ssh' }),
            });
            const data = await res.json();
            setSessions(prev => prev.map(s => {
                if (s.tabId !== tabId) return s;
                return data.success
                    ? { ...s, token: data.data.token, gatewayUrl: data.data.gatewayUrl ?? null }
                    : { ...s, status: 'error' };
            }));
        } catch {
            setSessions(prev => prev.map(s =>
                s.tabId === tabId ? { ...s, status: 'error' } : s
            ));
        }
    }, [uid]);

    const reconnectSession = useCallback(async (tabId: string, serverId: string) => {
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, token: null, status: 'connecting' } : s
        ));
        try {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'ssh' }),
            });
            const data = await res.json();
            setSessions(prev => prev.map(s => {
                if (s.tabId !== tabId) return s;
                return data.success
                    ? { ...s, token: data.data.token, gatewayUrl: data.data.gatewayUrl ?? null, status: 'connecting' }
                    : { ...s, status: 'error' };
            }));
        } catch {
            setSessions(prev => prev.map(s =>
                s.tabId === tabId ? { ...s, status: 'error' } : s
            ));
        }
    }, []);

    const removeSession = useCallback((tabId: string) => {
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

    addSessionRef.current = addSession;
    addLocalSessionRef.current = addLocalSession;

    // Run once on mount: restore any sessions saved before the last refresh
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const { sessions: saved, activeServerId }: PersistedState = JSON.parse(raw);
            if (!saved?.length) return;

            // Add the previously-active session last so it ends up as the active tab
            const ordered = [
                ...saved.filter(s => s.serverId !== activeServerId),
                ...saved.filter(s => s.serverId === activeServerId),
            ];
            ordered.forEach(s => addSessionRef.current?.(s.serverId, s.serverName));
        } catch { /* corrupted data — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — runs once on mount only

    return (
        <SessionsContext.Provider value={{
            sessions, activeTabId, setActiveTabId,
            addSession, addLocalSession, removeSession, reconnectSession,
            toggleFiles, updateSessionStatus,
        }}>
            {children}
        </SessionsContext.Provider>
    );
}
