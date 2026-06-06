'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Server,
    Terminal,
    FolderOpen,
    Monitor,
    Plus,
    Star,
    MoreVertical,
    Search,
    RefreshCw,
    Layers,
    Pencil,
    Trash2,
    AlertTriangle,
    LayoutGrid,
    List,
    KeyRound,
    Clock,
    Wifi,
    WifiOff,
    Activity,
    Copy,
    Check,
    User,
    HardDrive,
    ArrowDown,
    ArrowUp,
    Cpu,
    MemoryStick,
    ArrowUpDown,
    Zap,
    Tag,
    X,
    Share2,
    UserPlus,
    Loader2,
    Mail,
    Shield,
    Unlink,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSessionsContext } from './sessions-context';
import dynamic from 'next/dynamic';
import type { RevealField } from '@/components/auth/PasskeyRevealModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

const PasskeyRevealModal = dynamic(() => import('@/components/auth/PasskeyRevealModal'), {
    ssr: false,
});

interface ServerItem {
    id: string;
    name: string;
    description?: string;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC';
    tags: string[];
    isFavorite: boolean;
    hasPassword: boolean;
    lastUsedAt: string | null;
    host: string;
    username: string;
    port: number;
    group: {
        id: string;
        name: string;
        color: string | null;
    } | null;
}

interface ServerMetrics {
    reachable: boolean;
    latencyMs?: number;
    cpu?: number;
    cpuModel?: string;
    ram?: { usedBytes: number; totalBytes: number; percent: number; speedMhz?: number };
    disk?: { usedBytes: number; totalBytes: number; percent: number };
    network?: { rxBytes: number; txBytes: number };
    error?: string;
}

type ViewMode = 'grid' | 'list';
type ProtocolFilter = 'all' | 'SSH' | 'SCP' | 'RDP' | 'VNC';

type SortField =
    | 'name'
    | 'lastUsed'
    | 'protocol'
    | 'status'
    | 'cpu'
    | 'ram'
    | 'latency'
    | 'favorite';
type SortDir = 'asc' | 'desc';
interface SortOption {
    field: SortField;
    dir: SortDir;
    label: string;
}

const SORT_OPTIONS: SortOption[] = [
    { field: 'name', dir: 'asc', label: 'Name A → Z' },
    { field: 'name', dir: 'desc', label: 'Name Z → A' },
    { field: 'lastUsed', dir: 'desc', label: 'Recently Used' },
    { field: 'lastUsed', dir: 'asc', label: 'Least Recently Used' },
    { field: 'favorite', dir: 'desc', label: 'Favorites First' },
    { field: 'status', dir: 'asc', label: 'Online First' },
    { field: 'status', dir: 'desc', label: 'Offline First' },
    { field: 'cpu', dir: 'desc', label: 'CPU Usage (High → Low)' },
    { field: 'ram', dir: 'desc', label: 'RAM Usage (High → Low)' },
    { field: 'latency', dir: 'asc', label: 'Latency (Low → High)' },
    { field: 'protocol', dir: 'asc', label: 'Protocol' },
];

const METRICS_TTL = 30_000;

const protocolIcons = {
    SSH: Terminal,
    SCP: FolderOpen,
    RDP: Monitor,
    VNC: Monitor,
};

