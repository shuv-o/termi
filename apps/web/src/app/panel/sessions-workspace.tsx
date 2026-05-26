'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    Plus, X, ArrowLeftRight, Terminal, FolderOpen,
    RotateCcw, Loader2, AlertCircle, ArrowRight, ArrowLeft,
    Check, Server, Laptop,
} from 'lucide-react';
import FileManagerPanel, { type RemoteEntry } from '@/components/scp/FileManagerPanel';
import { useSessionsContext, type SessionStatus } from './sessions-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const SSHTerminal = dynamic(() => import('@/components/terminal/SSHTerminal'), { ssr: false });
const LocalTerminal = dynamic(() => import('@/components/terminal/LocalTerminal'), { ssr: false });

// ============================================================================
// TYPES
// ============================================================================

interface ServerItem {
    id: string;
    name: string;
    protocol: string;
    description?: string;
}

// ============================================================================
// SERVER PICKER MODAL
// ============================================================================

function ServerPicker({
    onPick,
    onClose,
    exclude = [],
}: {
    onPick: (server: ServerItem) => void;
    onClose: () => void;
    exclude?: string[];
}) {
    const [servers, setServers] = useState<ServerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');

    useEffect(() => {
        fetch('/api/servers')
            .then(r => r.json())
            .then(d => { if (d.success) setServers(d.data.servers); })
            .finally(() => setLoading(false));
    }, []);

    const filtered = servers
        .filter(s => !exclude.includes(s.id))
        .filter(s => s.name.toLowerCase().includes(query.toLowerCase()));

    const sshServers = filtered.filter(s => s.protocol === 'SSH');
    const otherServers = filtered.filter(s => s.protocol !== 'SSH');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <h3 className="font-semibold">Open Server</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4 shrink-0">
                    <Input
                        autoFocus
                        type="text"
                        placeholder="Search servers…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="bg-secondary border-border text-sm"
                    />
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-4">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : sshServers.length === 0 && otherServers.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-8">No servers found</p>
                    ) : (
                        <>
                            {sshServers.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => onPick(s)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary text-left transition-colors group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                                        <Terminal className="w-4 h-4 text-green-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{s.name}</p>
                                        {s.description && (
                                            <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                                        )}
                                    </div>
                                    <span className="inline-flex items-center text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-md shrink-0">
                                        {s.protocol}
                                    </span>
                                </button>
                            ))}
                            {otherServers.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => onPick(s)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary text-left transition-colors opacity-60"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                                        <Server className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{s.name}</p>
                                    </div>
                                    <span className="inline-flex items-center text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md shrink-0">
                                        {s.protocol}
                                    </span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// TRANSFER PANEL HEADER
// ============================================================================

function TransferPanelHeader({
    label, serverId, setServerId, servers,
}: {
    label: string; serverId: string;
    setServerId: (id: string) => void; servers: ServerItem[];
}) {
    return (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-card border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-10 shrink-0">{label}</span>
            <Select value={serverId} onValueChange={setServerId}>
                <SelectTrigger className="flex-1 bg-secondary border-border text-sm h-8">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                    {servers.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

// ============================================================================
// STATUS DOT
// ============================================================================

function StatusDot({ status }: { status: SessionStatus }) {
    const cls = {
        connecting: 'bg-yellow-400 animate-pulse',
        connected: 'bg-green-400',
        disconnected: 'bg-slate-500',
        error: 'bg-red-400',
        detached: 'bg-amber-400 animate-pulse',
    }[status];
    return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
}

// ============================================================================
// MAIN WORKSPACE
// ============================================================================

export default function SessionsWorkspace() {
    const {
        sessions, activeTabId, setActiveTabId,
        addSession, addLocalSession, removeSession, reconnectSession, renewSession,
        toggleFiles, updateSessionStatus, setSessionError, setSessionWs,
    } = useSessionsContext();

    const [showPicker, setShowPicker] = useState(false);
    const [mode, setMode] = useState<'terminal' | 'transfer'>('terminal');
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        setIsElectron(Boolean(window.electronAPI?.isElectron));
    }, []);

    // Transfer panel state
    const [allServers, setAllServers] = useState<ServerItem[]>([]);
    const [leftServerId, setLeftServerId] = useState('');
    const [rightServerId, setRightServerId] = useState('');
    const [leftSelected, setLeftSelected] = useState<RemoteEntry[]>([]);
    const [leftPath, setLeftPath] = useState('/');
    const [rightSelected, setRightSelected] = useState<RemoteEntry[]>([]);
    const [rightPath, setRightPath] = useState('/');
    const [transferring, setTransferring] = useState(false);
    const [transferLog, setTransferLog] = useState<{ msg: string; ok: boolean }[]>([]);

    // Load server list for transfer dropdowns
    useEffect(() => {
        fetch('/api/servers')
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    setAllServers(d.data.servers);
                    const ssh: ServerItem[] = d.data.servers.filter((s: ServerItem) => s.protocol === 'SSH');
                    if (ssh.length > 0) setLeftServerId(ssh[0].id);
                    if (ssh.length > 1) setRightServerId(ssh[1].id);
                    else if (ssh.length === 1) setRightServerId(ssh[0].id);
                }
            });
    }, []);

    function switchTab(tabId: string) {
        setActiveTabId(tabId);
        setMode('terminal');
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }

    async function doTransfer(direction: 'lr' | 'rl') {
        const fromPaths = direction === 'lr'
            ? leftSelected.filter(e => e.type !== 'dir').map(e => e.path)
            : rightSelected.filter(e => e.type !== 'dir').map(e => e.path);
        const fromServerId = direction === 'lr' ? leftServerId : rightServerId;
        const toServerId = direction === 'lr' ? rightServerId : leftServerId;
        const toPath = direction === 'lr' ? rightPath : leftPath;
        if (fromPaths.length === 0) return;

        setTransferring(true);
        setTransferLog([]);
        try {
            const res = await fetch('/api/servers/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromServerId, fromPaths, toServerId, toPath }),
            });
            const data = await res.json();
            if (data.success) {
                const { ok, failed } = data.data;
                setTransferLog([
                    ...ok.map((p: string) => ({ msg: p.split('/').pop()! + ' — transferred', ok: true })),
                    ...failed.map((f: { path: string; error: string }) => ({
                        msg: f.path.split('/').pop()! + ': ' + f.error, ok: false,
                    })),
                ]);
            } else {
                setTransferLog([{ msg: data.error ?? 'Transfer failed', ok: false }]);
            }
        } catch {
            setTransferLog([{ msg: 'Network error', ok: false }]);
        } finally {
            setTransferring(false);
        }
    }

    const sshServers = allServers.filter(s => s.protocol === 'SSH');

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)]">

            {/* ── Tab bar ── */}
            <div className="shrink-0 flex items-center gap-0 border-b border-border bg-card/60 overflow-x-auto no-scrollbar">
                <div className="flex items-end gap-0 flex-1 min-w-0 overflow-x-auto no-scrollbar">
                    {sessions.length === 0 && (
                        <span className="px-4 py-3 text-sm text-muted-foreground italic">
                            No sessions — click + to open a server
                        </span>
                    )}
                    {sessions.map(session => (
                        <div
                            key={session.tabId}
                            className={`group flex items-center gap-2 px-3 py-2.5 border-b-2 cursor-pointer select-none shrink-0 transition-colors
                                ${activeTabId === session.tabId && mode === 'terminal'
                                    ? 'border-primary bg-secondary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                }`}
                            onClick={() => switchTab(session.tabId)}
                            title={session.status === 'detached' ? 'Session running in background' : undefined}
                        >
                            <StatusDot status={session.status} />
                            {session.type === 'local' && (
                                <Laptop className="w-3 h-3 text-violet-400 shrink-0" />
                            )}
                            <span className="text-sm font-medium max-w-[120px] truncate">
                                {session.serverName}
                            </span>
                            <button
                                onClick={e => { e.stopPropagation(); removeSession(session.tabId); }}
                                className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Close tab"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-1 px-2 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowPicker(true)}
                        className="h-8 w-8"
                        title="Open new server session"
                    >
                        <Plus className="w-4 h-4" />
                    </Button>
                    {isElectron && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { addLocalSession(); setMode('terminal'); }}
                            className="h-8 w-8 text-violet-400 hover:text-violet-300"
                            title="Open local terminal"
                        >
                            <Laptop className="w-4 h-4" />
                        </Button>
                    )}
                    <div className="w-px h-5 bg-border mx-1" />
                    <Button
                        variant={mode === 'transfer' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setMode(m => m === 'transfer' ? 'terminal' : 'transfer')}
                        className={`gap-1.5 text-xs ${mode === 'transfer' ? 'border border-primary/30' : ''}`}
                        title="Toggle transfer mode"
                    >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Transfer</span>
                    </Button>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 min-h-0 pt-3">

                {/* Transfer mode */}
                {mode === 'transfer' && (
                    <div className="flex h-full gap-0">
                        <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-border overflow-hidden">
                            {sshServers.length > 0 && (
                                <TransferPanelHeader
                                    label="From" serverId={leftServerId}
                                    setServerId={id => { setLeftServerId(id); setLeftSelected([]); }}
                                    servers={sshServers}
                                />
                            )}
                            {leftServerId ? (
                                <div className="flex-1 min-h-0">
                                    <FileManagerPanel
                                        key={leftServerId} serverId={leftServerId}
                                        onSelectionChange={(sel, path) => { setLeftSelected(sel); setLeftPath(path); }}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                    <p className="text-sm">No SSH servers available</p>
                                </div>
                            )}
                        </div>

                        {/* Middle controls */}
                        <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-3 px-1">
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    onClick={() => doTransfer('lr')}
                                    disabled={transferring || leftSelected.filter(e => e.type !== 'dir').length === 0}
                                    className="p-2 rounded-lg bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Copy selected → right"
                                >
                                    {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                </button>
                                {leftSelected.filter(e => e.type !== 'dir').length > 0 && (
                                    <span className="text-[10px] text-primary font-medium">
                                        {leftSelected.filter(e => e.type !== 'dir').length}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    onClick={() => doTransfer('rl')}
                                    disabled={transferring || rightSelected.filter(e => e.type !== 'dir').length === 0}
                                    className="p-2 rounded-lg bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Copy selected ← left"
                                >
                                    {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeft className="w-4 h-4" />}
                                </button>
                                {rightSelected.filter(e => e.type !== 'dir').length > 0 && (
                                    <span className="text-[10px] text-primary font-medium">
                                        {rightSelected.filter(e => e.type !== 'dir').length}
                                    </span>
                                )}
                            </div>
                            {transferLog.length > 0 && (
                                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-64 bg-card border border-border rounded-xl shadow-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                                    {transferLog.map((entry, i) => (
                                        <div key={i} className="flex items-start gap-1.5">
                                            {entry.ok
                                                ? <Check className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />
                                                : <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                                            }
                                            <span className={`text-[11px] break-all ${entry.ok ? 'text-muted-foreground' : 'text-red-400'}`}>
                                                {entry.msg}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-border overflow-hidden">
                            {sshServers.length > 0 && (
                                <TransferPanelHeader
                                    label="To" serverId={rightServerId}
                                    setServerId={id => { setRightServerId(id); setRightSelected([]); }}
                                    servers={sshServers}
                                />
                            )}
                            {rightServerId ? (
                                <div className="flex-1 min-h-0">
                                    <FileManagerPanel
                                        key={rightServerId} serverId={rightServerId}
                                        onSelectionChange={(sel, path) => { setRightSelected(sel); setRightPath(path); }}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                    <p className="text-sm">No SSH servers available</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Terminal mode */}
                {mode === 'terminal' && (
                    <>
                        {sessions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center">
                                    <Terminal className="w-7 h-7 text-muted-foreground" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold mb-1">No active sessions</h2>
                                    <p className="text-sm text-muted-foreground">Open a server or start a local terminal</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button onClick={() => setShowPicker(true)} className="gap-2">
                                        <Plus className="w-4 h-4" /> Open Server
                                    </Button>
                                    {isElectron && (
                                        <Button variant="secondary" onClick={() => addLocalSession()} className="gap-2">
                                            <Laptop className="w-4 h-4" /> Local Terminal
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="relative h-full">
                                {sessions.map(session => (
                                    <div
                                        key={session.tabId}
                                        className="absolute inset-0 flex flex-col gap-3"
                                        style={{
                                            visibility: activeTabId === session.tabId ? 'visible' : 'hidden',
                                            pointerEvents: activeTabId === session.tabId ? 'auto' : 'none',
                                        }}
                                    >
                                        {/* Per-tab toolbar */}
                                        <div className="shrink-0 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                {session.type === 'local'
                                                    ? <Laptop className="w-4 h-4 text-violet-400" />
                                                    : <Terminal className="w-4 h-4" />
                                                }
                                                <span>{session.serverName}</span>
                                                <StatusDot status={session.status} />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {session.type !== 'local' && (
                                                    <>
                                                        <Button
                                                            variant={session.showFiles ? 'default' : 'ghost'}
                                                            size="sm"
                                                            onClick={() => toggleFiles(session.tabId)}
                                                            className="gap-1.5 h-8"
                                                            title="Toggle file manager"
                                                        >
                                                            <FolderOpen className="w-3.5 h-3.5" />
                                                            <span className="hidden sm:inline text-xs">Files</span>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => reconnectSession(session.tabId, session.serverId)}
                                                            className="h-8 w-8"
                                                            title="Reconnect"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => removeSession(session.tabId)}
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    title="Close session"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Terminal + optional file panel */}
                                        <div className="flex flex-1 min-h-0 gap-3">
                                            <div className="flex-1 min-w-0 min-h-0">
                                                {session.type === 'local' ? (
                                                    <LocalTerminal
                                                        tabId={session.tabId}
                                                        onReady={() => updateSessionStatus(session.tabId, 'connected')}
                                                        onExit={() => updateSessionStatus(session.tabId, 'disconnected')}
                                                    />
                                                ) : session.status === 'detached' ? (
                                                    <div className="flex items-center justify-center h-full bg-card rounded-xl border border-border">
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                            <span className="text-sm">Restoring session…</span>
                                                        </div>
                                                    </div>
                                                ) : session.status === 'error' || (!session.token && session.status !== 'connecting') ? (
                                                    <div className="flex flex-col items-center justify-center h-full gap-3 bg-card rounded-xl border border-border">
                                                        <AlertCircle className="w-8 h-8 text-destructive" />
                                                        <p className="text-sm text-destructive">Failed to connect</p>
                                                        {session.errorMessage && (
                                                            <p className="text-xs text-muted-foreground max-w-xs text-center px-4 break-words">
                                                                {session.errorMessage}
                                                            </p>
                                                        )}
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => reconnectSession(session.tabId, session.serverId)}
                                                            className="gap-1.5"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" /> Retry
                                                        </Button>
                                                    </div>
                                                ) : !session.token ? (
                                                    <div className="flex items-center justify-center h-full bg-card rounded-xl border border-border">
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                            <span className="text-sm">Connecting…</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <SSHTerminal
                                                        sessionId={session.sessionId}
                                                        serverId={session.serverId}
                                                        connectionToken={session.token}
                                                        gatewayUrl={session.gatewayUrl ?? undefined}
                                                        onDisconnect={() => updateSessionStatus(session.tabId, 'disconnected')}
                                                        onError={(err) => setSessionError(session.tabId, err)}
                                                        onKeyHandlerReady={() => updateSessionStatus(session.tabId, 'connected')}
                                                        onWebSocketCreated={(ws) => setSessionWs(session.tabId, ws)}
                                                        onSessionNotFound={() => renewSession(session.tabId, session.serverId)}
                                                    />
                                                )}
                                            </div>

                                            {session.showFiles && session.type !== 'local' && (
                                                <div className="hidden md:flex w-80 lg:w-96 shrink-0 flex-col rounded-xl border border-border overflow-hidden">
                                                    <FileManagerPanel
                                                        serverId={session.serverId}
                                                        onClose={() => toggleFiles(session.tabId)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Server picker */}
            {showPicker && (
                <ServerPicker
                    onClose={() => setShowPicker(false)}
                    onPick={server => { setShowPicker(false); addSession(server.id, server.name); }}
                    exclude={sessions.map(s => s.serverId)}
                />
            )}
        </div>
    );
}
