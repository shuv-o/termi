'use client';

import {
    Activity,
    Circle,
    Copy,
    ExternalLink,
    FolderOpen,
    Keyboard,
    KeyRound,
    Laptop,
    Plus,
    RotateCcw,
    Terminal,
    TerminalSquare,
    User,
    Waypoints,
    Wrench,
    X,
} from 'lucide-react';
import { IconButton, IconButtonDivider } from '@/components/ui/icon-button';
import { StatusDot, statusColor, statusLabel } from '../status';
import { HostChip, sshCommand, useCopyToClipboard, type SessionServerMeta } from './ServerMeta';
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
                                aria-label={`Close shell ${i + 1}`}
                                className={`ml-0.5 p-0.5 rounded-sm hover:bg-destructive/20 hover:text-destructive transition-all ${
                                    isShellActive
                                        ? 'opacity-40 hover:opacity-100 text-primary'
                                        : 'opacity-0 group-hover:opacity-60'
                                }`}
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        )}
                    </div>
                );
            })}
            <button
                onClick={onAdd}
                aria-label="New shell"
                title="New shell"
                className="flex items-center justify-center w-6 h-6 ml-0.5 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
            >
                <Plus className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

/**
 * Server identity, shell tabs, and the session's actions.
 *
 * Every action is a button on the bar — nothing is hidden behind an overflow
 * menu. That is a lot of glyphs in a row, so two things carry the weight:
 * each one is an `IconButton`, which forces a tooltip and an accessible name,
 * and they are separated into groups (panels · session · copy · leave) so the
 * row reads as four short clusters rather than one undifferentiated strip.
 *
 * Below `md` the bar moves to its own scrollable second row: the actions stay
 * fully inline, but they stop competing with the server name for width on a
 * phone.
 */
