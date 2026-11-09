'use client';

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useId,
    useEffect,
    useRef,
    type ReactNode,
} from 'react';

import { openBeside, prunePanes, type SplitState } from './split';
import { getAppearance } from '@/lib/appearance/store';

// TYPES

export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'detached';

export interface Session {
    tabId: string;
    sessionId: string; // stable UUID, persists across devices via DB
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
    sessionsRestored: boolean;
    /**
     * Opens a session; resolves to its tab id. `opts.tabId` picks the id up
     * front, so a split can place the pane before the connection is ready.
     */
    addSession: (
        serverId: string,
        serverName?: string,
        opts?: AddSessionOptions,
    ) => Promise<string>;
    addLocalSession: (opts?: AddSessionOptions) => string;
    removeSession: (tabId: string) => void;
    reconnectSession: (tabId: string, serverId: string) => Promise<void>;
    renewSession: (tabId: string, serverId: string) => Promise<void>;
    toggleFiles: (tabId: string) => void;
    updateSessionStatus: (tabId: string, status: SessionStatus) => void;
    setSessionError: (tabId: string, error: string | null) => void;
    setSessionWs: (tabId: string, ws: WebSocket | null) => void;
    /**
     * Lets a session's terminal pane register "type this into my active
     * shell" — the same function the in-pane toolbar/keyboard already use —
     * so code mounted outside the terminal tree (the command palette) can
     * reach it too. Pass `null` to unregister (on unmount).
     */
    registerSendHandler: (tabId: string, handler: ((key: string) => void) | null) => void;
    /** Returns false (no-op) if that tab has no registered handler — e.g. it isn't a connected remote session. */
    sendToSession: (tabId: string | null, text: string) => boolean;
    /** Panes shown side by side, or null for one session at a time. */
    split: SplitState | null;
    setSplit: (split: SplitState | null) => void;
    /** Typing in one visible pane goes to every visible pane. */
    broadcast: boolean;
    setBroadcast: (on: boolean) => void;
    /**
     * A pane's "write these bytes to my shell's connection" — unlike the send
     * handler it bypasses xterm, so relayed input isn't relayed again.
     */
    registerRawSender: (tabId: string, sender: ((data: string) => void) | null) => void;
    /** Called with what the user typed in `fromTabId`. */
    relayInput: (fromTabId: string, data: string) => void;
}

const SPLIT_STORAGE_KEY = 'sessions-split';

export interface AddSessionOptions {
    tabId?: string;
}

/** A fresh tab id, for callers that place a tab before opening it. */
export const newTabId = () => `tab-${crypto.randomUUID()}`;

// CONTEXT

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function useSessionsContext() {
    const ctx = useContext(SessionsContext);
    if (!ctx) throw new Error('useSessionsContext must be inside SessionsProvider');
    return ctx;
}

// DB HELPERS

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

// PROVIDER

type SessionsProvider_AddSession = (
    serverId: string,
    serverName?: string,
    opts?: AddSessionOptions,
) => Promise<string>;
type SessionsProvider_AddLocalSession = (opts?: AddSessionOptions) => string;

