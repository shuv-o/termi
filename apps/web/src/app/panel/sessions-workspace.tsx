'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
    Plus, X, ArrowLeftRight, Terminal, FolderOpen,
    RotateCcw, Loader2, AlertCircle, ArrowRight, ArrowLeft,
    Server, Laptop, Maximize2, Minimize2,
    Search, ChevronRight, WifiOff, Globe,
    SplitSquareHorizontal, Monitor, Wifi,
    ArrowRightLeft, RefreshCw, ChevronDown, ChevronUp,
    FileX, CheckCircle2, Clock, Zap,
} from 'lucide-react';
import FileManagerPanel, { type RemoteEntry } from '@/components/scp/FileManagerPanel';
import { useSessionsContext, type Session, type SessionStatus } from './sessions-context';
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
    host?: string;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

function StatusDot({ status, size = 'sm' }: { status: SessionStatus; size?: 'sm' | 'md' }) {
    const cls = {
        connecting: 'bg-yellow-400 animate-pulse',
        connected: 'bg-green-400',
        disconnected: 'bg-slate-500',
        error: 'bg-red-400',
        detached: 'bg-amber-400 animate-pulse',
    }[status];
    const dim = size === 'md' ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5';
    return <span className={`${dim} rounded-full shrink-0 ${cls}`} />;
}

