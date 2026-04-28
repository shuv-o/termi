'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Server, Terminal, FolderOpen, Monitor, Plus,
    Star, MoreVertical, Search, RefreshCw,
    Layers, Pencil, Trash2, AlertTriangle,
    LayoutGrid, List, KeyRound, Clock, Wifi, WifiOff, Activity,
    Copy, Check, User, HardDrive, ArrowDown, ArrowUp, Cpu, MemoryStick,
    ArrowUpDown,
} from 'lucide-react';
import { useSessionsContext } from './sessions-context';
import dynamic from 'next/dynamic';
import type { RevealField } from '@/components/auth/PasskeyRevealModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

const PasskeyRevealModal = dynamic(
    () => import('@/components/auth/PasskeyRevealModal'),
    { ssr: false }
);

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

type SortField = 'name' | 'lastUsed' | 'protocol' | 'status' | 'cpu' | 'ram' | 'latency' | 'favorite';
type SortDir  = 'asc' | 'desc';
interface SortOption { field: SortField; dir: SortDir; label: string; }

const SORT_OPTIONS: SortOption[] = [
    { field: 'name',     dir: 'asc',  label: 'Name A → Z' },
    { field: 'name',     dir: 'desc', label: 'Name Z → A' },
    { field: 'lastUsed', dir: 'desc', label: 'Recently Used' },
    { field: 'lastUsed', dir: 'asc',  label: 'Least Recently Used' },
    { field: 'favorite', dir: 'desc', label: 'Favorites First' },
    { field: 'status',   dir: 'asc',  label: 'Online First' },
    { field: 'status',   dir: 'desc', label: 'Offline First' },
    { field: 'cpu',      dir: 'desc', label: 'CPU Usage (High → Low)' },
    { field: 'ram',      dir: 'desc', label: 'RAM Usage (High → Low)' },
    { field: 'latency',  dir: 'asc',  label: 'Latency (Low → High)' },
    { field: 'protocol', dir: 'asc',  label: 'Protocol' },
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
    if (bytes >= 1_073_741_824)     return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576)         return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024)              return `${(bytes / 1024).toFixed(1)} KB`;
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

