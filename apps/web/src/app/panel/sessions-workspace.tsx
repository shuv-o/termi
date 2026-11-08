'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Radio } from 'lucide-react';

import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { useToast } from '@/components/ui/toast';
import { newTabId, useSessionsContext, type Session } from './sessions-context';
import { LayoutMenu, type SavedWorkspace } from './_sessions/LayoutMenu';
import { SplitDividers } from './_sessions/SplitDividers';
import {
    addPane,
    MAX_PANES,
    paneRects,
    prunePanes,
    replacePane,
    withLayout,
    type SplitLayout,
} from './_sessions/split';

import { InlineSessionPicker } from './_sessions/InlineSessionPicker';
import {
    NoSessionsState,
    SessionSidebar,
    SessionTabBar,
    WorkspaceTopBar,
} from './_sessions/WorkspaceChrome';
import { TerminalPane } from './_sessions/terminal/TerminalPane';
import { TransferMode } from './_sessions/transfer/TransferMode';
import type { LayoutMode, ServerItem, WorkspaceMode } from './_sessions/types';

const PasskeyRevealModal = dynamic(() => import('@/components/auth/PasskeyRevealModal'), {
    ssr: false,
});

export default function SessionsWorkspace() {
    const {
        sessions,
        activeTabId,
        setActiveTabId,
        addSession,
        addLocalSession,
        removeSession,
        reconnectSession,
        renewSession,
        toggleFiles,
        updateSessionStatus,
        setSessionError,
        setSessionWs,
        split,
        setSplit,
        broadcast,
        setBroadcast,
    } = useSessionsContext();
    const { toast } = useToast();
    // Splits need room: on a phone only the focused session is shown.
    const [isWide, setIsWide] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)');
        const update = () => setIsWide(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    const [showPicker, setShowPicker] = useState(false);
    const [mode, setMode] = useState<WorkspaceMode>('terminal');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [sessionSearch, setSessionSearch] = useState('');
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('tabbar');
    const [revealTarget, setRevealTarget] = useState<{
        serverId: string;
        serverName: string;
    } | null>(null);

    // Cmd/Ctrl+K from the native menu opens the server picker — the quickest
    // path from "I want that box" to a shell on it.
    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.onCommand) return;
        return api.onCommand((command) => {
            if (command === 'palette:open') setShowPicker(true);
        });
    }, []);

    useEffect(() => {
        // Default sidebar open only on desktop
        setSidebarOpen(window.innerWidth >= 1024);
        // Restore saved layout preference
        const saved = localStorage.getItem('sessions-layout');
        if (saved === 'sidebar' || saved === 'tabbar') setLayoutMode(saved);
    }, []);

    const toggleLayoutMode = useCallback(() => {
        setLayoutMode((m) => {
            const next = m === 'sidebar' ? 'tabbar' : 'sidebar';
            localStorage.setItem('sessions-layout', next);
            return next;
        });
    }, []);

    // Same cached list as the picker/dashboard — one shared fetch, not three.
    const { data: allServersData } = useCachedFetch<{ servers: ServerItem[] }>('/api/servers');
    const allServers = useMemo(() => allServersData?.servers ?? [], [allServersData]);
    const sshServers = useMemo(() => allServers.filter((s) => s.protocol === 'SSH'), [allServers]);

    const switchTab = useCallback(
        (tabId: string) => {
            // While split, a tab that isn't on screen takes the focused pane's place.
            if (split && isWide && !split.panes.includes(tabId)) {
                setSplit(replacePane(split, activeTabId ?? split.panes[0], tabId));
            }
            setActiveTabId(tabId);
            setMode('terminal');
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        },
        [setActiveTabId, split, setSplit, isWide, activeTabId],
    );

    /** Open another session to the same server in a new pane beside `session`. */
    const splitPane = useCallback(
        (session: Session, direction: 'right' | 'down') => {
            const tabId = newTabId();
            const next = addPane(split, session.tabId, tabId, direction);
            if (!next) {
                toast('info', 'A workspace shows up to 4 panes');
                return;
            }
            setSplit(next);
            if (session.type === 'local') addLocalSession({ tabId });
            else void addSession(session.serverId, session.serverName, { tabId });
            setMode('terminal');
        },
        [split, setSplit, addSession, addLocalSession, toast],
    );

    const chooseLayout = useCallback(
        (layout: SplitLayout | null) => {
            if (!layout) {
                setSplit(null);
                return;
            }
            const focused = activeTabId ?? sessions[0]?.tabId ?? null;
            setSplit(
                withLayout(
                    split,
                    layout,
                    focused,
                    sessions.map((s) => s.tabId),
                ),
            );
            setMode('terminal');
        },
        [activeTabId, sessions, split, setSplit],
    );

    const saveWorkspace = useCallback(
        async (name: string): Promise<string | null> => {
            const tabs = sessions.map((s) => ({
                serverId: s.type === 'local' ? null : s.serverId,
            }));
            const body = {
                name,
                tabs,
                split: split
                    ? {
                          layout: split.layout,
                          x: split.x,
                          y: split.y,
                          panes: split.panes.map((t) => sessions.findIndex((s) => s.tabId === t)),
                      }
                    : null,
            };
            try {
                const res = await fetch('/api/workspaces', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json();
                if (!data.success) return data.error || 'Could not save the workspace';
                toast('success', `Saved workspace "${name}"`);
                return null;
            } catch {
                return 'Could not save the workspace';
            }
        },
        [sessions, split, toast],
    );

    const openWorkspace = useCallback(
        (w: SavedWorkspace) => {
            // Opened next to whatever is already open; tab ids are chosen up
            // front so the layout can be applied straight away.
            const tabIds = w.tabs.map((t) => {
                if (!t.available) return null;
                const tabId = newTabId();
                if (t.serverId === null) addLocalSession({ tabId });
                else void addSession(t.serverId, t.serverName ?? undefined, { tabId });
                return tabId;
            });
            const opened = tabIds.filter((t): t is string => Boolean(t));
            const missing = w.tabs.length - opened.length;
            if (missing > 0) {
                toast(
                    'warning',
                    `${missing} server${missing === 1 ? ' is' : 's are'} no longer available and ${missing === 1 ? 'was' : 'were'} skipped`,
                );
            }
            const panes = w.split?.panes
                .map((i) => tabIds[i])
                .filter((t): t is string => Boolean(t));
            const next =
                w.split && panes
                    ? prunePanes(
                          { layout: w.split.layout, panes, x: w.split.x, y: w.split.y },
                          opened,
                      )
                    : null;
            setSplit(next);
            if (next) setActiveTabId(next.panes[0]);
            else if (opened[0]) setActiveTabId(opened[0]);
            setMode('terminal');
            setShowPicker(false);
        },
        [addSession, addLocalSession, setSplit, setActiveTabId, toast],
    );

    const openLocalTerminal = useCallback(() => {
        addLocalSession();
        setMode('terminal');
    }, [addLocalSession]);

    const connectedCount = sessions.filter((s) => s.status === 'connected').length;
    const shownSplit = split && isWide && mode === 'terminal' && !showPicker ? split : null;
    const rects = shownSplit ? paneRects(shownSplit, shownSplit.panes.length) : null;
    const filteredSessions = useMemo(
        () =>
            sessions.filter(
                (s) =>
                    !sessionSearch ||
                    s.serverName.toLowerCase().includes(sessionSearch.toLowerCase()),
            ),
        [sessions, sessionSearch],
    );

    // Mobile: subtract top bar (3.5rem = h-14) + bottom nav (4rem = h-16)
    // Desktop (lg+): full viewport height; parent container has no extra padding
    const containerHeight = isFullscreen
        ? 'h-screen fixed inset-0 z-[100] bg-background'
        : 'h-[calc(100vh-7.5rem)] lg:h-screen';

    return (
        <div className={`flex flex-col ${containerHeight}`}>
            <WorkspaceTopBar
                layoutMode={layoutMode}
                onToggleLayout={toggleLayoutMode}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen((o) => !o)}
                sessionCount={sessions.length}
                connectedCount={connectedCount}
                mode={mode}
                onModeChange={setMode}
                extra={
                    isWide ? (
                        <LayoutMenu
                            split={split}
                            sessionCount={sessions.length}
                            onLayout={chooseLayout}
                            broadcast={broadcast}
                            onBroadcast={setBroadcast}
                            onOpenWorkspace={openWorkspace}
                            onSaveWorkspace={saveWorkspace}
                        />
                    ) : undefined
                }
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => {
                    setIsFullscreen((f) => !f);
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
                }}
            />

            {layoutMode === 'tabbar' && (
                <SessionTabBar
                    sessions={sessions}
                    activeTabId={activeTabId}
                    mode={mode}
                    showPicker={showPicker}
                    onSwitchTab={switchTab}
                    onCloseTab={removeSession}
                    onTogglePicker={() => setShowPicker((p) => !p)}
                    onAddLocal={openLocalTerminal}
                />
            )}

            {shownSplit && broadcast && (
                <div
                    role="status"
                    className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs bg-warning/10 text-warning border-b border-warning/30"
                >
                    <Radio className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    <span className="flex-1">
                        Typing goes to all {shownSplit.panes.length} panes.
                    </span>
                    <button
                        type="button"
                        onClick={() => setBroadcast(false)}
                        className="font-medium underline-offset-2 hover:underline"
                    >
                        Turn off
                    </button>
                </div>
            )}

            <div className="flex flex-1 min-h-0 relative">
                {/* Mobile backdrop */}
                {layoutMode === 'sidebar' && sidebarOpen && (
                    <div
                        className="lg:hidden fixed inset-0 z-10 bg-black/60 backdrop-blur-sm"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {layoutMode === 'sidebar' && sidebarOpen && (
                    <SessionSidebar
                        sessions={sessions}
                        filteredSessions={filteredSessions}
                        activeTabId={activeTabId}
                        mode={mode}
                        search={sessionSearch}
                        onSearchChange={setSessionSearch}
                        showPicker={showPicker}
                        onSwitchTab={switchTab}
                        onCloseSession={removeSession}
                        onTogglePicker={() => setShowPicker((p) => !p)}
                        onAddLocal={openLocalTerminal}
                    />
                )}

                <div className="flex-1 min-w-0 min-h-0 relative">
                    {/* Inline session picker — replaces content when open */}
                    {showPicker && (
                        <InlineSessionPicker
                            canClose={sessions.length > 0}
                            onClose={() => setShowPicker(false)}
                            onPick={(server) => {
                                setShowPicker(false);
                                addSession(server.id, server.name);
                                setMode('terminal');
                            }}
                        />
                    )}

                    {!showPicker && mode === 'transfer' && <TransferMode servers={sshServers} />}

                    {!showPicker && mode === 'terminal' && sessions.length === 0 && (
                        <NoSessionsState
                            onOpenPicker={() => setShowPicker(true)}
                            onAddLocal={() => addLocalSession()}
                        />
                    )}

                    {/*
                     * ALL session terminals are rendered here simultaneously, always.
                     * Visibility is toggled with CSS — components never unmount while
                     * a session exists, so WebSocket connections stay alive.
                     */}
                    {shownSplit && <SplitDividers split={shownSplit} onChange={setSplit} />}

                    {sessions.map((session) => {
                        const meta = allServers.find((s) => s.id === session.serverId);
                        const paneIndex = shownSplit?.panes.indexOf(session.tabId) ?? -1;
                        const inSplit = paneIndex >= 0;
                        // Local terminals have no server record behind them.
                        const serverMeta =
                            session.type === 'local'
                                ? null
                                : {
                                      id: session.serverId,
                                      host: meta?.host,
                                      username: meta?.username,
                                      port: meta?.port,
                                      hasPassword: meta?.hasPassword ?? false,
                                  };
                        return (
                            <TerminalPane
                                key={session.tabId}
                                session={session}
                                isActive={
                                    !showPicker &&
                                    (inSplit || (!shownSplit && activeTabId === session.tabId))
                                }
                                isFocused={!showPicker && activeTabId === session.tabId}
                                inSplit={inSplit}
                                rect={inSplit ? rects![paneIndex] : null}
                                onFocus={
                                    inSplit && activeTabId !== session.tabId
                                        ? () => setActiveTabId(session.tabId)
                                        : undefined
                                }
                                onSplit={
                                    isWide &&
                                    (!shownSplit || shownSplit.panes.length < MAX_PANES.grid)
                                        ? (direction) => splitPane(session, direction)
                                        : undefined
                                }
                                onUnsplit={
                                    inSplit
                                        ? () => {
                                              setSplit(null);
                                              setActiveTabId(session.tabId);
                                          }
                                        : undefined
                                }
                                mode={mode}
                                serverMeta={serverMeta}
                                updateSessionStatus={updateSessionStatus}
                                setSessionError={setSessionError}
                                setSessionWs={setSessionWs}
                                reconnectSession={reconnectSession}
                                renewSession={renewSession}
                                toggleFiles={toggleFiles}
                                removeSession={removeSession}
                                onCopyPassword={() =>
                                    setRevealTarget({
                                        serverId: session.serverId,
                                        serverName: session.serverName,
                                    })
                                }
                            />
                        );
                    })}
                </div>
            </div>

            {/* Copy-password modal — same PasskeyRevealModal used in /connect/[id]/ssh */}
            {revealTarget && (
                <PasskeyRevealModal
                    serverId={revealTarget.serverId}
                    serverName={revealTarget.serverName}
                    field="password"
                    onClose={() => setRevealTarget(null)}
                />
            )}
        </div>
    );
}