function statusLabel(status: SessionStatus): string {
    return { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected', error: 'Error', detached: 'Restoring…' }[status];
}

function statusColor(status: SessionStatus): string {
    return { connecting: 'text-yellow-400', connected: 'text-green-400', disconnected: 'text-slate-400', error: 'text-red-400', detached: 'text-amber-400' }[status];
}

// ============================================================================
// SERVER PICKER MODAL
// ============================================================================

function ServerPicker({
    onPick, onClose, exclude = [],
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

    useEffect(() => {
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const filtered = servers
        .filter(s => !exclude.includes(s.id))
        .filter(s =>
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            (s.host ?? '').toLowerCase().includes(query.toLowerCase())
        );
    const sshServers = filtered.filter(s => s.protocol === 'SSH');
    const otherServers = filtered.filter(s => s.protocol !== 'SSH');

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <h3 className="font-semibold">Open Terminal Session</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            autoFocus
                            type="text"
                            placeholder="Search by name or host…"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            className="pl-9 bg-secondary border-border text-sm"
                        />
                    </div>
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
                            {sshServers.length > 0 && (
                                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-3 py-2">SSH Servers</p>
                            )}
                            {sshServers.map(s => (
                                <button key={s.id} onClick={() => onPick(s)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary text-left transition-colors group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                                        <Terminal className="w-4 h-4 text-green-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{s.name}</p>
                                        {s.description && <p className="text-xs text-muted-foreground truncate">{s.description}</p>}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                            {otherServers.length > 0 && (
                                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-3 py-2 mt-1">Other Protocols (SSH only)</p>
                            )}
                            {otherServers.map(s => (
                                <button key={s.id} disabled
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left opacity-40 cursor-not-allowed"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                                        <Server className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{s.name}</p>
                                    </div>
                                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md shrink-0">{s.protocol}</span>
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
// TRANSFER MODE — full interactive transfer UI
// ============================================================================

type TransferItemStatus = 'queued' | 'transferring' | 'done' | 'failed';

interface TransferItem {
    id: string;
    name: string;
    path: string;
    size: number;
    status: TransferItemStatus;
    progress: number;
    error?: string;
}

function fmt(bytes: number): string {
    if (!bytes) return '—';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function ServerSelector({ label, serverId, setServerId, servers }: {
    label: string; serverId: string; setServerId: (id: string) => void; servers: ServerItem[];
}) {
    const serverName = servers.find(s => s.id === serverId)?.name ?? serverId;
    return (
        <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0 w-6">{label}</span>
            {serverId ? (
                <Select value={serverId} onValueChange={setServerId}>
                    <SelectTrigger className="h-7 text-xs bg-secondary border-border max-w-[160px]">
                        <SelectValue>{serverName}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                        {servers.map(s => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                <span className="text-xs text-muted-foreground">No SSH servers</span>
            )}
        </div>
    );
}

function QueueItemRow({ item }: { item: TransferItem }) {
    const iconMap: Record<TransferItemStatus, React.ReactNode> = {
        queued:      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
        transferring:<Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />,
        done:        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />,
        failed:      <FileX className="w-3.5 h-3.5 text-red-400 shrink-0" />,
    };
    const barColor: Record<TransferItemStatus, string> = {
        queued: 'bg-slate-600',
        transferring: 'bg-primary',
        done: 'bg-green-500',
        failed: 'bg-red-500',
    };
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary/40 rounded-lg transition-colors">
            {iconMap[item.status]}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs text-foreground truncate font-medium">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{fmt(item.size)}</span>
                </div>
                {(item.status === 'transferring' || item.status === 'queued' || item.status === 'done') && (
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${barColor[item.status]}`}
                            style={{ width: `${item.progress}%` }}
                        />
                    </div>
                )}
                {item.status === 'failed' && item.error && (
                    <p className="text-[10px] text-red-400 truncate mt-0.5">{item.error}</p>
                )}
            </div>
        </div>
    );
}

function TransferMode({ servers }: { servers: ServerItem[] }) {
    const [leftId, setLeftIdRaw] = useState(() => servers[0]?.id ?? '');
    const [rightId, setRightIdRaw] = useState(() => servers[1]?.id ?? servers[0]?.id ?? '');
    const [leftPath, setLeftPath] = useState('/');
    const [rightPath, setRightPath] = useState('/');
    const [leftSelected, setLeftSelected] = useState<RemoteEntry[]>([]);
    const [rightSelected, setRightSelected] = useState<RemoteEntry[]>([]);
    const [queue, setQueue] = useState<TransferItem[]>([]);
    const [queueOpen, setQueueOpen] = useState(true);
    const [activeDir, setActiveDir] = useState<'lr' | 'rl' | null>(null);
    const [mobilePanel, setMobilePanel] = useState<'left' | 'right'>('left');
    const fakeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Sync server ids when server list changes (initial load)
    useEffect(() => {
        if (!leftId && servers.length > 0) setLeftIdRaw(servers[0].id);
        if (!rightId && servers.length > 1) setRightIdRaw(servers[1].id);
        else if (!rightId && servers.length === 1) setRightIdRaw(servers[0].id);
    }, [servers, leftId, rightId]);

    const setLeftId = useCallback((id: string) => {
        setLeftIdRaw(id);
        setLeftSelected([]);
    }, []);
    const setRightId = useCallback((id: string) => {
        setRightIdRaw(id);
        setRightSelected([]);
    }, []);

    const onLeftChange = useCallback((sel: RemoteEntry[], path: string) => {
        setLeftSelected(sel);
        setLeftPath(path);
    }, []);
    const onRightChange = useCallback((sel: RemoteEntry[], path: string) => {
        setRightSelected(sel);
        setRightPath(path);
    }, []);

    function swap() {
        setLeftIdRaw(rightId);
        setRightIdRaw(leftId);
        setLeftSelected([]);
        setRightSelected([]);
    }

    const leftFiles = leftSelected.filter(e => e.type !== 'dir');
    const rightFiles = rightSelected.filter(e => e.type !== 'dir');
    const leftBytes = leftFiles.reduce((s, e) => s + e.size, 0);
    const rightBytes = rightFiles.reduce((s, e) => s + e.size, 0);

    const totalItems = queue.length;
    const doneItems = queue.filter(i => i.status === 'done').length;
    const failedItems = queue.filter(i => i.status === 'failed').length;

    async function doTransfer(direction: 'lr' | 'rl') {
        const files = direction === 'lr' ? leftFiles : rightFiles;
        if (!files.length || activeDir) return;

        const fromServerId = direction === 'lr' ? leftId : rightId;
        const toServerId   = direction === 'lr' ? rightId : leftId;
        const toPath       = direction === 'lr' ? rightPath : leftPath;

        const newItems: TransferItem[] = files.map(f => ({
            id: Math.random().toString(36).slice(2),
            name: f.name,
            path: f.path,
            size: f.size,
            status: 'queued',
            progress: 0,
        }));

        setQueue(prev => [...prev, ...newItems]);
        setQueueOpen(true);
        setActiveDir(direction);

        // Fake progress: ramp all to 85% over ~2s while request is in-flight
        const ids = newItems.map(i => i.id);
        let tick = 0;
        fakeTimerRef.current = setInterval(() => {
            tick += 1;
            setQueue(prev => prev.map(item =>
                ids.includes(item.id) && item.status !== 'done' && item.status !== 'failed'
                    ? { ...item, status: 'transferring', progress: Math.min(85, tick * 8) }
                    : item
            ));
        }, 200);

        try {
            const res = await fetch('/api/servers/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromServerId,
                    fromPaths: files.map(f => f.path),
                    toServerId,
                    toPath,
                }),
            });
            const data = await res.json();

            if (fakeTimerRef.current) clearInterval(fakeTimerRef.current);

            if (data.success) {
                const okSet = new Set<string>(data.data.ok ?? []);
                const failMap = new Map<string, string>(
                    (data.data.failed ?? []).map((f: { path: string; error: string }) => [f.path, f.error])
                );
                setQueue(prev => prev.map(item => {
                    if (!ids.includes(item.id)) return item;
                    if (okSet.has(item.path)) return { ...item, status: 'done', progress: 100 };
                    if (failMap.has(item.path)) return { ...item, status: 'failed', progress: 100, error: failMap.get(item.path) };
                    return item;
                }));
            } else {
                setQueue(prev => prev.map(item =>
                    ids.includes(item.id)
                        ? { ...item, status: 'failed', progress: 100, error: data.error ?? 'Transfer failed' }
                        : item
                ));
            }
        } catch {
            if (fakeTimerRef.current) clearInterval(fakeTimerRef.current);
            setQueue(prev => prev.map(item =>
                ids.includes(item.id)
                    ? { ...item, status: 'failed', progress: 100, error: 'Network error' }
                    : item
            ));
        } finally {
            setActiveDir(null);
        }
    }

    async function retryFailed() {
        const failed = queue.filter(i => i.status === 'failed');
        if (!failed.length || !activeDir === null) return;
        // Re-queue failed items
        setQueue(prev => prev.map(item =>
            item.status === 'failed' ? { ...item, status: 'queued', progress: 0, error: undefined } : item
        ));
    }

    const hasNoServers = servers.length === 0;

    return (
        <div className="absolute inset-0 flex flex-col">
            {/* ── Server selector header ── */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-card/60">
                <ServerSelector label="FROM" serverId={leftId} setServerId={setLeftId} servers={servers} />
                <button
                    onClick={swap}
                    disabled={!!activeDir}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    title="Swap servers"
                >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                </button>
                <ServerSelector label="TO" serverId={rightId} setServerId={setRightId} servers={servers} />
            </div>

            {/* ── File manager panels + transfer controls ── */}

            {/* Mobile: tab bar to switch between left/right panels */}
            <div className="md:hidden shrink-0 flex border-b border-border">
                <button
                    onClick={() => setMobilePanel('left')}
                    className={`flex-1 py-2 text-xs font-medium truncate px-3 transition-colors border-b-2 ${mobilePanel === 'left' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
                >
                    {servers.find(s => s.id === leftId)?.name ?? 'Source'}
                </button>
                <button
                    onClick={() => setMobilePanel('right')}
                    className={`flex-1 py-2 text-xs font-medium truncate px-3 transition-colors border-b-2 ${mobilePanel === 'right' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
                >
                    {servers.find(s => s.id === rightId)?.name ?? 'Destination'}
                </button>
            </div>

            {/* Mobile: single active panel */}
            <div className="md:hidden flex flex-1 min-h-0 overflow-hidden flex-col">
                {hasNoServers ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        <p className="text-sm">No SSH servers available</p>
                    </div>
                ) : mobilePanel === 'left' && leftId ? (
                    <FileManagerPanel key={leftId} serverId={leftId} onSelectionChange={onLeftChange} />
                ) : mobilePanel === 'right' && rightId ? (
                    <FileManagerPanel key={rightId} serverId={rightId} onSelectionChange={onRightChange} />
                ) : null}
            </div>

            {/* Mobile: transfer action bar */}
            <div className="md:hidden shrink-0 flex items-center justify-center gap-3 px-3 py-2 border-t border-border bg-card/60">
                <button
                    onClick={() => doTransfer('rl')}
                    disabled={!!activeDir || rightFiles.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${rightFiles.length > 0 && !activeDir ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-secondary/40 border-border/50 text-muted-foreground opacity-40 cursor-not-allowed'}`}
                >
                    {activeDir === 'rl' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                    Send left {rightFiles.length > 0 ? `(${rightFiles.length})` : ''}
                </button>
                <button
                    onClick={() => doTransfer('lr')}
                    disabled={!!activeDir || leftFiles.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${leftFiles.length > 0 && !activeDir ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-secondary/40 border-border/50 text-muted-foreground opacity-40 cursor-not-allowed'}`}
                >
                    Send right {leftFiles.length > 0 ? `(${leftFiles.length})` : ''}
                    {activeDir === 'lr' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </button>
            </div>

            {/* Desktop: side-by-side panels */}
            <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
                {/* Left panel */}
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {hasNoServers ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <p className="text-sm">No SSH servers available</p>
                        </div>
                    ) : leftId ? (
                        <FileManagerPanel key={leftId} serverId={leftId} onSelectionChange={onLeftChange} />
                    ) : null}
                </div>

                {/* Middle transfer controls */}
                <div className="shrink-0 w-20 flex flex-col items-center justify-center gap-4 border-x border-border bg-card/30 py-4">
                    <div className="flex flex-col items-center gap-1.5">
                        <button
                            onClick={() => doTransfer('lr')}
                            disabled={!!activeDir || leftFiles.length === 0}
                            className={`relative flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all
                                ${leftFiles.length > 0 && !activeDir
                                    ? 'bg-primary/20 border-primary/40 text-primary hover:bg-primary/30 hover:scale-105'
                                    : 'bg-secondary/40 border-border/50 text-muted-foreground opacity-40 cursor-not-allowed'
                                }`}
                            title="Transfer selected → right"
                        >
                            {activeDir === 'lr' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                            {leftFiles.length > 0 && <span className="text-[9px] font-bold leading-none">{leftFiles.length}</span>}
                        </button>
                        {leftFiles.length > 0 && <span className="text-[9px] text-muted-foreground">{fmt(leftBytes)}</span>}
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                        <button
                            onClick={() => doTransfer('rl')}
                            disabled={!!activeDir || rightFiles.length === 0}
                            className={`relative flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all
                                ${rightFiles.length > 0 && !activeDir
                                    ? 'bg-primary/20 border-primary/40 text-primary hover:bg-primary/30 hover:scale-105'
                                    : 'bg-secondary/40 border-border/50 text-muted-foreground opacity-40 cursor-not-allowed'
                                }`}
                            title="Transfer selected ← left"
                        >
                            {activeDir === 'rl' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeft className="w-4 h-4" />}
                            {rightFiles.length > 0 && <span className="text-[9px] font-bold leading-none">{rightFiles.length}</span>}
                        </button>
                        {rightFiles.length > 0 && <span className="text-[9px] text-muted-foreground">{fmt(rightBytes)}</span>}
                    </div>

                    {activeDir && (
                        <div className="flex flex-col items-center gap-1">
                            <Zap className="w-3.5 h-3.5 text-primary animate-pulse" />
                            <span className="text-[9px] text-primary font-medium">Live</span>
                        </div>
                    )}
                </div>

                {/* Right panel */}
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {hasNoServers ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <p className="text-sm">No SSH servers available</p>
                        </div>
                    ) : rightId ? (
                        <FileManagerPanel key={rightId} serverId={rightId} onSelectionChange={onRightChange} />
                    ) : null}
                </div>
            </div>

            {/* ── Transfer queue panel ── */}
            {queue.length > 0 && (
                <div className="shrink-0 border-t border-border bg-card/80">
                    {/* Queue header */}
                    <button
                        className="w-full flex items-center justify-between px-4 py-2 hover:bg-secondary/40 transition-colors"
                        onClick={() => setQueueOpen(o => !o)}
                    >
                        <div className="flex items-center gap-2">
                            {activeDir
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                                : failedItems > 0
                                    ? <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                    : <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            }
                            <span className="text-xs font-medium">
                                Transfer queue
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                {doneItems}/{totalItems} done
                                {failedItems > 0 && <span className="text-red-400 ml-1">· {failedItems} failed</span>}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {failedItems > 0 && !activeDir && (
                                <button
                                    onClick={e => { e.stopPropagation(); retryFailed(); }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/20 border border-primary/30 text-primary text-[10px] font-medium hover:bg-primary/30"
                                >
                                    <RefreshCw className="w-2.5 h-2.5" /> Retry
                                </button>
                            )}
                            {!activeDir && (
                                <button
                                    onClick={e => { e.stopPropagation(); setQueue([]); }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-muted-foreground text-[10px] hover:text-foreground"
                                >
                                    <X className="w-2.5 h-2.5" /> Clear
                                </button>
                            )}
                            {queueOpen
                                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                            }
                        </div>
                    </button>

                    {/* Queue items */}
                    {queueOpen && (
                        <div className="max-h-44 overflow-y-auto px-2 pb-2 space-y-0.5">
                            {queue.map(item => <QueueItemRow key={item.id} item={item} />)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// TERMINAL PANE — single session's terminal content
// Kept as a separate component so the identity is stable (no remounting on
// visibility toggles) and all sessions stay connected simultaneously.
// ============================================================================

function TerminalPane({
    session, isActive, mode,
    updateSessionStatus, setSessionError, setSessionWs,
    reconnectSession, renewSession, toggleFiles, removeSession,
}: {
    session: Session;
    isActive: boolean;
    mode: 'terminal' | 'transfer';
    updateSessionStatus: (tabId: string, status: SessionStatus) => void;
    setSessionError: (tabId: string, error: string | null) => void;
    setSessionWs: (tabId: string, ws: WebSocket | null) => void;
    reconnectSession: (tabId: string, serverId: string) => Promise<void>;
    renewSession: (tabId: string, serverId: string) => Promise<void>;
    toggleFiles: (tabId: string) => void;
    removeSession: (tabId: string) => void;
}) {
    return (
        <div
            className="absolute inset-0 flex flex-col"
            style={{
                visibility: isActive && mode === 'terminal' ? 'visible' : 'hidden',
                pointerEvents: isActive && mode === 'terminal' ? 'auto' : 'none',
            }}
        >
            {/* Per-session toolbar */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-card/30">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {session.type === 'local'
                        ? <Laptop className="w-4 h-4 text-violet-400 shrink-0" />
                        : <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <span className="font-medium text-sm truncate">{session.serverName}</span>
                    <StatusDot status={session.status} />
                    <span className={`text-xs ${statusColor(session.status)}`}>{statusLabel(session.status)}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {session.type !== 'local' && (
                        <>
                            <Button variant={session.showFiles ? 'default' : 'ghost'} size="sm"
                                onClick={() => toggleFiles(session.tabId)}
                                className="gap-1.5 h-7 text-xs" title="Toggle file manager"
                            >
                                <FolderOpen className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Files</span>
                            </Button>
                            <Button variant="ghost" size="icon"
                                onClick={() => reconnectSession(session.tabId, session.serverId)}
                                className="h-7 w-7" title="Reconnect"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                        </>
                    )}
                    <Button variant="ghost" size="icon"
                        onClick={() => removeSession(session.tabId)}
                        className="h-7 w-7 text-destructive/60 hover:text-destructive" title="Close session"
                    >
                        <X className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* Terminal + optional file panel */}
            <div className="flex flex-1 min-h-0">
                <div className="flex-1 min-w-0 min-h-0">
                    {session.type === 'local' ? (
                        <LocalTerminal
                            tabId={session.tabId}
                            onReady={() => updateSessionStatus(session.tabId, 'connected')}
                            onExit={() => updateSessionStatus(session.tabId, 'disconnected')}
                        />
                    ) : session.status === 'detached' ? (
                        <div className="flex items-center justify-center h-full bg-card/20">
                            <div className="flex flex-col items-center gap-3 text-center">
                                <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
                                <div>
                                    <p className="text-sm font-medium">Restoring session…</p>
                                    <p className="text-xs text-muted-foreground mt-1">Reconnecting to {session.serverName}</p>
                                </div>
                            </div>
                        </div>
                    ) : session.status === 'error' || (!session.token && session.status !== 'connecting') ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 bg-card/20">
                            <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                                <WifiOff className="w-6 h-6 text-destructive/70" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium text-destructive">Connection failed</p>
                                {session.errorMessage && (
                                    <p className="text-xs text-muted-foreground mt-1 max-w-xs px-4 break-words">{session.errorMessage}</p>
                                )}
                            </div>
                            <Button variant="secondary" size="sm"
                                onClick={() => reconnectSession(session.tabId, session.serverId)}
                                className="gap-1.5"
                            >
                                <RotateCcw className="w-3.5 h-3.5" /> Retry connection
                            </Button>
                        </div>
                    ) : !session.token ? (
                        <div className="flex items-center justify-center h-full bg-card/20">
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-sm">Establishing connection…</span>
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
                    <div className="hidden md:flex w-72 lg:w-80 xl:w-96 shrink-0 flex-col border-l border-border overflow-hidden">
                        <FileManagerPanel
                            serverId={session.serverId}
                            onClose={() => toggleFiles(session.tabId)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
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
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [sessionSearch, setSessionSearch] = useState('');

    useEffect(() => {
        setIsElectron(Boolean(window.electronAPI?.isElectron));
        // Default sidebar open only on desktop
        setSidebarOpen(window.innerWidth >= 1024);
    }, []);

    const [allServers, setAllServers] = useState<ServerItem[]>([]);

    useEffect(() => {
        fetch('/api/servers')
            .then(r => r.json())
            .then(d => { if (d.success) setAllServers(d.data.servers); });
    }, []);

    const sshServers = useMemo(() => allServers.filter(s => s.protocol === 'SSH'), [allServers]);

    const switchTab = useCallback((tabId: string) => {
        setActiveTabId(tabId);
        setMode('terminal');
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }, [setActiveTabId]);

    const connectedCount = sessions.filter(s => s.status === 'connected').length;
    const filteredSessions = useMemo(() =>
        sessions.filter(s => !sessionSearch || s.serverName.toLowerCase().includes(sessionSearch.toLowerCase())),
        [sessions, sessionSearch]
    );

    // Mobile: subtract top bar (3.5rem = h-14) + bottom nav (4rem = h-16)
    // Desktop (lg+): full viewport height, sidebar handled by padding-left
    const containerHeight = isFullscreen
        ? 'h-screen fixed inset-0 z-[100] bg-background'
        : 'h-[calc(100vh-7.5rem)] lg:h-screen -m-4 lg:-m-8';

    return (
        <div className={`flex flex-col ${containerHeight}`}>

            {/* ── Top toolbar ── */}
            <div className="shrink-0 flex items-center gap-1.5 px-2 py-2 bg-card border-b border-border">
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(o => !o)}
                    className="h-8 w-8 shrink-0" title={sidebarOpen ? 'Hide session list' : 'Show session list'}
                >
                    <SplitSquareHorizontal className="w-4 h-4" />
                </Button>

                <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
                    <Monitor className="w-4 h-4" />
                    <span>
                        <span className="text-foreground font-medium">{sessions.length}</span>
                        <span className="hidden md:inline"> session{sessions.length !== 1 ? 's' : ''}</span>
                    </span>
                    {connectedCount > 0 && (
                        <span className="flex items-center gap-0.5 text-green-400 text-xs">
                            <Wifi className="w-3 h-3" />
                            <span className="hidden md:inline">{connectedCount} live</span>
                        </span>
                    )}
                </div>

                <div className="flex-1" />

                {/* Mode toggle */}
                <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
                    <button onClick={() => setMode('terminal')}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            mode === 'terminal' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Terminal className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Terminal</span>
                    </button>
                    <button onClick={() => setMode('transfer')}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            mode === 'transfer' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Transfer</span>
                    </button>
                </div>

                <Button variant="ghost" size="icon" onClick={() => setShowPicker(true)}
                    className="h-8 w-8" title="Open new server session"
                >
                    <Plus className="w-4 h-4" />
                </Button>

                {isElectron && (
                    <Button variant="ghost" size="icon"
                        onClick={() => { addLocalSession(); setMode('terminal'); }}
                        className="h-8 w-8 text-violet-400 hover:text-violet-300" title="Open local terminal"
                    >
                        <Laptop className="w-4 h-4" />
                    </Button>
                )}

                <Button variant="ghost" size="icon"
                    onClick={() => { setIsFullscreen(f => !f); setTimeout(() => window.dispatchEvent(new Event('resize')), 50); }}
                    className="hidden sm:flex h-8 w-8" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
            </div>

            {/* ── Body: sidebar + content ── */}
            <div className="flex flex-1 min-h-0 relative">

                {/* Mobile backdrop */}
                {sidebarOpen && (
                    <div
                        className="lg:hidden fixed inset-0 z-10 bg-black/60 backdrop-blur-sm"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* ── Session sidebar ── */}
                {sidebarOpen && (
                    <aside className="fixed inset-y-0 left-0 z-20 w-72 flex flex-col border-r border-border bg-card lg:relative lg:inset-auto lg:w-64 lg:shrink-0 lg:z-auto lg:bg-card/40">
                        <div className="p-2 border-b border-border">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input type="text" placeholder="Filter sessions…"
                                    value={sessionSearch} onChange={e => setSessionSearch(e.target.value)}
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
                            {filteredSessions.map(session => {
                                const isActive = activeTabId === session.tabId && mode === 'terminal';
                                return (
                                    <div key={session.tabId}
                                        onClick={() => switchTab(session.tabId)}
                                        className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all select-none ${
                                            isActive
                                                ? 'bg-primary/15 border border-primary/30'
                                                : 'hover:bg-secondary/60 border border-transparent'
                                        }`}
                                    >
                                        <StatusDot status={session.status} size="md" />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                                {session.serverName}
                                            </p>
                                            <p className={`text-[11px] ${statusColor(session.status)}`}>
                                                {session.type === 'local' ? 'Local' : statusLabel(session.status)}
                                            </p>
                                        </div>
                                        <button
                                            onClick={e => { e.stopPropagation(); removeSession(session.tabId); }}
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
                            <button onClick={() => setShowPicker(true)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> New session
                            </button>
                            {isElectron && (
                                <button onClick={() => { addLocalSession(); setMode('terminal'); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-violet-400 hover:text-violet-300 hover:bg-secondary transition-colors"
                                >
                                    <Laptop className="w-3.5 h-3.5" /> Local terminal
                                </button>
                            )}
                            <div className="px-3 py-1.5 rounded-lg bg-secondary/50 flex items-center gap-2">
                                <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                                <p className="text-[10px] text-muted-foreground leading-snug">
                                    Sessions sync across devices
                                </p>
                            </div>
                        </div>
                    </aside>
                )}

                {/* ── Main content panel ── */}
                <div className="flex-1 min-w-0 min-h-0 relative">

                    {/* Transfer mode */}
                    {mode === 'transfer' && <TransferMode servers={sshServers} />}

                    {/* ── Terminal mode ── */}
                    {/* Empty state when no sessions exist */}
                    {mode === 'terminal' && sessions.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center p-8">
                            <div className="w-20 h-20 rounded-2xl bg-secondary border border-border flex items-center justify-center">
                                <Terminal className="w-9 h-9 text-muted-foreground/60" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold mb-2">No active sessions</h2>
                                <p className="text-sm text-muted-foreground max-w-xs">
                                    Start a session to connect to a server. Sessions persist across devices — open from your laptop, continue on your phone.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <Button onClick={() => setShowPicker(true)} className="gap-2">
                                    <Plus className="w-4 h-4" /> Open Server
                                </Button>
                                {isElectron && (
                                    <Button variant="secondary" onClick={() => addLocalSession()} className="gap-2">
                                        <Laptop className="w-4 h-4" /> Local Terminal
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-4 py-2 rounded-full">
                                <Globe className="w-3.5 h-3.5 text-primary" />
                                Sessions sync automatically across all your devices
                            </div>
                        </div>
                    )}

                    {/*
                     * ALL session terminals are rendered here simultaneously, always.
                     * Visibility is toggled with CSS — components never unmount while
                     * a session exists, so WebSocket connections stay alive.
                     */}
                    {sessions.map(session => (
                        <TerminalPane
                            key={session.tabId}
                            session={session}
                            isActive={activeTabId === session.tabId}
                            mode={mode}
                            updateSessionStatus={updateSessionStatus}
                            setSessionError={setSessionError}
                            setSessionWs={setSessionWs}
                            reconnectSession={reconnectSession}
                            renewSession={renewSession}
                            toggleFiles={toggleFiles}
                            removeSession={removeSession}
                        />
                    ))}
                </div>
            </div>

            {/* Server picker */}
            {showPicker && (
                <ServerPicker
                    onClose={() => setShowPicker(false)}
                    onPick={server => {
                        setShowPicker(false);
                        addSession(server.id, server.name);
                        setMode('terminal');
                    }}
                    exclude={sessions.filter(s => s.type === 'remote').map(s => s.serverId)}
                />
            )}
        </div>
    );
}
