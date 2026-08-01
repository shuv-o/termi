import { FolderOpen, Monitor, Terminal } from 'lucide-react';

export interface ServerItem {
    id: string;
    name: string;
    description?: string;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC' | 'TELNET';
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

export interface ServerMetrics {
    reachable: boolean;
    latencyMs?: number;
    cpu?: number;
    cpuModel?: string;
    ram?: { usedBytes: number; totalBytes: number; percent: number; speedMhz?: number };
    disk?: { usedBytes: number; totalBytes: number; percent: number };
    network?: { rxBytes: number; txBytes: number };
    error?: string;
}

export type ViewMode = 'grid' | 'list';
export type ProtocolFilter = 'all' | 'SSH' | 'SCP' | 'RDP' | 'VNC' | 'TELNET';

export const PROTOCOL_FILTERS: ProtocolFilter[] = ['all', 'SSH', 'SCP', 'RDP', 'VNC', 'TELNET'];

export type SortField =
    | 'name'
    | 'lastUsed'
    | 'protocol'
    | 'status'
    | 'cpu'
    | 'ram'
    | 'latency'
    | 'favorite';

export type SortDir = 'asc' | 'desc';

interface SortOption {
    field: SortField;
    dir: SortDir;
    label: string;
}

export const SORT_OPTIONS: SortOption[] = [
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

export const protocolIcons = {
    SSH: Terminal,
    SCP: FolderOpen,
    RDP: Monitor,
    VNC: Monitor,
    TELNET: Terminal,
};

export const protocolVariants: Record<string, string> = {
    SSH: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    SCP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    RDP: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    VNC: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    TELNET: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

/** Props every server card/row needs, built once per server by the page. */
export interface ServerCardProps {
    server: ServerItem;
    m: ServerMetrics | null;
    mLoading: boolean;
    hasSession: boolean;
    onOpen: () => void;
    onFavorite: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopyPassword: () => void;
    onConnect: () => void;
    onSessions: () => void;
    onTagClick: (tag: string) => void;
    onShare: () => void;
}

/** Sort comparator shared by the grid and list views. */
export function compareServers(
    a: ServerItem,
    b: ServerItem,
    sort: { field: SortField; dir: SortDir },
    metrics: Record<string, ServerMetrics | null>,
): number {
    const ma = metrics[a.id];
    const mb = metrics[b.id];
    switch (sort.field) {
        case 'name':
            return sort.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
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
}
