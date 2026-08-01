'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { useSessionsContext } from './sessions-context';

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
    } = useSessionsContext();

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
            setActiveTabId(tabId);
            setMode('terminal');
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        },
        [setActiveTabId],
    );

    const openLocalTerminal = useCallback(() => {
        addLocalSession();
        setMode('terminal');
    }, [addLocalSession]);

    const connectedCount = sessions.filter((s) => s.status === 'connected').length;
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
                    {sessions.map((session) => {
                        const serverMeta = allServers.find((s) => s.id === session.serverId);
                        return (
                            <TerminalPane
                                key={session.tabId}
                                session={session}
                                isActive={!showPicker && activeTabId === session.tabId}
                                mode={mode}
                                hasPassword={serverMeta?.hasPassword ?? false}
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