export function SessionsProvider({ children }: { children: ReactNode }) {
    const uid = useId();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    // Read inside addSession, which must not change identity with every tab switch.
    const activeTabRef = useRef<string | null>(null);
    activeTabRef.current = activeTabId;
    const [sessionsRestored, setSessionsRestored] = useState(false);
    const [split, setSplitState] = useState<SplitState | null>(null);
    const [broadcast, setBroadcast] = useState(false);
    const rawSenders = useRef(new Map<string, (data: string) => void>());

    // Map of tabId → active WebSocket, used to send close-session before removing
    const wsRefs = useRef(new Map<string, WebSocket>());
    // Map of tabId → "type this into my active shell", registered by whichever
    // TerminalPane owns that tab (remote sessions only — see TerminalPane.tsx).
    const sendHandlers = useRef(new Map<string, (key: string) => void>());
    // Always-current snapshot of sessions (avoids stale closure reads)
    const sessionsRef = useRef<Session[]>([]);
    useEffect(() => {
        sessionsRef.current = sessions;
    }, [sessions]);

    //   Helpers

    const updateSessionStatus = useCallback((tabId: string, status: SessionStatus) => {
        setSessions((prev) => prev.map((s) => (s.tabId === tabId ? { ...s, status } : s)));
    }, []);

    const setSessionError = useCallback((tabId: string, error: string | null) => {
        setSessions((prev) =>
            prev.map((s) =>
                s.tabId === tabId ? { ...s, errorMessage: error, status: 'error' } : s,
            ),
        );
    }, []);

    const setSessionWs = useCallback((tabId: string, ws: WebSocket | null) => {
        if (ws) {
            wsRefs.current.set(tabId, ws);
        } else {
            wsRefs.current.delete(tabId);
        }
    }, []);

    //   Fetch token helper

    async function fetchToken(
        serverId: string,
    ): Promise<{ token: string; gatewayUrl: string | null } | null> {
        try {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'ssh' }),
            });
            const data = await res.json();
            return data.success
                ? { token: data.data.token, gatewayUrl: data.data.gatewayUrl ?? null }
                : null;
        } catch {
            return null;
        }
    }

    //   Session management

    const addLocalSession: SessionsProvider_AddLocalSession = useCallback(
        (opts) => {
            const tabId = opts?.tabId ?? `${uid}-local-${Date.now()}`;
            const isElectronMode =
                typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
            const serverName = isElectronMode ? 'Local terminal' : 'Gateway Shell';

            setSessions((prev) => [
                ...prev,
                {
                    tabId,
                    sessionId: crypto.randomUUID(),
                    type: 'local',
                    serverId: 'local',
                    serverName,
                    token: null,
                    gatewayUrl: null,
                    status: 'connecting',
                    showFiles: false,
                },
            ]);
            // "New connections: open beside it" — unless the caller is
            // placing the pane itself (opts.tabId).
            const focused = activeTabRef.current;
            const prefs = getAppearance();
            if (prefs.openIn === 'split' && focused && !opts?.tabId) {
                setSplitState((prev) => openBeside(prev, focused, tabId, prefs.splitShape) ?? prev);
            }
            setActiveTabId(tabId);

            if (!isElectronMode) {
                // Fetch a gateway token for the WebSocket-based cloud path
                fetch('/api/connection/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ protocol: 'local' }),
                })
                    .then((res) => res.json())
                    .then((data) => {
                        setSessions((prev) =>
                            prev.map((s) => {
                                if (s.tabId !== tabId) return s;
                                if (data.success) {
                                    return {
                                        ...s,
                                        token: data.data.token,
                                        gatewayUrl: data.data.gatewayUrl,
                                    };
                                }
                                return {
                                    ...s,
                                    status: 'error',
                                    errorMessage:
                                        data.error || 'Local terminal not available on this server',
                                };
                            }),
                        );
                    })
                    .catch(() => {
                        setSessions((prev) =>
                            prev.map((s) =>
                                s.tabId === tabId
                                    ? { ...s, status: 'error', errorMessage: 'Failed to connect' }
                                    : s,
                            ),
                        );
                    });
            }
            return tabId;
        },
        [uid],
    );

    const addSession: SessionsProvider_AddSession = useCallback(
        async (serverId: string, serverName?: string, opts?: AddSessionOptions) => {
            const tabId = opts?.tabId ?? `${uid}-${Date.now()}`;
            const sessionId = crypto.randomUUID();
            let name = serverName ?? '';
            if (!name) {
                try {
                    const res = await fetch(`/api/servers/${serverId}`);
                    const data = await res.json();
                    if (data.success) name = data.data.server.name;
                } catch {
                    name = serverId;
                }
            }

            setSessions((prev) => [
                ...prev,
                {
                    tabId,
                    sessionId,
                    type: 'remote',
                    serverId,
                    serverName: name,
                    token: null,
                    gatewayUrl: null,
                    status: 'connecting',
                    showFiles: false,
                },
            ]);
            // "New connections: open beside it" — unless the caller is
            // placing the pane itself (opts.tabId).
            const focused = activeTabRef.current;
            const prefs = getAppearance();
            if (prefs.openIn === 'split' && focused && !opts?.tabId) {
                setSplitState((prev) => openBeside(prev, focused, tabId, prefs.splitShape) ?? prev);
            }
            setActiveTabId(tabId);

            // Persist to DB so other devices can see this session
            await dbRegisterSession(sessionId, serverId, name);

            const result = await fetchToken(serverId);
            setSessions((prev) =>
                prev.map((s) => {
                    if (s.tabId !== tabId) return s;
                    return result
                        ? { ...s, token: result.token, gatewayUrl: result.gatewayUrl }
                        : { ...s, status: 'error' };
                }),
            );
            return tabId;
        },
        [uid],
    );

    /** Reconnect an existing session, reusing its sessionId (for reattach to persistent gateway session). */
    const reconnectSession = useCallback(async (tabId: string, serverId: string) => {
        setSessions((prev) =>
            prev.map((s) => (s.tabId === tabId ? { ...s, token: null, status: 'connecting' } : s)),
        );
        const result = await fetchToken(serverId);
        setSessions((prev) =>
            prev.map((s) => {
                if (s.tabId !== tabId) return s;
                return result
                    ? {
                          ...s,
                          token: result.token,
                          gatewayUrl: result.gatewayUrl,
                          status: 'connecting',
                      }
                    : { ...s, status: 'error' };
            }),
        );
    }, []);

    /** Generate a new sessionId and reconnect (used when gateway reports session-not-found). */
    const renewSession = useCallback(async (tabId: string, serverId: string) => {
        const newSessionId = crypto.randomUUID();
        // Read old sessionId from ref (avoids stale closure)
        const oldSessionId = sessionsRef.current.find((s) => s.tabId === tabId)?.sessionId ?? null;
        setSessions((prev) =>
            prev.map((s) =>
                s.tabId === tabId
                    ? { ...s, sessionId: newSessionId, token: null, status: 'connecting' }
                    : s,
            ),
        );
        // Update DB with new sessionId
        if (oldSessionId) await dbRenewSession(oldSessionId, newSessionId);

        const result = await fetchToken(serverId);
        setSessions((prev) =>
            prev.map((s) => {
                if (s.tabId !== tabId) return s;
                return result
                    ? {
                          ...s,
                          token: result.token,
                          gatewayUrl: result.gatewayUrl,
                          status: 'connecting',
                      }
                    : { ...s, status: 'error' };
            }),
        );
    }, []);

    const removeSession = useCallback((tabId: string) => {
        // Send close-session to gateway before unmounting the terminal
        const ws = wsRefs.current.get(tabId);
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'close-session' }));
        }
        wsRefs.current.delete(tabId);

        setSessions((prev) => {
            const target = prev.find((s) => s.tabId === tabId);
            if (target?.type === 'remote') {
                // Remove from DB — fire and forget
                dbDeleteSession(target.sessionId);
            }
            const remaining = prev.filter((s) => s.tabId !== tabId);
            setActiveTabId((curr) => {
                if (curr !== tabId) return curr;
                return remaining.length > 0 ? remaining[remaining.length - 1].tabId : null;
            });
            return remaining;
        });
    }, []);

    const toggleFiles = useCallback((tabId: string) => {
        setSessions((prev) =>
            prev.map((s) => (s.tabId === tabId ? { ...s, showFiles: !s.showFiles } : s)),
        );
    }, []);

    const registerSendHandler = useCallback(
        (tabId: string, handler: ((key: string) => void) | null) => {
            if (handler) sendHandlers.current.set(tabId, handler);
            else sendHandlers.current.delete(tabId);
        },
        [],
    );

    const sendToSession = useCallback((tabId: string | null, text: string): boolean => {
        if (!tabId) return false;
        const handler = sendHandlers.current.get(tabId);
        if (!handler) return false;
        handler(text);
        return true;
    }, []);

    //   Split panes and broadcast typing

    const setSplit = useCallback((next: SplitState | null) => setSplitState(next), []);

    // Remember the split by session id (stable across reloads); it is
    // restored once the sessions themselves are.
    useEffect(() => {
        if (!sessionsRestored) return;
        try {
            if (!split) {
                localStorage.removeItem(SPLIT_STORAGE_KEY);
                return;
            }
            const panes = split.panes
                .map((t) => sessions.find((s) => s.tabId === t))
                .filter((s) => s?.type === 'remote')
                .map((s) => s!.sessionId);
            localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify({ ...split, panes }));
        } catch {
            /* storage unavailable: the split just isn't remembered */
        }
    }, [split, sessions, sessionsRestored]);

    // Closed tabs leave the split; a split down to one pane ends.
    useEffect(() => {
        setSplitState((curr) =>
            prunePanes(
                curr,
                sessions.map((s) => s.tabId),
            ),
        );
    }, [sessions]);

    const registerRawSender = useCallback(
        (tabId: string, sender: ((data: string) => void) | null) => {
            if (sender) rawSenders.current.set(tabId, sender);
            else rawSenders.current.delete(tabId);
        },
        [],
    );

    const splitRef = useRef<SplitState | null>(null);
    splitRef.current = split;
    const broadcastRef = useRef(false);
    broadcastRef.current = broadcast;

    const relayInput = useCallback((fromTabId: string, data: string) => {
        const current = splitRef.current;
        if (!broadcastRef.current || !current || !current.panes.includes(fromTabId)) return;
        for (const tabId of current.panes) {
            if (tabId !== fromTabId) rawSenders.current.get(tabId)?.(data);
        }
    }, []);

    //   Refs so restore effect can call stable functions without re-running

    const reconnectSessionRef = useRef<typeof reconnectSession | null>(null);
    reconnectSessionRef.current = reconnectSession;

    //   Restore sessions on mount from DB (cross-device persistence)
    // Sessions start as 'detached' then immediately begin reconnecting.

    useEffect(() => {
        function restoreSplit(restored: Session[]) {
            try {
                const saved = JSON.parse(localStorage.getItem(SPLIT_STORAGE_KEY) ?? 'null');
                if (!saved || !Array.isArray(saved.panes)) return;
                const panes = (saved.panes as string[])
                    .map((id) => restored.find((s) => s.sessionId === id)?.tabId)
                    .filter((t): t is string => Boolean(t));
                const next = prunePanes(
                    { layout: saved.layout, panes, x: Number(saved.x), y: Number(saved.y) },
                    restored.map((s) => s.tabId),
                );
                if (next && ['columns', 'rows', 'grid'].includes(next.layout)) {
                    setSplitState(next);
                    setActiveTabId(next.panes[0]);
                }
            } catch {
                /* a broken saved split is simply ignored */
            }
        }

        async function restoreSessions() {
            try {
                const res = await fetch('/api/sessions');
                const data = await res.json();
                if (!data.success || !data.data.sessions?.length) return;

                const saved: { sessionId: string; serverId: string; serverName: string }[] =
                    data.data.sessions;

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
                    restoreSplit(restoredSessions);
                    restoredSessions.forEach((s) =>
                        reconnectSessionRef.current?.(s.tabId, s.serverId),
                    );
                }
            } catch {
                /* silently ignore — network issues shouldn't break the page */
            } finally {
                setSessionsRestored(true);
            }
        }
        restoreSessions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — runs once on mount only

    return (
        <SessionsContext.Provider
            value={{
                sessions,
                activeTabId,
                setActiveTabId,
                sessionsRestored,
                addSession,
                addLocalSession,
                removeSession,
                reconnectSession,
                renewSession,
                toggleFiles,
                updateSessionStatus,
                setSessionError,
                setSessionWs,
                registerSendHandler,
                sendToSession,
                split,
                setSplit,
                broadcast,
                setBroadcast,
                registerRawSender,
                relayInput,
            }}
        >
            {children}
        </SessionsContext.Provider>
    );
}