const protocolVariants: Record<string, string> = {
    SSH: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    SCP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    RDP: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    VNC: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

function formatBytes(bytes: number): string {
    if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function CopyButton({ text, className }: { text: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    const copy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <button
            onClick={copy}
            className={`p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors ${className ?? ''}`}
            title={`Copy ${text}`}
        >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
    );
}

function StatusIndicator({
    metrics,
    loading,
}: {
    metrics: ServerMetrics | null;
    loading: boolean;
}) {
    if (loading)
        return (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
            </span>
        );
    if (!metrics) return null;
    if (!metrics.reachable)
        return (
            <span className="flex items-center gap-1">
                <WifiOff className="w-3 h-3 text-red-400" />
            </span>
        );
    return (
        <span className="flex items-center gap-1">
            <Wifi className="w-3 h-3 text-emerald-400" />
            {metrics.latencyMs != null && (
                <span className="text-[10px] text-emerald-400 tabular-nums">
                    {metrics.latencyMs}ms
                </span>
            )}
        </span>
    );
}

//   Fleet Overview Stats

function FleetStats({
    servers,
    metrics,
    metricsLoading,
    sessions,
}: {
    servers: ServerItem[];
    metrics: Record<string, ServerMetrics | null>;
    metricsLoading: Record<string, boolean>;
    sessions: { serverId: string }[];
}) {
    const metricsReady = servers.length > 0 && !Object.values(metricsLoading).some(Boolean);

    const online = servers.filter((s) => metrics[s.id]?.reachable === true).length;
    const offline = servers.filter((s) => metrics[s.id]?.reachable === false).length;
    const unknown = servers.length - online - offline;

    const latencies = servers
        .map((s) => metrics[s.id]?.latencyMs)
        .filter((l): l is number => l != null);
    const avgLatency =
        latencies.length > 0
            ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
            : null;

    const highCpu = servers.filter((s) => (metrics[s.id]?.cpu ?? 0) >= 80).length;
    const highRam = servers.filter((s) => (metrics[s.id]?.ram?.percent ?? 0) >= 80).length;
    const activeSessions = sessions.length;

    if (servers.length === 0) return null;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Card className="p-3 bg-card border-border">
                <div className="flex items-center gap-2 mb-1">
                    <Server className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                        Total
                    </span>
                </div>
                <p className="text-2xl font-bold tabular-nums">{servers.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">servers</p>
            </Card>

            <Card className="p-3 bg-card border-border">
                <div className="flex items-center gap-2 mb-1">
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                        Online
                    </span>
                </div>
                {metricsReady || online > 0 || offline > 0 ? (
                    <>
                        <p className="text-2xl font-bold tabular-nums text-emerald-400">{online}</p>
                        {offline > 0 && (
                            <p className="text-[10px] text-red-400 mt-0.5">{offline} offline</p>
                        )}
                        {offline === 0 && unknown === 0 && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                all reachable
                            </p>
                        )}
                        {unknown > 0 && offline === 0 && (
                            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                                {unknown} checking…
                            </p>
                        )}
                    </>
                ) : (
                    <Skeleton className="h-6 w-8 mt-0.5" />
                )}
            </Card>

            <Card className="p-3 bg-card border-border">
                <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                        Avg Latency
                    </span>
                </div>
                {avgLatency != null ? (
                    <>
                        <p
                            className={`text-2xl font-bold tabular-nums ${avgLatency < 50 ? 'text-emerald-400' : avgLatency < 150 ? 'text-yellow-400' : 'text-red-400'}`}
                        >
                            {avgLatency}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">ms</p>
                    </>
                ) : (
                    <Skeleton className="h-6 w-12 mt-0.5" />
                )}
            </Card>

            <Card className="p-3 bg-card border-border">
                <div className="flex items-center gap-2 mb-1">
                    <Cpu className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                        High CPU
                    </span>
                </div>
                <p
                    className={`text-2xl font-bold tabular-nums ${highCpu > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}
                >
                    {highCpu}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">≥ 80%</p>
            </Card>

            <Card className="p-3 bg-card border-border">
                <div className="flex items-center gap-2 mb-1">
                    <MemoryStick className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                        High RAM
                    </span>
                </div>
                <p
                    className={`text-2xl font-bold tabular-nums ${highRam > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}
                >
                    {highRam}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">≥ 80%</p>
            </Card>

            <Card className="p-3 bg-card border-border">
                <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                        Sessions
                    </span>
                </div>
                <p
                    className={`text-2xl font-bold tabular-nums ${activeSessions > 0 ? 'text-primary' : 'text-muted-foreground'}`}
                >
                    {activeSessions}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">active</p>
            </Card>
        </div>
    );
}

//   Fleet Alert Banner

function FleetAlerts({
    servers,
    metrics,
    onSelectServer,
}: {
    servers: ServerItem[];
    metrics: Record<string, ServerMetrics | null>;
    onSelectServer: (id: string) => void;
}) {
    const offline = servers.filter((s) => metrics[s.id]?.reachable === false);
    const highLoad = servers.filter((s) => {
        const m = metrics[s.id];
        return m?.reachable && ((m.cpu ?? 0) >= 90 || (m.ram?.percent ?? 0) >= 90);
    });

    if (offline.length === 0 && highLoad.length === 0) return null;

    return (
        <div className="mb-5 space-y-2">
            {offline.map((s) => (
                <div
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20 text-sm cursor-pointer hover:bg-red-500/12 transition-colors"
                    onClick={() => onSelectServer(s.id)}
                >
                    <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="font-medium text-red-400 truncate">{s.name}</span>
                    <span className="text-red-400/60 text-xs shrink-0">is offline</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/40 font-mono hidden sm:block">
                        {s.host}
                    </span>
                </div>
            ))}
            {highLoad.map((s) => {
                const m = metrics[s.id]!;
                return (
                    <div
                        key={s.id}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 text-sm cursor-pointer hover:bg-amber-500/12 transition-colors"
                        onClick={() => onSelectServer(s.id)}
                    >
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="font-medium text-amber-300">{s.name}</span>
                        <span className="text-amber-400/60 text-xs">high resource usage</span>
                        <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground/60">
                            {(m.cpu ?? 0) >= 90 && <span>CPU {m.cpu}%</span>}
                            {(m.ram?.percent ?? 0) >= 90 && (
                                <span>RAM {Math.round(m.ram!.percent)}%</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

//   Share Modal                               ─

interface ShareData {
    shares: { id: string; permissions: string; sharedWith: { id: string; email: string } }[];
    pending: { id: string; inviteeEmail: string; permissions: string; expiresAt: string }[];
}

function ShareModal({ server, onClose }: { server: ServerItem; onClose: () => void }) {
    const [email, setEmail] = useState('');
    const [permissions, setPermissions] = useState<'connect' | 'manage'>('connect');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [data, setData] = useState<ShareData | null>(null);
    const [loadingShares, setLoadingShares] = useState(true);

    useEffect(() => {
        fetch(`/api/servers/${server.id}/shares`)
            .then((r) => r.json())
            .then((d) => {
                if (d.success) setData(d.data);
            })
            .finally(() => setLoadingShares(false));
    }, [server.id]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setSending(true);
        try {
            const res = await fetch(`/api/servers/${server.id}/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), permissions }),
            });
            const d = await res.json();
            if (!d.success) {
                setError(d.error || 'Failed to send invitation');
                return;
            }
            setSuccess(`Invitation sent to ${email.trim()}`);
            setEmail('');
            // Refresh share list
            const sharesRes = await fetch(`/api/servers/${server.id}/shares`);
            const sharesData = await sharesRes.json();
            if (sharesData.success) setData(sharesData.data);
        } finally {
            setSending(false);
        }
    };

    const handleRevoke = async (id: string, isInvitation = false) => {
        const shareId = isInvitation ? `inv:${id}` : id;
        await fetch(`/api/servers/${server.id}/shares/${shareId}`, { method: 'DELETE' });
        setData((prev) =>
            prev
                ? {
                      shares: isInvitation ? prev.shares : prev.shares.filter((s) => s.id !== id),
                      pending: isInvitation
                          ? prev.pending.filter((p) => p.id !== id)
                          : prev.pending,
                  }
                : null,
        );
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="bg-card border-border max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2.5">
                        <Share2 className="w-4 h-4 text-primary" />
                        Share &quot;{server.name}&quot;
                    </DialogTitle>
                </DialogHeader>

                {/* Invite form */}
                <form onSubmit={handleInvite} className="space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                            Invite by email
                        </label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input
                                    type="email"
                                    placeholder="colleague@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full pl-8 pr-3 py-2 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                                />
                            </div>
                            <Button type="submit" size="sm" disabled={sending || !email.trim()}>
                                {sending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <UserPlus className="w-3.5 h-3.5" />
                                )}
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                            Access level
                        </label>
                        <div className="flex bg-secondary rounded-lg p-0.5 gap-0.5">
                            {(['connect', 'manage'] as const).map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPermissions(p)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                                        permissions === p
                                            ? 'bg-primary text-white'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {p === 'connect' ? 'Connect only' : 'Full manage'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-xs text-red-400">{error}</p>}
                    {success && <p className="text-xs text-emerald-400">{success}</p>}
                </form>

                {/* Current shares */}
                {loadingShares ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                ) : (data?.shares.length || 0) + (data?.pending.length || 0) > 0 ? (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Shared with
                        </p>

                        {data?.shares.map((share) => (
                            <div
                                key={share.id}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/60 border border-border/50"
                            >
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-medium text-xs shrink-0">
                                    {share.sharedWith.email[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">
                                        {share.sharedWith.email}
                                    </p>
                                    <p className="text-[10px] text-emerald-400">
                                        Active · {share.permissions}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRevoke(share.id)}
                                    className="text-muted-foreground/50 hover:text-red-400 transition-colors"
                                    title="Revoke access"
                                >
                                    <Unlink className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}

                        {data?.pending.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/40 border border-border/40 opacity-70"
                            >
                                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground shrink-0">
                                    <Mail className="w-3.5 h-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">
                                        {inv.inviteeEmail}
                                    </p>
                                    <p className="text-[10px] text-yellow-400">
                                        Pending invitation · {inv.permissions}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRevoke(inv.id, true)}
                                    className="text-muted-foreground/50 hover:text-red-400 transition-colors"
                                    title="Cancel invitation"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 py-4 text-center">
                        <Shield className="w-8 h-8 text-muted-foreground/20" />
                        <p className="text-xs text-muted-foreground">Not shared with anyone yet</p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

//   Grid Card                                ─

function GridCard({
    server,
    m,
    mLoading,
    hasSession,
    onFavorite,
    onEdit,
    onDelete,
    onCopyPassword,
    onConnect,
    onSessions,
    onTagClick,
    onShare,
}: {
    server: ServerItem;
    m: ServerMetrics | null;
    mLoading: boolean;
    hasSession: boolean;
    onFavorite: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopyPassword: () => void;
    onConnect: () => void;
    onSessions: () => void;
    onTagClick: (tag: string) => void;
    onShare: () => void;
}) {
    const Icon = protocolIcons[server.protocol];
    const hasMetrics = server.protocol === 'SSH' && m && m.reachable && !m.error;
    const statusStrip = mLoading
        ? ''
        : m?.reachable === true
          ? 'bg-emerald-500/60'
          : m?.reachable === false
            ? 'bg-red-500/60'
            : '';

    return (
        <Card className="group flex flex-col overflow-hidden bg-card border-border hover:border-border/80 hover:shadow-lg hover:shadow-black/20 transition-all duration-200">
            <div className={`h-0.5 w-full transition-colors duration-500 ${statusStrip}`} />

            <div className="p-3 flex-1 space-y-2">
                {/* Header */}
                <div className="flex items-center gap-2">
                    <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${protocolVariants[server.protocol]}`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="font-semibold truncate text-sm leading-tight">
                                {server.name}
                            </h3>
                            {mLoading ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse shrink-0" />
                            ) : m?.reachable === true ? (
                                m.latencyMs != null && (
                                    <span className="text-[10px] text-emerald-400 tabular-nums shrink-0">
                                        {m.latencyMs}ms
                                    </span>
                                )
                            ) : m?.reachable === false ? (
                                <WifiOff className="w-3 h-3 text-red-400 shrink-0" />
                            ) : null}
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 font-mono truncate">
                            {server.description || `${server.username}@${server.host}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onFavorite}
                            className={`h-6 w-6 transition-all ${server.isFavorite ? 'text-yellow-400' : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-yellow-400 [@media(hover:none)]:opacity-100'}`}
                        >
                            <Star
                                className={`w-3 h-3 ${server.isFavorite ? 'fill-yellow-400' : ''}`}
                            />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-foreground [@media(hover:none)]:opacity-100"
                                >
                                    <MoreVertical className="w-3 h-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 bg-card border-border">
                                <DropdownMenuItem asChild>
                                    <Link
                                        href={`/panel/servers/${server.id}`}
                                        className="flex items-center gap-2"
                                    >
                                        <Activity className="w-3.5 h-3.5 text-muted-foreground" />{' '}
                                        Details
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={onEdit} className="gap-2">
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={onShare} className="gap-2">
                                    <Share2 className="w-3.5 h-3.5 text-muted-foreground" /> Share
                                </DropdownMenuItem>
                                {server.hasPassword && (
                                    <DropdownMenuItem onClick={onCopyPassword} className="gap-2">
                                        <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />{' '}
                                        Copy Password
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem
                                    onClick={onDelete}
                                    className="gap-2 text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Connection info */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/60 border border-border/50 min-w-0">
                    <span className="text-[10px] text-foreground/70 font-mono truncate flex-1">
                        {server.host}
                        <span className="text-muted-foreground/40">:{server.port}</span>
                    </span>
                    <CopyButton text={`${server.host}:${server.port}`} />
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-1">
                    <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${protocolVariants[server.protocol]}`}
                    >
                        {server.protocol}
                    </span>
                    {server.group && (
                        <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                            style={{
                                backgroundColor: `${server.group.color}20`,
                                color: server.group.color || undefined,
                                borderColor: `${server.group.color}40`,
                            }}
                        >
                            {server.group.name}
                        </span>
                    )}
                    {server.tags.slice(0, 2).map((tag) => (
                        <button
                            key={tag}
                            onClick={(e) => {
                                e.stopPropagation();
                                onTagClick(tag);
                            }}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 hover:text-foreground transition-colors"
                        >
                            {tag}
                        </button>
                    ))}
                </div>

                {/* Metrics — 3-col CPU / RAM / Disk */}
                {hasMetrics && (
                    <div className="grid grid-cols-3 gap-1.5">
                        {m!.cpu != null && (
                            <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground/60">CPU</span>
                                    <span
                                        className={`tabular-nums font-medium ${m!.cpu >= 90 ? 'text-red-400' : m!.cpu >= 70 ? 'text-yellow-400' : 'text-emerald-400'}`}
                                    >
                                        {m!.cpu}%
                                    </span>
                                </div>
                                <div className="h-0.5 bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${m!.cpu >= 90 ? 'bg-red-500' : m!.cpu >= 70 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.min(100, m!.cpu)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        {m!.ram && (
                            <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground/60">RAM</span>
                                    <span
                                        className={`tabular-nums font-medium ${m!.ram.percent >= 90 ? 'text-red-400' : m!.ram.percent >= 70 ? 'text-yellow-400' : 'text-sky-400'}`}
                                    >
                                        {Math.round(m!.ram.percent)}%
                                    </span>
                                </div>
                                <div className="h-0.5 bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${m!.ram.percent >= 90 ? 'bg-red-500' : m!.ram.percent >= 70 ? 'bg-yellow-500' : 'bg-sky-500'}`}
                                        style={{ width: `${Math.min(100, m!.ram.percent)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        {m!.disk && (
                            <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-muted-foreground/60">Disk</span>
                                    <span
                                        className={`tabular-nums font-medium ${m!.disk.percent >= 90 ? 'text-red-400' : m!.disk.percent >= 70 ? 'text-yellow-400' : 'text-muted-foreground'}`}
                                    >
                                        {Math.round(m!.disk.percent)}%
                                    </span>
                                </div>
                                <div className="h-0.5 bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${m!.disk.percent >= 90 ? 'bg-red-500' : m!.disk.percent >= 70 ? 'bg-yellow-500' : 'bg-muted-foreground/30'}`}
                                        style={{ width: `${Math.min(100, m!.disk.percent)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer info */}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span>{formatRelativeTime(server.lastUsedAt)}</span>
                    {m?.network && (
                        <>
                            <span className="text-muted-foreground/30 mx-0.5">·</span>
                            <ArrowDown className="w-2 h-2 text-emerald-500/60" />
                            <span className="tabular-nums">{formatBytes(m.network.rxBytes)}</span>
                            <ArrowUp className="w-2 h-2 text-sky-400/60" />
                            <span className="tabular-nums">{formatBytes(m.network.txBytes)}</span>
                        </>
                    )}
                </div>
            </div>

            <div className="px-3 py-2 border-t border-border/60 bg-secondary/20 flex gap-1.5">
                <Button onClick={onConnect} size="sm" className="flex-1 justify-center text-xs h-7">
                    Connect
                </Button>
                {server.hasPassword && (
                    <Button
                        onClick={onCopyPassword}
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Copy password (passkey required)"
                    >
                        <KeyRound className="w-3 h-3" />
                    </Button>
                )}
                {server.protocol === 'SSH' && (
                    <Button
                        onClick={onSessions}
                        variant="secondary"
                        size="icon"
                        className={`h-7 w-7 shrink-0 transition-colors ${hasSession ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30' : 'text-muted-foreground hover:text-foreground'}`}
                        title={hasSession ? 'Session active — open in Sessions' : 'Add to Sessions'}
                    >
                        <div className="relative">
                            <Layers className="w-3 h-3" />
                            {hasSession && (
                                <span className="absolute -top-0.5 -right-0.5 w-1 h-1 rounded-full bg-emerald-400" />
                            )}
                        </div>
                    </Button>
                )}
            </div>
        </Card>
    );
}

//   List Row

function ListRow({
    server,
    m,
    mLoading,
    hasSession,
    onFavorite,
    onEdit,
    onDelete,
    onCopyPassword,
    onConnect,
    onSessions,
    onTagClick,
    onShare,
}: {
    server: ServerItem;
    m: ServerMetrics | null;
    mLoading: boolean;
    hasSession: boolean;
    onFavorite: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopyPassword: () => void;
    onConnect: () => void;
    onSessions: () => void;
    onTagClick: (tag: string) => void;
    onShare: () => void;
}) {
    const Icon = protocolIcons[server.protocol];

    return (
        <div className="group flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
            <div
                className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border ${protocolVariants[server.protocol]}`}
            >
                <Icon className="w-3.5 h-3.5" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{server.name}</span>
                    <StatusIndicator metrics={m} loading={mLoading} />
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[11px] text-muted-foreground font-mono truncate">
                        {server.username}@{server.host}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40 shrink-0">
                        :{server.port}
                    </span>
                    <CopyButton text={`${server.host}:${server.port}`} />
                </div>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                {server.group && (
                    <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
                        style={{
                            backgroundColor: `${server.group.color}20`,
                            color: server.group.color || undefined,
                            borderColor: `${server.group.color}40`,
                        }}
                    >
                        {server.group.name}
                    </span>
                )}
                {server.tags.slice(0, 2).map((tag) => (
                    <button
                        key={tag}
                        onClick={() => onTagClick(tag)}
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 hover:text-foreground transition-colors"
                    >
                        {tag}
                    </button>
                ))}
            </div>

            {server.protocol === 'SSH' && m && m.reachable && !m.error && (
                <div className="hidden xl:flex items-center gap-4 shrink-0">
                    {m.cpu != null && (
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1 text-[10px] tabular-nums">
                                <Cpu className="w-3 h-3 text-muted-foreground/50" />
                                <span
                                    className={
                                        m.cpu >= 90
                                            ? 'text-red-400'
                                            : m.cpu >= 70
                                              ? 'text-yellow-400'
                                              : 'text-muted-foreground'
                                    }
                                >
                                    {m.cpu}%
                                </span>
                            </div>
                            {m.cpuModel && (
                                <span
                                    className="text-[9px] text-muted-foreground/40 truncate max-w-[160px]"
                                    title={m.cpuModel}
                                >
                                    {m.cpuModel}
                                </span>
                            )}
                        </div>
                    )}
                    {m.ram && (
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                                <MemoryStick className="w-3 h-3 text-muted-foreground/50" />
                                {formatBytes(m.ram.usedBytes)}
                                <span className="text-muted-foreground/30">
                                    /{formatBytes(m.ram.totalBytes)}
                                </span>
                            </div>
                            {m.ram.speedMhz && (
                                <span className="text-[9px] text-muted-foreground/40">
                                    {m.ram.speedMhz} MT/s
                                </span>
                            )}
                        </div>
                    )}
                    {m.disk && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                            <HardDrive className="w-3 h-3 text-muted-foreground/50" />
                            {formatBytes(m.disk.usedBytes)}
                            <span className="text-muted-foreground/30">
                                /{formatBytes(m.disk.totalBytes)}
                            </span>
                        </div>
                    )}
                </div>
            )}

            <div className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground/40 w-16 shrink-0 justify-end">
                {formatRelativeTime(server.lastUsedAt)}
            </div>

            <div className="flex items-center gap-1 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onFavorite}
                    className={`h-9 w-9 sm:h-7 sm:w-7 transition-all ${server.isFavorite ? 'text-yellow-400' : 'text-muted-foreground/30 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100 hover:text-yellow-400'}`}
                >
                    <Star className={`w-3.5 h-3.5 ${server.isFavorite ? 'fill-yellow-400' : ''}`} />
                </Button>
                {server.hasPassword && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCopyPassword}
                        className="h-9 w-9 sm:h-7 sm:w-7 text-muted-foreground/50 hover:text-primary [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100"
                        title="Copy password (passkey required)"
                    >
                        <KeyRound className="w-3.5 h-3.5" />
                    </Button>
                )}
                <Button onClick={onConnect} size="sm" className="text-xs h-9 sm:h-7 px-3 sm:px-2.5">
                    Connect
                </Button>
                {server.protocol === 'SSH' && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onSessions}
                        className={`h-9 sm:h-7 px-2.5 text-xs gap-1.5 transition-all ${
                            hasSession
                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title={hasSession ? 'Session active — open in Sessions' : 'Add to Sessions'}
                    >
                        <div className="relative">
                            <Layers className="w-3.5 h-3.5" />
                            {hasSession && (
                                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            )}
                        </div>
                        <span className="hidden sm:inline">Sessions</span>
                    </Button>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 sm:h-7 sm:w-7 text-muted-foreground/50 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100 hover:text-foreground"
                        >
                            <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 bg-card border-border">
                        <DropdownMenuItem asChild>
                            <Link
                                href={`/panel/servers/${server.id}`}
                                className="flex items-center gap-2"
                            >
                                <Activity className="w-3.5 h-3.5 text-muted-foreground" /> Details
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onEdit} className="gap-2">
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onShare} className="gap-2">
                            <Share2 className="w-3.5 h-3.5 text-muted-foreground" /> Share
                        </DropdownMenuItem>
                        {server.hasPassword && (
                            <DropdownMenuItem onClick={onCopyPassword} className="gap-2">
                                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> Copy
                                Password
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                            onClick={onDelete}
                            className="gap-2 text-destructive focus:text-destructive"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

//   Main Page                                ─

export default function DashboardPage() {
    const router = useRouter();
    const { addSession, sessions } = useSessionsContext();

    const [servers, setServers] = useState<ServerItem[]>([]);
    const [sharedServers, setSharedServers] = useState<
        (ServerItem & { sharedBy: string; permissions: string })[]
    >([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');
    const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all');
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [metrics, setMetrics] = useState<Record<string, ServerMetrics | null>>({});
    const [metricsLoading, setMetricsLoading] = useState<Record<string, boolean>>({});
    const [deleteConfirm, setDeleteConfirm] = useState<ServerItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [revealTarget, setRevealTarget] = useState<{
        server: ServerItem;
        field: RevealField;
    } | null>(null);
    const [shareTarget, setShareTarget] = useState<ServerItem | null>(null);
    const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
        field: 'name',
        dir: 'asc',
    });
    const metricsCacheRef = useRef<Record<string, { data: ServerMetrics; fetchedAt: number }>>({});

    useEffect(() => {
        const v = localStorage.getItem('panel-view') as ViewMode | null;
        if (v === 'grid' || v === 'list') setViewMode(v);
        const s = localStorage.getItem('panel-sort');
        if (s) {
            try {
                setSort(JSON.parse(s));
            } catch {
                /* ignore */
            }
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    const switchView = (v: ViewMode) => {
        setViewMode(v);
        localStorage.setItem('panel-view', v);
    };
    const applySort = (field: SortField, dir: SortDir) => {
        setSort({ field, dir });
        localStorage.setItem('panel-sort', JSON.stringify({ field, dir }));
    };

    const fetchServers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (debouncedSearchQuery) params.set('q', debouncedSearchQuery);
            if (filter === 'favorites') params.set('favorites', 'true');
            const response = await fetch(`/api/servers?${params}`);
            const data = await response.json();
            if (data.success) setServers(data.data.servers);
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMetrics = useCallback(async (serverList: ServerItem[], force = false) => {
        if (serverList.length === 0) return;
        const now = Date.now();

        serverList.forEach((s) => {
            const cached = metricsCacheRef.current[s.id];
            if (cached && now - cached.fetchedAt < METRICS_TTL) {
                setMetrics((prev) => ({ ...prev, [s.id]: cached.data }));
            }
        });

        const toFetch = serverList.filter((s) => {
            const cached = metricsCacheRef.current[s.id];
            return force || !cached || now - cached.fetchedAt >= METRICS_TTL;
        });
        if (toFetch.length === 0) return;

        const ls: Record<string, boolean> = {};
        toFetch.forEach((s) => {
            ls[s.id] = true;
        });
        setMetricsLoading(ls);

        await Promise.all(
            toFetch.map(async (server, i) => {
                await new Promise((r) => setTimeout(r, i * 80));
                try {
                    const res = await fetch(`/api/servers/${server.id}/metrics`);
                    const data = await res.json();
                    if (data.success) {
                        metricsCacheRef.current[server.id] = {
                            data: data.data.metrics,
                            fetchedAt: Date.now(),
                        };
                        setMetrics((prev) => ({ ...prev, [server.id]: data.data.metrics }));
                    }
                } catch {
                    setMetrics((prev) => ({ ...prev, [server.id]: null }));
                } finally {
                    setMetricsLoading((prev) => ({ ...prev, [server.id]: false }));
                }
            }),
        );
    }, []);

    useEffect(() => {
        fetchServers();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchServers is stable; re-fetch only on search/filter changes
    }, [debouncedSearchQuery, filter]);
    useEffect(() => {
        fetch('/api/shared-servers')
            .then((r) => r.json())
            .then((d) => {
                if (d.success) setSharedServers(d.data.servers);
            })
            .catch(() => {});
    }, []);
    useEffect(() => {
        if (!loading && servers.length > 0) fetchMetrics(servers);
    }, [loading, servers, fetchMetrics]);
    useEffect(() => {
        if (servers.length === 0) return;
        const id = setInterval(() => fetchMetrics(servers), METRICS_TTL);
        return () => clearInterval(id);
    }, [servers, fetchMetrics]);

    // All unique tags across all servers
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        servers.forEach((s) => s.tags.forEach((t) => tagSet.add(t)));
        return Array.from(tagSet).sort();
    }, [servers]);

    // Apply protocol + tag filters client-side (search/favorites are server-side)
    const filteredServers = useMemo(() => {
        return servers.filter((s) => {
            if (protocolFilter !== 'all' && s.protocol !== protocolFilter) return false;
            if (activeTag && !s.tags.includes(activeTag)) return false;
            return true;
        });
    }, [servers, protocolFilter, activeTag]);

    const sortedServers = useMemo(
        () =>
            [...filteredServers].sort((a, b) => {
                const ma = metrics[a.id];
                const mb = metrics[b.id];
                switch (sort.field) {
                    case 'name':
                        return sort.dir === 'asc'
                            ? a.name.localeCompare(b.name)
                            : b.name.localeCompare(a.name);
                    case 'protocol':
                        return sort.dir === 'asc'
                            ? a.protocol.localeCompare(b.protocol)
                            : b.protocol.localeCompare(a.protocol);
                    case 'lastUsed': {
                        const ta = a.lastUsedAt ? +new Date(a.lastUsedAt) : 0;
                        const tb = b.lastUsedAt ? +new Date(b.lastUsedAt) : 0;
                        return sort.dir === 'asc' ? ta - tb : tb - ta;
                    }
                    case 'favorite': {
                        const fa = a.isFavorite ? 1 : 0;
                        const fb = b.isFavorite ? 1 : 0;
                        return sort.dir === 'desc' ? fb - fa : fa - fb;
                    }
                    case 'status': {
                        const ra = ma?.reachable ? 1 : 0;
                        const rb = mb?.reachable ? 1 : 0;
                        return sort.dir === 'asc' ? rb - ra : ra - rb;
                    }
                    case 'cpu': {
                        const ca = ma?.cpu ?? -1;
                        const cb = mb?.cpu ?? -1;
                        return sort.dir === 'desc' ? cb - ca : ca - cb;
                    }
                    case 'ram': {
                        const ra = ma?.ram?.percent ?? -1;
                        const rb = mb?.ram?.percent ?? -1;
                        return sort.dir === 'desc' ? rb - ra : ra - rb;
                    }
                    case 'latency': {
                        const la = ma?.latencyMs ?? Infinity;
                        const lb = mb?.latencyMs ?? Infinity;
                        return sort.dir === 'asc' ? la - lb : lb - la;
                    }
                    default:
                        return 0;
                }
            }),
        [filteredServers, sort, metrics],
    );

    const toggleFavorite = async (serverId: string) => {
        const server = servers.find((s) => s.id === serverId);
        if (!server) return;
        await fetch(`/api/servers/${serverId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isFavorite: !server.isFavorite }),
        });
        setServers(
            servers.map((s) => (s.id === serverId ? { ...s, isFavorite: !s.isFavorite } : s)),
        );
    };

    const openInSessions = async (server: ServerItem) => {
        const alreadyOpen = sessions.some((s) => s.serverId === server.id);
        if (!alreadyOpen) await addSession(server.id, server.name);
        router.push('/panel/sessions');
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/servers/${deleteConfirm.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setServers((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
                setMetrics((prev) => {
                    const next = { ...prev };
                    delete next[deleteConfirm.id];
                    return next;
                });
                setDeleteConfirm(null);
            }
        } finally {
            setDeleting(false);
        }
    };

    const currentSortLabel =
        SORT_OPTIONS.find((o) => o.field === sort.field && o.dir === sort.dir)?.label ?? 'Sort';

    const handleTagClick = (tag: string) => {
        setActiveTag((prev) => (prev === tag ? null : tag));
    };

    const sharedProps = (server: ServerItem) => ({
        server,
        m: metrics[server.id] ?? null,
        mLoading: metricsLoading[server.id] ?? false,
        hasSession: sessions.some((s) => s.serverId === server.id),
        onFavorite: () => toggleFavorite(server.id),
        onEdit: () => router.push(`/panel/servers/${server.id}/edit`),
        onDelete: () => setDeleteConfirm(server),
        onCopyPassword: () => setRevealTarget({ server, field: 'password' }),
        onConnect: () =>
            router.push(`/panel/connect/${server.id}/${server.protocol.toLowerCase()}`),
        onSessions: () => openInSessions(server),
        onTagClick: handleTagClick,
        onShare: () => setShareTarget(server),
    });

    // Protocol counts for filter buttons
    const protocolCounts = useMemo(() => {
        const base = servers.filter((s) => {
            if (filter === 'favorites' && !s.isFavorite) return false;
            if (activeTag && !s.tags.includes(activeTag)) return false;
            return true;
        });
        return {
            all: base.length,
            SSH: base.filter((s) => s.protocol === 'SSH').length,
            SCP: base.filter((s) => s.protocol === 'SCP').length,
            RDP: base.filter((s) => s.protocol === 'RDP').length,
            VNC: base.filter((s) => s.protocol === 'VNC').length,
        };
    }, [servers, filter, activeTag]);

    const showProtocolFilters = Object.values({
        SSH: protocolCounts.SSH,
        SCP: protocolCounts.SCP,
        RDP: protocolCounts.RDP,
        VNC: protocolCounts.VNC,
    }).some((c) => c > 0);

    return (
        <>
            <div className="max-w-6xl mx-auto">
                {/*   Header   */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-xl font-bold">Servers</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {servers.length > 0
                                ? `${servers.length} server${servers.length === 1 ? '' : 's'}${filteredServers.length !== servers.length ? ` · ${filteredServers.length} shown` : ''}`
                                : 'Manage and connect to your servers'}
                        </p>
                    </div>
                    <Button asChild>
                        <Link href="/panel/servers/new">
                            <Plus className="w-4 h-4" /> Add Server
                        </Link>
                    </Button>
                </div>

                {/*   Fleet Overview Stats   */}
                <FleetStats
                    servers={servers}
                    metrics={metrics}
                    metricsLoading={metricsLoading}
                    sessions={sessions}
                />

                {/*   Fleet Alerts   */}
                {!loading && (
                    <FleetAlerts
                        servers={servers}
                        metrics={metrics}
                        onSelectServer={(id) => router.push(`/panel/servers/${id}`)}
                    />
                )}

                {/*   Search + Filters   */}
                <div className="flex flex-col gap-3 mb-5">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search servers..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-9 text-sm h-9 bg-secondary border-border"
                            />
                            {searchQuery !== debouncedSearchQuery && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 animate-spin" />
                            )}
                        </div>

                        <div className="flex gap-2 shrink-0 flex-wrap">
                            <Button
                                onClick={() => setFilter('all')}
                                variant={filter === 'all' ? 'default' : 'secondary'}
                                size="sm"
                                className="h-9 px-3 text-xs"
                            >
                                All
                            </Button>
                            <Button
                                onClick={() => setFilter('favorites')}
                                variant={filter === 'favorites' ? 'default' : 'secondary'}
                                size="sm"
                                className="h-9 px-3 text-xs"
                            >
                                <Star className="w-3.5 h-3.5" /> Starred
                            </Button>

                            <div className="w-px bg-border self-stretch" />

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-9 px-3 text-xs gap-1.5 max-w-[164px]"
                                    >
                                        <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate hidden sm:inline">
                                            {currentSortLabel}
                                        </span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-56 bg-card border-border"
                                >
                                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                                        Sort by
                                    </DropdownMenuLabel>
                                    {SORT_OPTIONS.map((opt) => {
                                        const active =
                                            sort.field === opt.field && sort.dir === opt.dir;
                                        return (
                                            <DropdownMenuItem
                                                key={`${opt.field}-${opt.dir}`}
                                                onClick={() => applySort(opt.field, opt.dir)}
                                                className={`gap-2 text-xs ${active ? 'text-primary' : ''}`}
                                            >
                                                {active ? (
                                                    <Check className="w-3 h-3 shrink-0" />
                                                ) : (
                                                    <span className="w-3 shrink-0" />
                                                )}
                                                {opt.label}
                                            </DropdownMenuItem>
                                        );
                                    })}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <div className="w-px bg-border self-stretch" />

                            <div className="flex rounded-lg border border-border overflow-hidden">
                                <button
                                    onClick={() => switchView('grid')}
                                    className={`px-2.5 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                                    title="Grid view"
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => switchView('list')}
                                    className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                                    title="List view"
                                >
                                    <List className="w-4 h-4" />
                                </button>
                            </div>

                            <Button
                                variant="secondary"
                                size="icon"
                                onClick={() => {
                                    fetchServers();
                                    fetchMetrics(servers, true);
                                }}
                                className="h-9 w-9"
                                title="Refresh"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>

                    {/* Protocol filter pills */}
                    {showProtocolFilters && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {(['all', 'SSH', 'SCP', 'RDP', 'VNC'] as ProtocolFilter[]).map((p) => {
                                const count = p === 'all' ? protocolCounts.all : protocolCounts[p];
                                if (p !== 'all' && count === 0) return null;
                                const active = protocolFilter === p;
                                const colorMap: Record<string, string> = {
                                    SSH: active
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                        : 'text-muted-foreground border-border hover:border-emerald-500/30 hover:text-emerald-400',
                                    SCP: active
                                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                                        : 'text-muted-foreground border-border hover:border-blue-500/30 hover:text-blue-400',
                                    RDP: active
                                        ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                                        : 'text-muted-foreground border-border hover:border-purple-500/30 hover:text-purple-400',
                                    VNC: active
                                        ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                                        : 'text-muted-foreground border-border hover:border-orange-500/30 hover:text-orange-400',
                                    all: active
                                        ? 'bg-primary/15 text-primary border-primary/30'
                                        : 'text-muted-foreground border-border hover:text-foreground',
                                };
                                return (
                                    <button
                                        key={p}
                                        onClick={() => setProtocolFilter(p)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all ${colorMap[p]}`}
                                    >
                                        {p === 'all' ? 'All protocols' : p}
                                        <span className="tabular-nums opacity-60">{count}</span>
                                    </button>
                                );
                            })}

                            {/* Active tag filter chip */}
                            {activeTag && (
                                <>
                                    <div className="w-px h-4 bg-border" />
                                    <button
                                        onClick={() => setActiveTag(null)}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium bg-primary/15 text-primary border-primary/30 transition-all"
                                    >
                                        <Tag className="w-3 h-3" />
                                        {activeTag}
                                        <X className="w-3 h-3" />
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Tag filter bar (when there are tags and no active tag filter) */}
                    {allTags.length > 0 && !activeTag && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <Tag className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                            {allTags.map((tag) => (
                                <button
                                    key={tag}
                                    onClick={() => setActiveTag(tag)}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border hover:bg-secondary/80 hover:text-foreground transition-colors"
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/*   Server List   */}
                {loading ? (
                    viewMode === 'grid' ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <Card key={i} className="p-3 bg-card border-border">
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="w-7 h-7 rounded-md" />
                                        <div className="flex-1 space-y-1.5">
                                            <Skeleton className="h-3.5 w-24" />
                                            <Skeleton className="h-2.5 w-16" />
                                        </div>
                                    </div>
                                    <div className="mt-2.5 space-y-1.5">
                                        <Skeleton className="h-6 w-full rounded" />
                                        <Skeleton className="h-3.5 w-1/2" />
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <Card className="overflow-hidden bg-card border-border">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0"
                                >
                                    <Skeleton className="w-8 h-8 rounded-md" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-3.5 w-32" />
                                        <Skeleton className="h-3 w-20" />
                                    </div>
                                    <Skeleton className="h-7 w-16" />
                                </div>
                            ))}
                        </Card>
                    )
                ) : sortedServers.length === 0 ? (
                    servers.length === 0 ? (
                        <Card className="p-16 text-center bg-card border-border">
                            <Server className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                            <h3 className="font-medium mb-1.5">No servers yet</h3>
                            <p className="text-sm text-muted-foreground mb-6">
                                Add your first server to get started
                            </p>
                            <Button asChild>
                                <Link href="/panel/servers/new">
                                    <Plus className="w-4 h-4" /> Add Server
                                </Link>
                            </Button>
                        </Card>
                    ) : (
                        <Card className="p-12 text-center bg-card border-border">
                            <Search className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                            <h3 className="font-medium mb-1">No matching servers</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Try adjusting your filters or search
                            </p>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    setProtocolFilter('all');
                                    setActiveTag(null);
                                    setSearchQuery('');
                                    setDebouncedSearchQuery('');
                                    setFilter('all');
                                }}
                            >
                                Clear filters
                            </Button>
                        </Card>
                    )
                ) : viewMode === 'grid' ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {sortedServers.map((server) => (
                            <GridCard key={server.id} {...sharedProps(server)} />
                        ))}
                    </div>
                ) : (
                    <Card className="overflow-hidden bg-card border-border">
                        <div className="flex items-center gap-3 px-4 py-2 border-b border-border/60 bg-secondary/20">
                            <div className="w-8 shrink-0" />
                            <div className="flex-1 text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider">
                                Server
                            </div>
                            <div className="hidden lg:block w-32 text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider shrink-0">
                                Group / Tags
                            </div>
                            <div className="hidden xl:block w-48 text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider shrink-0">
                                Metrics
                            </div>
                            <div className="hidden md:block w-16 text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider shrink-0 text-right">
                                Last Used
                            </div>
                            <div className="w-32 shrink-0" />
                        </div>
                        {sortedServers.map((server) => (
                            <ListRow key={server.id} {...sharedProps(server)} />
                        ))}
                    </Card>
                )}
            </div>

            {/*   Shared with me   */}
            {sharedServers.length > 0 && (
                <div className="max-w-6xl mx-auto mt-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Share2 className="w-4 h-4 text-primary" />
                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            Shared with me
                        </h2>
                        <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
                            {sharedServers.length}
                        </span>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sharedServers.map((server) => {
                            const Icon = protocolIcons[server.protocol];
                            return (
                                <Card
                                    key={server.id}
                                    className="flex flex-col overflow-hidden bg-card border-border border-primary/20 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
                                >
                                    <div className="p-4 flex-1 space-y-3">
                                        <div className="flex items-start gap-3">
                                            <div
                                                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${protocolVariants[server.protocol]}`}
                                            >
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold truncate text-sm leading-tight">
                                                    {server.name}
                                                </h3>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-[10px] text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-md font-medium">
                                                        Shared by {server.sharedBy}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="rounded-md bg-secondary/60 border border-border/50 px-2.5 py-2 space-y-1.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Server className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                                <span className="text-[11px] text-foreground/80 font-mono truncate">
                                                    {server.host}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground/50 shrink-0">
                                                    :{server.port}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <User className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                                <span className="text-[11px] text-muted-foreground font-mono truncate">
                                                    {server.username}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1">
                                            <span
                                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${protocolVariants[server.protocol]}`}
                                            >
                                                {server.protocol}
                                            </span>
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                                                {server.permissions}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="px-4 pb-4">
                                        <Button
                                            size="sm"
                                            className="w-full text-xs"
                                            onClick={() =>
                                                router.push(
                                                    `/panel/connect/${server.id}/${server.protocol.toLowerCase()}`,
                                                )
                                            }
                                        >
                                            Connect
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}

            <AlertDialog
                open={!!deleteConfirm}
                onOpenChange={(open) => !open && setDeleteConfirm(null)}
            >
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                            </div>
                            <AlertDialogTitle>Delete Server</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription>
                            Are you sure you want to delete{' '}
                            <span className="font-medium text-foreground">
                                {deleteConfirm?.name}
                            </span>
                            ? All associated data will be permanently removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            disabled={deleting}
                            className="bg-secondary border-border hover:bg-secondary/80"
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {revealTarget && (
                <PasskeyRevealModal
                    serverId={revealTarget.server.id}
                    serverName={revealTarget.server.name}
                    field={revealTarget.field}
                    onClose={() => setRevealTarget(null)}
                />
            )}

            {shareTarget && (
                <ShareModal server={shareTarget} onClose={() => setShareTarget(null)} />
            )}
        </>
    );
}
