'use client';

import {
    Circle,
    FolderOpen,
    Keyboard,
    KeyRound,
    Laptop,
    Plus,
    RotateCcw,
    Terminal,
    Wrench,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusDot, statusColor, statusLabel } from '../status';
import type { Session } from '../../sessions-context';
import type { ShellTab } from './useShells';

function ShellTabs({
    shells,
    activeShellId,
    onActivate,
    onClose,
    onAdd,
}: {
    shells: ShellTab[];
    activeShellId: string;
    onActivate: (id: string) => void;
    onClose: (id: string) => void;
    onAdd: () => void;
}) {
    return (
        <div className="flex items-center flex-1 min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ml-2 border-l border-border/40 pl-2 gap-0.5">
            {shells.map((shell, i) => {
                const isShellActive = shell.id === activeShellId;
                return (
                    <div
                        key={shell.id}
                        onClick={() => onActivate(shell.id)}
                        className={`group flex items-center gap-1.5 px-2.5 py-1 cursor-pointer transition-all shrink-0 rounded-md text-xs whitespace-nowrap select-none ${
                            isShellActive
                                ? 'bg-primary/15 text-primary ring-1 ring-primary/30 font-semibold'
                                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground font-medium'
                        }`}
                    >
                        <Terminal
                            className={`w-3 h-3 shrink-0 ${isShellActive ? 'text-primary' : ''}`}
                        />
                        <span>Shell {i + 1}</span>
                        {shells.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClose(shell.id);
                                }}
                                className={`ml-0.5 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-all ${
                                    isShellActive
                                        ? 'opacity-40 hover:opacity-100 text-primary'
                                        : 'opacity-0 group-hover:opacity-60'
                                }`}
                                title="Close shell"
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        )}
                    </div>
                );
            })}
            <button
                onClick={onAdd}
                className="flex items-center justify-center w-6 h-6 ml-0.5 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                title="New shell"
            >
                <Plus className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

/** Server identity, shell tabs, and per-session action buttons. */
export function TerminalPaneHeader({
    session,
    hasPassword,
    shells,
    activeShellId,
    onActivateShell,
    onCloseShell,
    onAddShell,
    onReconnectShell,
    onCopyPassword,
    onToggleFiles,
    showToolbar,
    onToggleToolbar,
    showKeyboard,
    onToggleKeyboard,
    isRecording,
    onToggleRecording,
    onClose,
}: {
    session: Session;
    hasPassword: boolean;
    shells: ShellTab[];
    activeShellId: string;
    onActivateShell: (id: string) => void;
    onCloseShell: (id: string) => void;
    onAddShell: () => void;
    onReconnectShell: () => void;
    onCopyPassword: () => void;
    onToggleFiles: () => void;
    showToolbar: boolean;
    onToggleToolbar: () => void;
    showKeyboard: boolean;
    onToggleKeyboard: () => void;
    isRecording: boolean;
    onToggleRecording: () => void;
    onClose: () => void;
}) {
    const showShellTabs =
        session.type === 'remote' && session.status !== 'detached' && shells.length > 0;

    return (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/30 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 shrink-0">
                {session.type === 'local' ? (
                    <Laptop className="w-4 h-4 text-violet-400 shrink-0" />
                ) : (
                    <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium text-sm whitespace-nowrap">{session.serverName}</span>
                <StatusDot status={session.status} />
                <span
                    className={`text-xs ${statusColor(session.status)} hidden sm:inline whitespace-nowrap`}
                >
                    {statusLabel(session.status)}
                </span>
            </div>

            {showShellTabs ? (
                <ShellTabs
                    shells={shells}
                    activeShellId={activeShellId}
                    onActivate={onActivateShell}
                    onClose={onCloseShell}
                    onAdd={onAddShell}
                />
            ) : (
                <div className="flex-1" />
            )}

            <div className="flex items-center gap-1 shrink-0">
                {session.type !== 'local' && (
                    <>
                        {hasPassword && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onCopyPassword}
                                className="h-7 w-7"
                                title="Copy password"
                            >
                                <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                        )}
                        <Button
                            variant={session.showFiles ? 'default' : 'ghost'}
                            size="icon"
                            onClick={onToggleFiles}
                            className="h-7 w-7"
                            title="Toggle file manager"
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onReconnectShell}
                            className="h-7 w-7"
                            title="Reconnect shell"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleRecording}
                            className="h-7 w-7"
                            title={isRecording ? 'Stop recording' : 'Record this session'}
                        >
                            <Circle
                                className={`w-3.5 h-3.5 ${
                                    isRecording
                                        ? 'fill-red-500 text-red-500 animate-pulse'
                                        : 'text-muted-foreground'
                                }`}
                            />
                        </Button>
                        <Button
                            variant={showToolbar ? 'default' : 'ghost'}
                            size="icon"
                            className="h-7 w-7"
                            onClick={onToggleToolbar}
                            title={showToolbar ? 'Hide quick tools' : 'Quick tools'}
                        >
                            <Wrench className="w-3.5 h-3.5" />
                        </Button>
                    </>
                )}
                <Button
                    variant={showKeyboard ? 'default' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={onToggleKeyboard}
                    title={showKeyboard ? 'Hide keyboard' : 'Show keyboard'}
                >
                    <Keyboard className="w-3.5 h-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-7 w-7 text-destructive/60 hover:text-destructive"
                    title="Close session"
                >
                    <X className="w-3.5 h-3.5" />
                </Button>
            </div>
        </div>
    );
}
