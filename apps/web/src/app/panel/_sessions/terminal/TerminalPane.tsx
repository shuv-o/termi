'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, RotateCcw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FileManagerPanel from '@/components/scp/FileManagerPanel';
import { TerminalPaneHeader } from './TerminalPaneHeader';
import { useShells } from './useShells';
import type { Session, SessionStatus } from '../../sessions-context';

const SSHTerminal = dynamic(() => import('@/components/terminal/SSHTerminal'), { ssr: false });
const LocalTerminal = dynamic(() => import('@/components/terminal/LocalTerminal'), { ssr: false });
const VirtualKeyboard = dynamic(() => import('@/components/terminal/VirtualKeyboard'), {
    ssr: false,
});
const TerminalToolbar = dynamic(() => import('@/components/terminal/TerminalToolbar'), {
    ssr: false,
});

function ConnectingPlaceholder() {
    return (
        <div className="flex items-center justify-center h-full bg-card/20">
            <div className="flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Establishing connection…</span>
            </div>
        </div>
    );
}

function RestoringPlaceholder({ serverName }: { serverName: string }) {
    return (
        <div className="flex items-center justify-center h-full bg-card/20">
            <div className="flex flex-col items-center gap-3 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
                <div>
                    <p className="text-sm font-medium">Restoring session…</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Reconnecting to {serverName}
                    </p>
                </div>
            </div>
        </div>
    );
}

function ConnectionFailed({
    errorMessage,
    onRetry,
}: {
    errorMessage?: string | null;
    onRetry: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-card/20">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <WifiOff className="w-6 h-6 text-destructive/70" />
            </div>
            <div className="text-center">
                <p className="text-sm font-medium text-destructive">Connection failed</p>
                {errorMessage && (
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs px-4 break-words">
                        {errorMessage}
                    </p>
                )}
            </div>
            <Button variant="secondary" size="sm" onClick={onRetry} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Retry connection
            </Button>
        </div>
    );
}

/**
 * One session's terminal content, with multi-shell support.
 *
 * Kept as a separate component so the identity is stable (no remounting on
 * visibility toggles) and all sessions stay connected simultaneously.
 */
