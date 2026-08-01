import { FolderOpen, Globe, Layers, Lock, Monitor, Server, Tag, Terminal } from 'lucide-react';

export interface ServerInGroup {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC' | 'TELNET';
    isFavorite: boolean;
    lastUsedAt: string | null;
}

export interface Group {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    sortOrder: number;
    createdAt: string;
    _count: { servers: number };
}

export interface GroupDetail extends Group {
    servers: ServerInGroup[];
}

export interface GroupFormData {
    name: string;
    description: string;
    color: string;
    icon: string;
}

export const EMPTY_FORM: GroupFormData = { name: '', description: '', color: '', icon: '' };

export const PRESET_COLORS = [
    '#0ea5e9',
    '#8b5cf6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#ec4899',
    '#14b8a6',
    '#6366f1',
    '#f97316',
    '#84cc16',
];

export const PRESET_ICONS = [
    { value: 'folder', label: 'Folder', icon: FolderOpen },
    { value: 'server', label: 'Server', icon: Server },
    { value: 'terminal', label: 'Terminal', icon: Terminal },
    { value: 'monitor', label: 'Monitor', icon: Monitor },
    { value: 'globe', label: 'Globe', icon: Globe },
    { value: 'lock', label: 'Lock', icon: Lock },
    { value: 'tag', label: 'Tag', icon: Tag },
    { value: 'layers', label: 'Layers', icon: Layers },
];

/** Fallback colour for groups that haven't picked one. */
export const DEFAULT_GROUP_COLOR = '#475569';

export const protocolColors: Record<string, string> = {
    SSH: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    SCP: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    RDP: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    VNC: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

export const protocolIcons: Record<string, typeof Terminal> = {
    SSH: Terminal,
    SCP: FolderOpen,
    RDP: Monitor,
    VNC: Monitor,
    TELNET: Terminal,
};

export function getIconComponent(iconName: string | null) {
    if (!iconName) return FolderOpen;
    return PRESET_ICONS.find((i) => i.value === iconName)?.icon ?? FolderOpen;
}

/** Counts servers per protocol, most common first. */
export function protocolBreakdown(servers: { protocol: string }[]) {
    const counts: Record<string, number> = {};
    servers.forEach((s) => {
        counts[s.protocol] = (counts[s.protocol] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}