function MetricBar({ label, icon: Icon, percent, used, total, sub }: {
    label: string;
    icon?: React.ElementType;
    percent: number;
    used: string;
    total?: string;
    sub?: string;
}) {
    const color =
        percent >= 90 ? 'bg-red-500' :
        percent >= 70 ? 'bg-yellow-500' :
        'bg-emerald-500';

    return (
        <div className="space-y-0.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    {Icon && <Icon className="w-2.5 h-2.5 text-muted-foreground" />}
                    <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
                    {sub && <span className="text-[9px] text-muted-foreground/60 ml-1 hidden sm:inline">{sub}</span>}
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                    {total ? <>{used}<span className="text-muted-foreground/40"> / {total}</span></> : used}
                </span>
            </div>
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${color}`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                />
            </div>
            {sub && <p className="text-[9px] text-muted-foreground/40 truncate sm:hidden">{sub}</p>}
        </div>
    );
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

function StatusIndicator({ metrics, loading }: { metrics: ServerMetrics | null; loading: boolean }) {
    if (loading) return (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
        </span>
    );
    if (!metrics) return null;
    if (!metrics.reachable) return (
        <span className="flex items-center gap-1">
            <WifiOff className="w-3 h-3 text-red-400" />
        </span>
    );
    return (
        <span className="flex items-center gap-1">
            <Wifi className="w-3 h-3 text-emerald-400" />
            {metrics.latencyMs != null && (
                <span className="text-[10px] text-emerald-400 tabular-nums">{metrics.latencyMs}ms</span>
            )}
        </span>
    );
}

function GridCard({
    server, m, mLoading,
    onFavorite, onEdit, onDelete, onCopyPassword, onConnect, onSessions,
}: {
    server: ServerItem;
    m: ServerMetrics | null;
    mLoading: boolean;
    onFavorite: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopyPassword: () => void;
    onConnect: () => void;
    onSessions: () => void;
}) {
    const Icon = protocolIcons[server.protocol];
    const hasMetrics = server.protocol === 'SSH' && m && m.reachable && !m.error;

    return (
        <Card className="group flex flex-col overflow-hidden bg-card border-border hover:border-border/80 hover:shadow-lg hover:shadow-black/20 transition-all duration-200">
            <div className="p-4 flex-1 space-y-3">
                <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${protocolVariants[server.protocol]}`}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="font-semibold truncate text-sm leading-tight">{server.name}</h3>
                            <StatusIndicator metrics={m} loading={mLoading} />
                        </div>
                        {server.description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{server.description}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onFavorite}
                            className={`h-6 w-6 transition-all ${
                                server.isFavorite
                                    ? 'text-yellow-400'
                                    : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
                            }`}
                        >
                            <Star className={`w-3.5 h-3.5 ${server.isFavorite ? 'fill-yellow-400' : ''}`} />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-foreground"
                                >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 bg-card border-border">
                                <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/servers/${server.id}`} className="flex items-center gap-2">
                                        <Activity className="w-3.5 h-3.5 text-muted-foreground" /> Details
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={onEdit} className="gap-2">
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Edit
                                </DropdownMenuItem>
                                {server.hasPassword && (
                                    <DropdownMenuItem onClick={onCopyPassword} className="gap-2">
                                        <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> Copy Password
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="rounded-md bg-secondary/60 border border-border/50 px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <Server className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                            <span className="text-[11px] text-foreground/80 font-mono truncate">{server.host}</span>
                            <span className="text-[10px] text-muted-foreground/50 shrink-0">:{server.port}</span>
                        </div>
                        <CopyButton text={`${server.host}:${server.port}`} />
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        <span className="text-[11px] text-muted-foreground font-mono truncate">{server.username}</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${protocolVariants[server.protocol]}`}>
                        {server.protocol}
                    </span>
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
                        <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border">
                            {tag}
                        </span>
                    ))}
                </div>

                {hasMetrics && (
                    <div className="space-y-2">
                        {m!.cpu != null && (
                            <MetricBar label="CPU" icon={Cpu} percent={m!.cpu} used={`${m!.cpu}%`} sub={m!.cpuModel} />
                        )}
                        {m!.ram && (
                            <MetricBar
                                label="RAM" icon={MemoryStick}
                                percent={m!.ram.percent}
                                used={formatBytes(m!.ram.usedBytes)}
                                total={formatBytes(m!.ram.totalBytes)}
                                sub={m!.ram.speedMhz ? `${m!.ram.speedMhz} MT/s` : undefined}
                            />
                        )}
                        {m!.disk && (
                            <MetricBar
                                label="Disk" icon={HardDrive}
                                percent={m!.disk.percent}
                                used={formatBytes(m!.disk.usedBytes)}
                                total={formatBytes(m!.disk.totalBytes)}
                            />
                        )}
                        {m!.network && (
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <ArrowDown className="w-2.5 h-2.5 text-emerald-500" />
                                    {formatBytes(m!.network.rxBytes)}
                                </span>
                                <span className="flex items-center gap-1">
                                    <ArrowUp className="w-2.5 h-2.5 text-blue-400" />
                                    {formatBytes(m!.network.txBytes)}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(server.lastUsedAt)}
                </div>
            </div>

            <div className="px-3 py-2.5 border-t border-border/60 bg-secondary/20 flex gap-1.5">
                <Button onClick={onConnect} size="sm" className="flex-1 justify-center text-xs h-7">
                    Connect
                </Button>
                {server.hasPassword && (
                    <Button onClick={onCopyPassword} variant="secondary" size="icon" className="h-7 w-7 shrink-0" title="Copy password (passkey required)">
                        <KeyRound className="w-3.5 h-3.5" />
                    </Button>
                )}
                {server.protocol === 'SSH' && (
                    <Button onClick={onSessions} variant="secondary" size="icon" className="h-7 w-7 shrink-0" title="Open in Sessions tab">
                        <Layers className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>
        </Card>
    );
}

function ListRow({
    server, m, mLoading,
    onFavorite, onEdit, onDelete, onCopyPassword, onConnect, onSessions,
}: {
    server: ServerItem;
    m: ServerMetrics | null;
    mLoading: boolean;
    onFavorite: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopyPassword: () => void;
    onConnect: () => void;
    onSessions: () => void;
}) {
    const Icon = protocolIcons[server.protocol];

    return (
        <div className="group flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
            <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border ${protocolVariants[server.protocol]}`}>
                <Icon className="w-3.5 h-3.5" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{server.name}</span>
                    <StatusIndicator metrics={m} loading={mLoading} />
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[11px] text-muted-foreground font-mono truncate">{server.username}@{server.host}</span>
                    <span className="text-[10px] text-muted-foreground/40 shrink-0">:{server.port}</span>
                    <CopyButton text={`${server.host}:${server.port}`} />
                </div>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                {server.group && (
                    <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
                        style={{ backgroundColor: `${server.group.color}20`, color: server.group.color || undefined, borderColor: `${server.group.color}40` }}
                    >
                        {server.group.name}
                    </span>
                )}
                {server.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border">
                        {tag}
                    </span>
                ))}
            </div>

            {server.protocol === 'SSH' && m && m.reachable && !m.error && (
                <div className="hidden xl:flex items-center gap-4 shrink-0">
                    {m.cpu != null && (
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1 text-[10px] tabular-nums">
                                <Cpu className="w-3 h-3 text-muted-foreground/50" />
                                <span className={m.cpu >= 90 ? 'text-red-400' : m.cpu >= 70 ? 'text-yellow-400' : 'text-muted-foreground'}>
                                    {m.cpu}%
                                </span>
                            </div>
                            {m.cpuModel && (
                                <span className="text-[9px] text-muted-foreground/40 truncate max-w-[160px]" title={m.cpuModel}>
                                    {m.cpuModel}
                                </span>
                            )}
                        </div>
                    )}
                    {m.ram && (
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                                <MemoryStick className="w-3 h-3 text-muted-foreground/50" />
                                {formatBytes(m.ram.usedBytes)}<span className="text-muted-foreground/30">/{formatBytes(m.ram.totalBytes)}</span>
                            </div>
                            {m.ram.speedMhz && <span className="text-[9px] text-muted-foreground/40">{m.ram.speedMhz} MT/s</span>}
                        </div>
                    )}
                    {m.disk && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                            <HardDrive className="w-3 h-3 text-muted-foreground/50" />
                            {formatBytes(m.disk.usedBytes)}<span className="text-muted-foreground/30">/{formatBytes(m.disk.totalBytes)}</span>
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
                    className={`h-7 w-7 transition-all ${server.isFavorite ? 'text-yellow-400' : 'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-yellow-400'}`}
                >
                    <Star className={`w-3.5 h-3.5 ${server.isFavorite ? 'fill-yellow-400' : ''}`} />
                </Button>
                {server.hasPassword && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCopyPassword}
                        className="h-7 w-7 text-muted-foreground/50 hover:text-primary opacity-0 group-hover:opacity-100"
                        title="Copy password (passkey required)"
                    >
                        <KeyRound className="w-3.5 h-3.5" />
                    </Button>
                )}
                <Button onClick={onConnect} size="sm" className="text-xs h-7 px-2.5">Connect</Button>
                {server.protocol === 'SSH' && (
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={onSessions}
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-all"
                        title="Open in Sessions"
                    >
                        <Layers className="w-3.5 h-3.5" />
                    </Button>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-foreground"
                        >
                            <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 bg-card border-border">
                        <DropdownMenuItem asChild>
                            <Link href={`/dashboard/servers/${server.id}`} className="flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5 text-muted-foreground" /> Details
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onEdit} className="gap-2">
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Edit
                        </DropdownMenuItem>
                        {server.hasPassword && (
                            <DropdownMenuItem onClick={onCopyPassword} className="gap-2">
                                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" /> Copy Password
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const { addSession, sessions } = useSessionsContext();

    const [servers, setServers] = useState<ServerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [metrics, setMetrics] = useState<Record<string, ServerMetrics | null>>({});
    const [metricsLoading, setMetricsLoading] = useState<Record<string, boolean>>({});
    const [deleteConfirm, setDeleteConfirm] = useState<ServerItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [revealTarget, setRevealTarget] = useState<{ server: ServerItem; field: RevealField } | null>(null);
    const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'name', dir: 'asc' });
    const metricsCacheRef = useRef<Record<string, { data: ServerMetrics; fetchedAt: number }>>({});

    useEffect(() => {
        const v = localStorage.getItem('dashboard-view') as ViewMode | null;
        if (v === 'grid' || v === 'list') setViewMode(v);
        const s = localStorage.getItem('dashboard-sort');
        if (s) { try { setSort(JSON.parse(s)); } catch { /* ignore */ } }
    }, []);

    const switchView = (v: ViewMode) => { setViewMode(v); localStorage.setItem('dashboard-view', v); };
    const applySort  = (field: SortField, dir: SortDir) => {
        setSort({ field, dir });
        localStorage.setItem('dashboard-sort', JSON.stringify({ field, dir }));
    };

    const fetchServers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.set('q', searchQuery);
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
        toFetch.forEach((s) => { ls[s.id] = true; });
        setMetricsLoading(ls);

        await Promise.all(
            toFetch.map(async (server, i) => {
                await new Promise((r) => setTimeout(r, i * 80));
                try {
                    const res  = await fetch(`/api/servers/${server.id}/metrics`);
                    const data = await res.json();
                    if (data.success) {
                        metricsCacheRef.current[server.id] = { data: data.data.metrics, fetchedAt: Date.now() };
                        setMetrics((prev) => ({ ...prev, [server.id]: data.data.metrics }));
                    }
                } catch {
                    setMetrics((prev) => ({ ...prev, [server.id]: null }));
                } finally {
                    setMetricsLoading((prev) => ({ ...prev, [server.id]: false }));
                }
            })
        );
    }, []);

    useEffect(() => { fetchServers(); }, [searchQuery, filter]);
    useEffect(() => { if (!loading && servers.length > 0) fetchMetrics(servers); }, [loading, servers, fetchMetrics]);
    useEffect(() => {
        if (servers.length === 0) return;
        const id = setInterval(() => fetchMetrics(servers), METRICS_TTL);
        return () => clearInterval(id);
    }, [servers, fetchMetrics]);

    const sortedServers = useMemo(() => [...servers].sort((a, b) => {
        const ma = metrics[a.id]; const mb = metrics[b.id];
        switch (sort.field) {
            case 'name':     return sort.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
            case 'protocol': return sort.dir === 'asc' ? a.protocol.localeCompare(b.protocol) : b.protocol.localeCompare(a.protocol);
            case 'lastUsed': { const ta = a.lastUsedAt ? +new Date(a.lastUsedAt) : 0; const tb = b.lastUsedAt ? +new Date(b.lastUsedAt) : 0; return sort.dir === 'asc' ? ta - tb : tb - ta; }
            case 'favorite': { const fa = a.isFavorite ? 1 : 0; const fb = b.isFavorite ? 1 : 0; return sort.dir === 'desc' ? fb - fa : fa - fb; }
            case 'status':   { const ra = ma?.reachable ? 1 : 0; const rb = mb?.reachable ? 1 : 0; return sort.dir === 'asc' ? rb - ra : ra - rb; }
            case 'cpu':      { const ca = ma?.cpu ?? -1; const cb = mb?.cpu ?? -1; return sort.dir === 'desc' ? cb - ca : ca - cb; }
            case 'ram':      { const ra = ma?.ram?.percent ?? -1; const rb = mb?.ram?.percent ?? -1; return sort.dir === 'desc' ? rb - ra : ra - rb; }
            case 'latency':  { const la = ma?.latencyMs ?? Infinity; const lb = mb?.latencyMs ?? Infinity; return sort.dir === 'asc' ? la - lb : lb - la; }
            default: return 0;
        }
    }), [servers, sort, metrics]);

    const toggleFavorite = async (serverId: string) => {
        const server = servers.find((s) => s.id === serverId);
        if (!server) return;
        await fetch(`/api/servers/${serverId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isFavorite: !server.isFavorite }),
        });
        setServers(servers.map((s) => s.id === serverId ? { ...s, isFavorite: !s.isFavorite } : s));
    };

    const openInSessions = async (server: ServerItem) => {
        const alreadyOpen = sessions.some(s => s.serverId === server.id);
        if (!alreadyOpen) await addSession(server.id, server.name);
        router.push('/dashboard/sessions');
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setDeleting(true);
        try {
            const res  = await fetch(`/api/servers/${deleteConfirm.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setServers((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
                setMetrics((prev) => { const next = { ...prev }; delete next[deleteConfirm.id]; return next; });
                setDeleteConfirm(null);
            }
        } finally { setDeleting(false); }
    };

    const currentSortLabel = SORT_OPTIONS.find(o => o.field === sort.field && o.dir === sort.dir)?.label ?? 'Sort';

    const sharedProps = (server: ServerItem) => ({
        server,
        m: metrics[server.id] ?? null,
        mLoading: metricsLoading[server.id] ?? false,
        onFavorite:     () => toggleFavorite(server.id),
        onEdit:         () => router.push(`/dashboard/servers/${server.id}/edit`),
        onDelete:       () => setDeleteConfirm(server),
        onCopyPassword: () => setRevealTarget({ server, field: 'password' }),
        onConnect:      () => router.push(`/dashboard/connect/${server.id}/${server.protocol.toLowerCase()}`),
        onSessions:     () => openInSessions(server),
    });

    return (
        <>
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-bold">Servers</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {servers.length > 0
                            ? `${servers.length} server${servers.length === 1 ? '' : 's'}`
                            : 'Manage and connect to your servers'}
                    </p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/servers/new">
                        <Plus className="w-4 h-4" /> Add Server
                    </Link>
                </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search servers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 text-sm h-9 bg-secondary border-border"
                    />
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
                            <Button variant="secondary" size="sm" className="h-9 px-3 text-xs gap-1.5 max-w-[164px]">
                                <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate hidden sm:inline">{currentSortLabel}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">Sort by</DropdownMenuLabel>
                            {SORT_OPTIONS.map((opt) => {
                                const active = sort.field === opt.field && sort.dir === opt.dir;
                                return (
                                    <DropdownMenuItem
                                        key={`${opt.field}-${opt.dir}`}
                                        onClick={() => applySort(opt.field, opt.dir)}
                                        className={`gap-2 text-xs ${active ? 'text-primary' : ''}`}
                                    >
                                        {active ? <Check className="w-3 h-3 shrink-0" /> : <span className="w-3 shrink-0" />}
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
                        onClick={() => { fetchServers(); fetchMetrics(servers, true); }}
                        className="h-9 w-9"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {loading ? (
                viewMode === 'grid' ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <Card key={i} className="p-4 bg-card border-border">
                                <div className="flex items-start gap-3">
                                    <Skeleton className="w-9 h-9 rounded-lg" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-28" />
                                        <Skeleton className="h-3 w-20" />
                                    </div>
                                </div>
                                <div className="mt-3 space-y-1.5">
                                    <Skeleton className="h-2 w-full" />
                                    <Skeleton className="h-2 w-3/4" />
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Card className="overflow-hidden bg-card border-border">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0">
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
            ) : servers.length === 0 ? (
                <Card className="p-16 text-center bg-card border-border">
                    <Server className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="font-medium mb-1.5">No servers yet</h3>
                    <p className="text-sm text-muted-foreground mb-6">Add your first server to get started</p>
                    <Button asChild>
                        <Link href="/dashboard/servers/new">
                            <Plus className="w-4 h-4" /> Add Server
                        </Link>
                    </Button>
                </Card>
            ) : viewMode === 'grid' ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedServers.map((server) => <GridCard key={server.id} {...sharedProps(server)} />)}
                </div>
            ) : (
                <Card className="overflow-hidden bg-card border-border">
                    <div className="flex items-center gap-3 px-4 py-2 border-b border-border/60 bg-secondary/20">
                        <div className="w-8 shrink-0" />
                        <div className="flex-1 text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider">Server</div>
                        <div className="hidden lg:block w-32 text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider shrink-0">Group / Tags</div>
                        <div className="hidden xl:block w-48 text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider shrink-0">Metrics</div>
                        <div className="hidden md:block w-16 text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider shrink-0 text-right">Last Used</div>
                        <div className="w-32 shrink-0" />
                    </div>
                    {sortedServers.map((server) => <ListRow key={server.id} {...sharedProps(server)} />)}
                </Card>
            )}
        </div>

        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
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
                        <span className="font-medium text-foreground">{deleteConfirm?.name}</span>?
                        All associated data will be permanently removed.
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
        </>
    );
}