export function TerminalPane({
    session,
    isActive,
    mode,
    hasPassword,
    updateSessionStatus,
    setSessionError,
    setSessionWs,
    reconnectSession,
    renewSession,
    toggleFiles,
    removeSession,
    onCopyPassword,
}: {
    session: Session;
    isActive: boolean;
    mode: 'terminal' | 'transfer';
    hasPassword: boolean;
    updateSessionStatus: (tabId: string, status: SessionStatus) => void;
    setSessionError: (tabId: string, error: string | null) => void;
    setSessionWs: (tabId: string, ws: WebSocket | null) => void;
    reconnectSession: (tabId: string, serverId: string) => Promise<void>;
    renewSession: (tabId: string, serverId: string) => Promise<void>;
    toggleFiles: (tabId: string) => void;
    removeSession: (tabId: string) => void;
    onCopyPassword: () => void;
}) {
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [showToolbar, setShowToolbar] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const {
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
    } = useShells(session, removeSession);

    useEffect(() => {
        const check = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile) setShowKeyboard(true);
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    /** Shell 0 is owned by the session context; others manage their own token. */
    const reconnectShell = (shellId: string, isFirst: boolean) => {
        if (isFirst) reconnectSession(session.tabId, session.serverId);
        else refreshShellToken(shellId);
    };

    const renewShell = (shellId: string, isFirst: boolean) => {
        if (isFirst) renewSession(session.tabId, session.serverId);
        else refreshShellToken(shellId);
    };

    // Native "Shell" menu commands (Cmd+T, Cmd+Shift+W, Cmd+Shift+[ / ]).
    // Only the visible session panel reacts, and local terminals have no
    // gateway shells to manage.
    useEffect(() => {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (!api?.onCommand) return;
        if (!isActive || session.type === 'local') return;

        return api.onCommand((command) => {
            switch (command) {
                case 'shell:new':
                    void addShell();
                    break;
                case 'shell:close':
                    // Keep the last shell open — closing it would leave an empty
                    // session panel with nothing to show.
                    if (shells.length > 1 && activeShellId) closeShell(activeShellId);
                    break;
                case 'shell:next':
                case 'shell:prev': {
                    if (shells.length < 2) break;
                    const delta = command === 'shell:next' ? 1 : -1;
                    // Wrap around, so the shortcuts cycle rather than dead-end.
                    const next = (activeShellIndex + delta + shells.length) % shells.length;
                    setActiveShellId(shells[next].id);
                    nudgeResize(60);
                    break;
                }
            }
        });
    }, [
        isActive,
        session.type,
        shells,
        activeShellId,
        activeShellIndex,
        addShell,
        closeShell,
        setActiveShellId,
        nudgeResize,
    ]);

    const visible = isActive && mode === 'terminal';
    const connectionFailed =
        session.status === 'error' || (!session.token && session.status !== 'connecting');

    return (
        <div
            className="absolute inset-0 flex flex-col"
            style={{
                visibility: visible ? 'visible' : 'hidden',
                pointerEvents: visible ? 'auto' : 'none',
            }}
        >
            <TerminalPaneHeader
                session={session}
                hasPassword={hasPassword}
                shells={shells}
                activeShellId={activeShellId}
                onActivateShell={activateShell}
                onCloseShell={closeShell}
                onAddShell={addShell}
                onReconnectShell={() => reconnectShell(activeShellId, activeShellIndex === 0)}
                onCopyPassword={onCopyPassword}
                onToggleFiles={() => toggleFiles(session.tabId)}
                showToolbar={showToolbar}
                onToggleToolbar={() => {
                    setShowToolbar((t) => !t);
                    nudgeResize();
                }}
                showKeyboard={showKeyboard}
                onToggleKeyboard={() => {
                    setShowKeyboard((k) => !k);
                    nudgeResize();
                }}
                onClose={() => removeSession(session.tabId)}
            />

            <div className="flex flex-1 min-h-0">
                <div className="flex-1 min-w-0 min-h-0 relative">
                    {session.type === 'local' ? (
                        <LocalTerminal
                            tabId={session.tabId}
                            connectionToken={session.token ?? undefined}
                            gatewayUrl={session.gatewayUrl ?? undefined}
                            onReady={() => updateSessionStatus(session.tabId, 'connected')}
                            onExit={() => updateSessionStatus(session.tabId, 'disconnected')}
                        />
                    ) : session.status === 'detached' ? (
                        <RestoringPlaceholder serverName={session.serverName} />
                    ) : connectionFailed ? (
                        <ConnectionFailed
                            errorMessage={session.errorMessage}
                            onRetry={() => reconnectSession(session.tabId, session.serverId)}
                        />
                    ) : (
                        /* All shells stacked — only active one visible */
                        <>
                            {shells.length === 0 && <ConnectingPlaceholder />}
                            {shells.map((shell, i) => {
                                const isShellActive = shell.id === activeShellId;
                                const isFirst = i === 0;
                                return (
                                    <div
                                        key={shell.id}
                                        className="absolute inset-0"
                                        style={{
                                            visibility:
                                                isActive && isShellActive ? 'visible' : 'hidden',
                                            pointerEvents:
                                                isActive && isShellActive ? 'auto' : 'none',
                                        }}
                                    >
                                        {!shell.token ? (
                                            <ConnectingPlaceholder />
                                        ) : (
                                            <SSHTerminal
                                                sessionId={shell.sessionId}
                                                serverId={session.serverId}
                                                connectionToken={shell.token}
                                                gatewayUrl={session.gatewayUrl ?? undefined}
                                                disableNativeKeyboard={isMobile}
                                                onDisconnect={() => {
                                                    if (isFirst)
                                                        updateSessionStatus(
                                                            session.tabId,
                                                            'disconnected',
                                                        );
                                                }}
                                                onError={(err) => {
                                                    if (isFirst)
                                                        setSessionError(session.tabId, err);
                                                }}
                                                onKeyHandlerReady={(handler) => {
                                                    keyHandlers.current.set(shell.id, handler);
                                                    if (isFirst)
                                                        updateSessionStatus(
                                                            session.tabId,
                                                            'connected',
                                                        );
                                                }}
                                                onWebSocketCreated={(ws) => {
                                                    if (ws) wsRefs.current.set(shell.id, ws);
                                                    else wsRefs.current.delete(shell.id);
                                                    // Context WS tracking covers shell[0] only
                                                    if (isFirst) setSessionWs(session.tabId, ws);
                                                }}
                                                onSessionNotFound={() =>
                                                    renewShell(shell.id, isFirst)
                                                }
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {session.showFiles && session.type !== 'local' && (
                    <div className="hidden md:flex w-72 lg:w-80 xl:w-96 shrink-0 flex-col border-l border-border overflow-hidden">
                        <FileManagerPanel
                            serverId={session.serverId}
                            onClose={() => toggleFiles(session.tabId)}
                        />
                    </div>
                )}
            </div>

            {/* Quick-tools strip — SSH only, sits above the keyboard */}
            {showToolbar && session.type !== 'local' && (
                <TerminalToolbar
                    onKey={(key) => keyHandlers.current.get(activeShellId)?.(key)}
                    onClose={() => {
                        setShowToolbar(false);
                        nudgeResize();
                    }}
                />
            )}

            {showKeyboard && session.type !== 'local' && (
                <VirtualKeyboard onKey={(key) => keyHandlers.current.get(activeShellId)?.(key)} />
            )}
        </div>
    );
}
