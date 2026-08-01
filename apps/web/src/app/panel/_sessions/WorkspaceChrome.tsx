'use client';

import {
    ArrowLeftRight,
    Globe,
    Laptop,
    Maximize2,
    Minimize2,
    Monitor,
    PanelLeft,
    PanelTop,
    Plus,
    Search,
    SplitSquareHorizontal,
    Terminal,
    Wifi,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusDot, statusColor, statusLabel } from './status';
import type { Session } from '../sessions-context';
import type { LayoutMode, WorkspaceMode } from './types';

/** Layout toggles, session counts, terminal/transfer switch and fullscreen. */
export function WorkspaceTopBar({
    layoutMode,
    onToggleLayout,
    sidebarOpen,
    onToggleSidebar,
    sessionCount,
    connectedCount,
    mode,
    onModeChange,
    isFullscreen,
    onToggleFullscreen,
}: {
    layoutMode: LayoutMode;
    onToggleLayout: () => void;
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    sessionCount: number;
    connectedCount: number;
    mode: WorkspaceMode;
    onModeChange: (m: WorkspaceMode) => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}) {
    return (
        <div className="shrink-0 flex items-center gap-1.5 px-2 py-2 bg-card border-b border-border">
            <Button
                variant="ghost"
                size="icon"
                onClick={onToggleLayout}
                className="h-8 w-8 shrink-0"
                title={
                    layoutMode === 'sidebar'
                        ? 'Switch to tab bar layout'
                        : 'Switch to sidebar layout'
                }
            >
                {layoutMode === 'sidebar' ? (
                    <PanelTop className="w-4 h-4" />
                ) : (
                    <PanelLeft className="w-4 h-4" />
                )}
            </Button>

            {layoutMode === 'sidebar' && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleSidebar}
                    className="h-8 w-8 shrink-0"
                    title={sidebarOpen ? 'Hide session list' : 'Show session list'}
                >
                    <SplitSquareHorizontal className="w-4 h-4" />
                </Button>
            )}

            <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
                <Monitor className="w-4 h-4" />
                <span>
                    <span className="text-foreground font-medium">{sessionCount}</span>
                    <span className="hidden md:inline">
                        {' '}
                        session{sessionCount !== 1 ? 's' : ''}
                    </span>
                </span>
                {connectedCount > 0 && (
                    <span className="flex items-center gap-0.5 text-green-400 text-xs">
                        <Wifi className="w-3 h-3" />
                        <span className="hidden md:inline">{connectedCount} live</span>
                    </span>
                )}
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
                {(
                    [
                        { id: 'terminal', label: 'Terminal', Icon: Terminal },
                        { id: 'transfer', label: 'Transfer', Icon: ArrowLeftRight },
                    ] as const
                ).map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => onModeChange(id)}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            mode === id
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                    </button>
                ))}
            </div>

            <Button
                variant="ghost"
                size="icon"
                onClick={onToggleFullscreen}
                className="hidden sm:flex h-8 w-8"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
                {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                ) : (
                    <Maximize2 className="w-4 h-4" />
                )}
            </Button>
        </div>
    );
}