export function TerminalPaneHeader({
    session,
    serverMeta,
    shells,
    activeShellId,
    onActivateShell,
    onCloseShell,
    onAddShell,
    onReconnectShell,
    onCopyPassword,
    onToggleFiles,
    showMetrics,
    onToggleMetrics,
    showToolbar,
    onToggleToolbar,
    showKeyboard,
    onToggleKeyboard,
    isRecording,
    onToggleRecording,
    onOpenTunnel,
    onClose,
}: {
    session: Session;
    /** Host/username/port for the copy actions; `null` for local terminals. */
    serverMeta: SessionServerMeta | null;
    shells: ShellTab[];
    activeShellId: string;
    onActivateShell: (id: string) => void;
    onCloseShell: (id: string) => void;
    onAddShell: () => void;
    onReconnectShell: () => void;
    onCopyPassword: () => void;
    onToggleFiles: () => void;
    showMetrics: boolean;
    onToggleMetrics: () => void;
    showToolbar: boolean;
    onToggleToolbar: () => void;
    showKeyboard: boolean;
    onToggleKeyboard: () => void;
    isRecording: boolean;
    onToggleRecording: () => void;
    onOpenTunnel: () => void;
    onClose: () => void;
}) {
    const copy = useCopyToClipboard();
    const isRemote = session.type !== 'local';
    const showShellTabs = isRemote && session.status !== 'detached' && shells.length > 0;
    const command = sshCommand(serverMeta);

    const actions = (
        <>
            {isRemote && (
                <>
                    {/* Panels — the two things that dock beside the terminal. */}
                    <IconButton
                        size="sm"
                        label={session.showFiles ? 'Hide file manager' : 'File manager'}
                        icon={FolderOpen}
                        active={session.showFiles}
                        onClick={onToggleFiles}
                    />
                    <IconButton
                        size="sm"
                        label={showMetrics ? 'Hide live metrics' : 'Live metrics'}
                        icon={Activity}
                        active={showMetrics}
                        onClick={onToggleMetrics}
                    />
                    <IconButton
                        size="sm"
                        label={showToolbar ? 'Hide quick tools' : 'Quick tools'}
                        icon={Wrench}
                        active={showToolbar}
                        onClick={onToggleToolbar}
                    />
                </>
            )}

            <IconButton
                size="sm"
                label={showKeyboard ? 'Hide keyboard' : 'On-screen keyboard'}
                icon={Keyboard}
                active={showKeyboard}
                onClick={onToggleKeyboard}
            />

            {isRemote && (
                <>
                    <IconButtonDivider />

                    {/* Session lifecycle. */}
                    <IconButton
                        size="sm"
                        label="Reconnect shell"
                        icon={RotateCcw}
                        onClick={onReconnectShell}
                    />
                    <IconButton
                        size="sm"
                        label={isRecording ? 'Stop recording' : 'Record session'}
                        icon={Circle}
                        onClick={onToggleRecording}
                        iconClassName={
                            isRecording ? 'fill-danger text-danger animate-pulse' : undefined
                        }
                    />
                    <IconButton
                        size="sm"
                        label="Port forwarding"
                        icon={Waypoints}
                        onClick={onOpenTunnel}
                    />

                    <IconButtonDivider />

                    {/* Copy actions. Each stays mounted but disabled when the
                        underlying field is missing, so the bar does not reflow
                        as server records differ. */}
                    <IconButton
                        size="sm"
                        label="Copy IP / hostname"
                        icon={Copy}
                        disabled={!serverMeta?.host}
                        onClick={() => copy('Address', serverMeta?.host)}
                    />
                    <IconButton
                        size="sm"
                        label="Copy username"
                        icon={User}
                        disabled={!serverMeta?.username}
                        onClick={() => copy('Username', serverMeta?.username)}
                    />
                    <IconButton
                        size="sm"
                        label="Copy ssh command"
                        icon={TerminalSquare}
                        hint={command ?? undefined}
                        disabled={!command}
                        onClick={() => copy('SSH command', command)}
                    />
                    <IconButton
                        size="sm"
                        label="Copy password"
                        hint="passkey required"
                        icon={KeyRound}
                        disabled={!serverMeta?.hasPassword}
                        onClick={onCopyPassword}
                    />

                    <IconButtonDivider />

                    {/* A real anchor, so middle-click and open-in-new-tab work. */}
                    <IconButton
                        size="sm"
                        label="Server details"
                        icon={ExternalLink}
                        href={`/panel/servers/${serverMeta?.id ?? ''}`}
                    />
                </>
            )}

            <IconButton
                size="sm"
                label="Close session"
                icon={X}
                onClick={onClose}
                className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
            />
        </>
    );

    return (
        <div className="shrink-0 border-b border-border bg-card/30">
            <div className="flex min-h-0 items-center gap-2 overflow-hidden px-3 py-1.5">
                <div className="flex shrink-0 items-center gap-2">
                    {session.type === 'local' ? (
                        <Laptop className="w-4 h-4 text-violet-400 shrink-0" />
                    ) : (
                        <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="whitespace-nowrap text-sm font-medium">
                        {session.serverName}
                    </span>
                    <StatusDot status={session.status} />
                    <span
                        className={`text-xs ${statusColor(session.status)} hidden whitespace-nowrap sm:inline`}
                    >
                        {statusLabel(session.status)}
                    </span>
                    {isRecording && (
                        <span
                            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-danger"
                            title="This session is being recorded"
                        >
                            <Circle className="h-2 w-2 animate-pulse fill-danger" />
                            <span className="hidden sm:inline">Rec</span>
                        </span>
                    )}
                    {isRemote && serverMeta?.host && (
                        <HostChip host={serverMeta.host} port={serverMeta.port} />
                    )}
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

                <div className="hidden shrink-0 items-center gap-0.5 md:flex">{actions}</div>
            </div>

            {/* Narrow screens: the same bar, one row down, scrolling sideways. */}
            <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto px-3 pb-1.5 md:hidden">
                {actions}
            </div>
        </div>
    );
}