/** Browser-style horizontal strip of open sessions. */
export function SessionTabBar({
    sessions,
    activeTabId,
    mode,
    showPicker,
    onSwitchTab,
    onCloseTab,
    onTogglePicker,
    onAddLocal,
}: {
    sessions: Session[];
    activeTabId: string | null;
    mode: WorkspaceMode;
    showPicker: boolean;
    onSwitchTab: (tabId: string) => void;
    onCloseTab: (tabId: string) => void;
    onTogglePicker: () => void;
    onAddLocal: () => void;
}) {
    return (
        <div className="shrink-0 flex items-stretch border-b border-border bg-card/60 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {sessions.map((session) => {
                const isTabActive = activeTabId === session.tabId && mode === 'terminal';
                return (
                    <div
                        key={session.tabId}
                        onClick={() => onSwitchTab(session.tabId)}
                        className={`group relative flex items-center gap-1.5 px-3 py-2 cursor-pointer shrink-0 border-r border-border/50 transition-all max-w-[200px] min-w-[100px] select-none ${
                            isTabActive
                                ? 'bg-background text-foreground border-t-2 border-t-primary -mt-px font-semibold shadow-sm'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-t-2 border-t-transparent -mt-px'
                        }`}
                    >
                        <StatusDot status={session.status} />
                        <span className="text-xs truncate flex-1 min-w-0">
                            {session.serverName}
                        </span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onCloseTab(session.tabId);
                            }}
                            className={`p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-opacity shrink-0 ml-1 ${
                                isTabActive
                                    ? 'opacity-50 hover:opacity-100 text-muted-foreground'
                                    : 'opacity-0 group-hover:opacity-60 text-muted-foreground'
                            }`}
                            title="Close tab"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                );
            })}
            <button
                onClick={onTogglePicker}
                className={`flex items-center justify-center px-3 py-2 shrink-0 transition-colors border-r border-border ${
                    showPicker
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
                title="New server session"
            >
                <Plus className="w-3.5 h-3.5" />
            </button>
            <button
                onClick={onAddLocal}
                className="flex items-center justify-center px-3 py-2 shrink-0 text-violet-400 hover:text-violet-300 hover:bg-secondary/60 transition-colors"
                title="New local terminal"
            >
                <Laptop className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

/** Left rail listing sessions, with a filter box and new-session actions. */
export function SessionSidebar({
    sessions,
    filteredSessions,
    activeTabId,
    mode,
    search,
    onSearchChange,
    showPicker,
    onSwitchTab,
    onCloseSession,
    onTogglePicker,
    onAddLocal,
}: {
    sessions: Session[];
    filteredSessions: Session[];
    activeTabId: string | null;
    mode: WorkspaceMode;
    search: string;
    onSearchChange: (v: string) => void;
    showPicker: boolean;
    onSwitchTab: (tabId: string) => void;
    onCloseSession: (tabId: string) => void;
    onTogglePicker: () => void;
    onAddLocal: () => void;
}) {
    return (
        <aside className="fixed inset-y-0 left-0 z-20 w-72 flex flex-col border-r border-border bg-card lg:relative lg:inset-auto lg:w-64 lg:shrink-0 lg:z-auto lg:bg-card/40">
            <div className="p-2 border-b border-border">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Filter sessions…"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-8 h-8 text-xs bg-secondary border-transparent focus:border-border"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredSessions.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-8">
                        <Terminal className="w-6 h-6 text-muted-foreground/40" />
                        <p className="text-xs text-muted-foreground">
                            {sessions.length === 0 ? 'No active sessions' : 'No matches'}
                        </p>
                    </div>
                )}
                {filteredSessions.map((session) => {
                    const isActive = activeTabId === session.tabId && mode === 'terminal';
                    return (
                        <div
                            key={session.tabId}
                            onClick={() => onSwitchTab(session.tabId)}
                            className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all select-none ${
                                isActive
                                    ? 'bg-primary/15 border border-primary/30'
                                    : 'hover:bg-secondary/60 border border-transparent'
                            }`}
                        >
                            <StatusDot status={session.status} size="md" />
                            <div className="flex-1 min-w-0">
                                <p
                                    className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}
                                >
                                    {session.serverName}
                                </p>
                                <p className={`text-[11px] ${statusColor(session.status)}`}>
                                    {session.type === 'local'
                                        ? 'Local'
                                        : statusLabel(session.status)}
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCloseSession(session.tabId);
                                }}
                                className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                title="Close session"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="p-2 border-t border-border space-y-1">
                <button
                    onClick={onTogglePicker}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                        showPicker
                            ? 'text-primary bg-primary/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                >
                    <Plus className="w-3.5 h-3.5" /> New session
                </button>
                <button
                    onClick={onAddLocal}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-violet-400 hover:text-violet-300 hover:bg-secondary transition-colors"
                >
                    <Laptop className="w-3.5 h-3.5" /> Local terminal
                </button>
                <div className="px-3 py-1.5 rounded-lg bg-secondary/50 flex items-center gap-2">
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                    <p className="text-[10px] text-muted-foreground leading-snug">
                        Sessions sync across devices
                    </p>
                </div>
            </div>
        </aside>
    );
}

/** Shown in the content area when no sessions are open. */
export function NoSessionsState({
    onOpenPicker,
    onAddLocal,
}: {
    onOpenPicker: () => void;
    onAddLocal: () => void;
}) {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center p-8">
            <div className="w-20 h-20 rounded-2xl bg-secondary border border-border flex items-center justify-center">
                <Terminal className="w-9 h-9 text-muted-foreground/60" />
            </div>
            <div>
                <h2 className="text-xl font-semibold mb-2">No active sessions</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                    Start a session to connect to a server. Sessions persist across devices — open
                    from your laptop, continue on your phone.
                </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={onOpenPicker} className="gap-2">
                    <Plus className="w-4 h-4" /> Open Server
                </Button>
                <Button variant="secondary" onClick={onAddLocal} className="gap-2">
                    <Laptop className="w-4 h-4" /> Local Terminal
                </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-4 py-2 rounded-full">
                <Globe className="w-3.5 h-3.5 text-primary" />
                Sessions sync automatically across all your devices
            </div>
        </div>
    );
}
