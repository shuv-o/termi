'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    FolderOpen, Plus, Pencil, Trash2, Server,
    Check, Loader2, AlertTriangle, ChevronUp,
    ChevronDown, Terminal, Monitor, FolderClosed,
    Layers, Tag, Globe, Lock, Search,
    MoreVertical, ArrowRight, Boxes,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ============================================================================
// TYPES
// ============================================================================

interface ServerInGroup {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC';
    isFavorite: boolean;
    lastUsedAt: string | null;
}

interface Group {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    sortOrder: number;
    createdAt: string;
    _count: { servers: number };
}

interface GroupDetail extends Group {
    servers: ServerInGroup[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRESET_COLORS = [
    '#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#14b8a6', '#6366f1', '#f97316', '#84cc16',
];

const PRESET_ICONS = [
    { value: 'folder',   label: 'Folder',   icon: FolderOpen },
    { value: 'server',   label: 'Server',   icon: Server },
    { value: 'terminal', label: 'Terminal', icon: Terminal },
    { value: 'monitor',  label: 'Monitor',  icon: Monitor },
    { value: 'globe',    label: 'Globe',    icon: Globe },
    { value: 'lock',     label: 'Lock',     icon: Lock },
    { value: 'tag',      label: 'Tag',      icon: Tag },
    { value: 'layers',   label: 'Layers',   icon: Layers },
];

const protocolColors: Record<string, string> = {
    SSH: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    SCP: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    RDP: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    VNC: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const protocolIcons = { SSH: Terminal, SCP: FolderOpen, RDP: Monitor, VNC: Monitor };

// ============================================================================
// HELPERS
// ============================================================================

function getIconComponent(iconName: string | null) {
    if (!iconName) return FolderOpen;
    const found = PRESET_ICONS.find(i => i.value === iconName);
    return found ? found.icon : FolderOpen;
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

function protocolBreakdown(servers: { protocol: string }[]) {
    const counts: Record<string, number> = {};
    servers.forEach(s => { counts[s.protocol] = (counts[s.protocol] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// ============================================================================
// MODAL – Create / Edit Group
// ============================================================================

interface GroupFormData { name: string; description: string; color: string; icon: string; }

function GroupModal({
    open, mode, initial, onClose, onSave,
}: {
    open: boolean;
    mode: 'create' | 'edit';
    initial: GroupFormData;
    onClose: () => void;
    onSave: (data: GroupFormData) => Promise<void>;
}) {
    const [form, setForm] = useState<GroupFormData>(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setForm(initial); setError(''); }, [initial, open]);
    useEffect(() => { if (open) setTimeout(() => nameRef.current?.focus(), 50); }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) { setError('Name is required'); return; }
        setSaving(true); setError('');
        try { await onSave(form); onClose(); }
        catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); }
        finally { setSaving(false); }
    };

    const update = (fields: Partial<GroupFormData>) => setForm(f => ({ ...f, ...fields }));

    // Live preview color
    const previewColor = form.color || '#475569';
    const IconPreview = getIconComponent(form.icon);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="bg-card border-border max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        {/* Live preview */}
                        <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
                            style={{
                                backgroundColor: `${previewColor}22`,
                                borderColor: `${previewColor}44`,
                            }}
                        >
                            <IconPreview className="w-4.5 h-4.5" style={{ color: previewColor }} />
                        </div>
                        {mode === 'create' ? 'Create Group' : 'Edit Group'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} method="POST" action="#" className="space-y-5 pt-1">
                    <div className="space-y-1.5">
                        <Label>Name <span className="text-red-400">*</span></Label>
                        <Input
                            ref={nameRef}
                            type="text"
                            className="bg-secondary border-border"
                            placeholder="e.g. Production Servers"
                            maxLength={50}
                            value={form.name}
                            onChange={e => update({ name: e.target.value })}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Textarea
                            className="bg-secondary border-border resize-none"
                            rows={2}
                            placeholder="Brief description..."
                            maxLength={200}
                            value={form.description}
                            onChange={e => update({ description: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <Label>Color <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <div className="flex flex-wrap gap-2">
                                {PRESET_COLORS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => update({ color: form.color === c ? '' : c })}
                                        className={`w-6 h-6 rounded-full transition-all duration-150 ${
                                            form.color === c
                                                ? 'ring-2 ring-offset-2 ring-offset-card ring-white scale-110'
                                                : 'hover:scale-105'
                                        }`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                                <label className="w-6 h-6 rounded-full border-2 border-dashed border-border hover:border-muted-foreground transition-colors cursor-pointer flex items-center justify-center text-muted-foreground" title="Custom">
                                    <Plus className="w-3 h-3" />
                                    <input type="color" className="sr-only" value={form.color || '#ffffff'} onChange={e => update({ color: e.target.value })} />
                                </label>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Icon <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <div className="flex flex-wrap gap-1.5">
                                {PRESET_ICONS.map(({ value, label, icon: Icon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        title={label}
                                        onClick={() => update({ icon: form.icon === value ? '' : value })}
                                        className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-150 ${
                                            form.icon === value
                                                ? 'bg-primary/20 border-primary/60 text-primary'
                                                : 'bg-secondary border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={saving} className="flex-1">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {mode === 'create' ? 'Create Group' : 'Save Changes'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ============================================================================
// GROUP DETAIL PANEL
// ============================================================================

function GroupDetailPanel({
    group,
    detail,
    loadingDetail,
    onEdit,
    onDelete,
    onConnect,
}: {
    group: Group | null;
    detail: GroupDetail | null;
    loadingDetail: boolean;
    onEdit: (g: Group) => void;
    onDelete: (g: Group) => void;
    onConnect: (serverId: string, protocol: string) => void;
}) {
    if (!group) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-12">
                <div className="w-20 h-20 rounded-2xl bg-secondary/60 flex items-center justify-center mx-auto mb-5">
                    <Boxes className="w-10 h-10 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-foreground/70 mb-2">Select a group</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                    Click a group on the left to see its servers and manage settings.
                </p>
            </div>
        );
    }

    const IconComp = getIconComponent(group.icon);
    const color = group.color || '#475569';
    const breakdown = detail ? protocolBreakdown(detail.servers) : [];
    const totalServers = group._count.servers;

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Group header */}
            <div
                className="px-6 py-5 border-b border-border/60 shrink-0"
                style={{ borderLeftColor: color, borderLeftWidth: 4 }}
            >
                <div className="flex items-start gap-4">
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
                        style={{ backgroundColor: `${color}22`, borderColor: `${color}44` }}
                    >
                        <IconComp className="w-6 h-6" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-lg font-bold truncate">{group.name}</h2>
                            <span
                                className="px-2 py-0.5 rounded-full text-xs font-medium border"
                                style={{ backgroundColor: `${color}15`, color, borderColor: `${color}30` }}
                            >
                                {totalServers} {totalServers === 1 ? 'server' : 'servers'}
                            </span>
                        </div>
                        {group.description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{group.description}</p>
                        )}
                        {breakdown.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {breakdown.map(([proto, count]) => (
                                    <span
                                        key={proto}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${protocolColors[proto]}`}
                                    >
                                        {proto} <span className="opacity-60">×{count}</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(group)}
                            className="gap-1.5 text-xs h-8"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(group)}
                            className="gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </Button>
                    </div>
                </div>
            </div>

            {/* Server list */}
            <div className="flex-1 overflow-y-auto">
                {loadingDetail ? (
                    <div className="p-6 space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-lg bg-secondary/30">
                                <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-3.5 w-36" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                                <Skeleton className="h-7 w-20" />
                            </div>
                        ))}
                    </div>
                ) : !detail || detail.servers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                        <FolderClosed className="w-10 h-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground mb-1">No servers in this group</p>
                        <p className="text-xs text-muted-foreground/60 mb-5">Add servers to this group when creating or editing them.</p>
                        <Button asChild size="sm" variant="secondary">
                            <Link href="/panel/servers/new">
                                <Plus className="w-3.5 h-3.5" />
                                Add a server
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="px-6 pt-4 pb-2">
                            <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                                Servers · {detail.servers.length}
                            </p>
                        </div>
                        <div className="px-4 pb-4 space-y-1.5">
                            {detail.servers.map(srv => {
                                const ProtoIcon = protocolIcons[srv.protocol];
                                return (
                                    <div
                                        key={srv.id}
                                        className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/60 transition-colors"
                                    >
                                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border ${protocolColors[srv.protocol]}`}>
                                            <ProtoIcon className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium truncate">{srv.name}</span>
                                                {srv.isFavorite && (
                                                    <span className="text-yellow-400 text-[10px]">★</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 font-mono">
                                                <span className="truncate">{srv.username}@{srv.host}</span>
                                                <span>:{srv.port}</span>
                                            </div>
                                        </div>
                                        <div className="hidden sm:block text-[10px] text-muted-foreground/40 w-14 text-right shrink-0">
                                            {formatRelativeTime(srv.lastUsedAt)}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                size="sm"
                                                className="h-7 text-xs px-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => onConnect(srv.id, srv.protocol)}
                                            >
                                                Connect
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                                asChild
                                            >
                                                <Link href={`/panel/servers/${srv.id}`}>
                                                    <ArrowRight className="w-3.5 h-3.5" />
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Footer actions */}
            {detail && detail.servers.length > 0 && (
                <div className="px-6 py-4 border-t border-border/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="gap-1.5 text-xs"
                            asChild
                        >
                            <Link href="/panel/servers/new">
                                <Plus className="w-3.5 h-3.5" />
                                Add Server
                            </Link>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                if (detail) {
                                    detail.servers.forEach(srv => {
                                        window.open(`/panel/connect/${srv.id}/${srv.protocol.toLowerCase()}`, '_blank');
                                    });
                                }
                            }}
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Open all ({detail.servers.length})
                        </Button>
                        <div className="ml-auto text-[10px] text-muted-foreground/40">
                            Created {formatRelativeTime(group.createdAt)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const EMPTY_FORM: GroupFormData = { name: '', description: '', color: '', icon: '' };

export default function GroupsPage() {
    const router = useRouter();
    const [groups, setGroups] = useState<Group[]>([]);
    const [details, setDetails] = useState<Record<string, GroupDetail>>({});
    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [editTarget, setEditTarget] = useState<Group | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const showToast = useCallback((type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    }, []);

    const loadGroups = useCallback(async () => {
        try {
            const res = await fetch('/api/groups');
            const data = await res.json();
            if (data.success) {
                setGroups(data.data.groups);
                // Auto-select first group on first load
                if (data.data.groups.length > 0 && !selectedId) {
                    const first = data.data.groups[0];
                    setSelectedId(first.id);
                }
            }
        } catch {
            showToast('error', 'Failed to load groups');
        } finally {
            setLoading(false);
        }
    }, [showToast, selectedId]);

    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
    useEffect(() => { loadGroups(); }, []);

    const loadDetail = useCallback(async (groupId: string) => {
        if (details[groupId]) return;
        setLoadingDetail(true);
        try {
            const res = await fetch(`/api/groups/${groupId}`);
            const data = await res.json();
            if (data.success) setDetails(prev => ({ ...prev, [groupId]: data.data.group }));
        } catch { /* silent */ }
        finally { setLoadingDetail(false); }
    }, [details]);

    const handleSelect = useCallback((groupId: string) => {
        setSelectedId(groupId);
        loadDetail(groupId);
    }, [loadDetail]);

    // Auto-load detail when selection changes
    useEffect(() => {
        if (selectedId) loadDetail(selectedId);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the selection changes
    }, [selectedId]);

    const handleCreate = async (form: GroupFormData) => {
        const res = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: form.name.trim(),
                ...(form.description && { description: form.description }),
                ...(form.color && { color: form.color }),
                ...(form.icon && { icon: form.icon }),
            }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to create group');
        const newGroup = { ...data.data.group, _count: { servers: 0 } };
        setGroups(prev => [...prev, newGroup]);
        setSelectedId(newGroup.id);
        showToast('success', `Group "${form.name.trim()}" created`);
    };

    const handleEdit = async (form: GroupFormData) => {
        if (!editTarget) return;
        const res = await fetch(`/api/groups/${editTarget.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: form.name.trim(),
                description: form.description || null,
                color: form.color || null,
                icon: form.icon || null,
            }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to update group');
        setGroups(prev => prev.map(g => g.id === editTarget.id ? { ...g, ...data.data.group } : g));
        setDetails(prev => { const next = { ...prev }; delete next[editTarget.id]; return next; });
        showToast('success', 'Group updated');
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/groups/${deleteTarget.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to delete group');
            setGroups(prev => {
                const next = prev.filter(g => g.id !== deleteTarget.id);
                if (selectedId === deleteTarget.id) {
                    setSelectedId(next.length > 0 ? next[0].id : null);
                }
                return next;
            });
            showToast('success', `Group "${deleteTarget.name}" deleted`);
            setDeleteTarget(null);
        } catch {
            showToast('error', 'Failed to delete group');
        } finally {
            setDeleting(false);
        }
    };

    const handleMove = useCallback(async (groupId: string, direction: 'up' | 'down') => {
        const idx = groups.findIndex(g => g.id === groupId);
        if (idx < 0) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= groups.length) return;
        const next = [...groups];
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        setGroups(next);
        try {
            await fetch('/api/groups/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupIds: next.map(g => g.id) }),
            });
        } catch {
            setGroups(groups);
            showToast('error', 'Failed to reorder groups');
        }
    }, [groups, showToast]);

    const handleConnect = useCallback((serverId: string, protocol: string) => {
        router.push(`/panel/connect/${serverId}/${protocol.toLowerCase()}`);
    }, [router]);

    const filtered = useMemo(() => groups.filter(g =>
        !search ||
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        (g.description?.toLowerCase().includes(search.toLowerCase()))
    ), [groups, search]);

    const selectedGroup = groups.find(g => g.id === selectedId) ?? null;
    const selectedDetail = selectedId ? (details[selectedId] ?? null) : null;

    const totalServers = groups.reduce((s, g) => s + g._count.servers, 0);

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-0rem)] -m-4 lg:-m-8">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-medium transition-all duration-300 ${
                    toast.type === 'success'
                        ? 'bg-green-500/10 border-green-500/30 text-green-300'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}>
                    {toast.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {toast.msg}
                </div>
            )}

            {/* Top header bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0 bg-card/50 backdrop-blur-sm lg:px-8">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-lg font-bold">Groups</h1>
                        <p className="text-xs text-muted-foreground">
                            {loading ? 'Loading…' : `${groups.length} group${groups.length !== 1 ? 's' : ''} · ${totalServers} server${totalServers !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                </div>
                <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Create Group</span>
                    <span className="sm:hidden">Create</span>
                </Button>
            </div>

            {/* Main split layout */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* ── Left sidebar: group list ── */}
                <div className="w-full lg:w-72 xl:w-80 flex flex-col border-r border-border/60 bg-card/30 shrink-0 min-h-0 overflow-hidden">
                    {/* Search */}
                    <div className="px-3 py-3 border-b border-border/40 shrink-0">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                                type="text"
                                className="bg-secondary border-border pl-8 h-8 text-sm"
                                placeholder="Search groups…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Group list */}
                    <div className="flex-1 overflow-y-auto py-2">
                        {loading ? (
                            <div className="px-3 space-y-2 pt-1">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                                        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <Skeleton className="h-3.5 w-28" />
                                            <Skeleton className="h-3 w-16" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                {search ? (
                                    <>
                                        <Search className="w-6 h-6 mx-auto mb-2 opacity-30" />
                                        <p>No match for &ldquo;{search}&rdquo;</p>
                                        <button onClick={() => setSearch('')} className="mt-2 text-primary hover:text-primary/80 text-xs transition-colors">
                                            Clear search
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p>No groups yet</p>
                                        <button
                                            onClick={() => setShowCreate(true)}
                                            className="mt-2 text-primary hover:text-primary/80 text-xs transition-colors"
                                        >
                                            Create your first group
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="px-2 space-y-0.5">
                                {filtered.map((group, idx) => {
                                    const IconComp = getIconComponent(group.icon);
                                    const color = group.color || '#475569';
                                    const isSelected = selectedId === group.id;

                                    return (
                                        <div
                                            key={group.id}
                                            className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                                isSelected
                                                    ? 'bg-primary/10 text-foreground'
                                                    : 'hover:bg-secondary/60 text-muted-foreground hover:text-foreground'
                                            }`}
                                            onClick={() => handleSelect(group.id)}
                                        >
                                            {/* Selected accent */}
                                            {isSelected && (
                                                <div
                                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                                                    style={{ backgroundColor: color }}
                                                />
                                            )}

                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                                                style={{
                                                    backgroundColor: `${color}22`,
                                                    borderColor: `${color}44`,
                                                }}
                                            >
                                                <IconComp className="w-3.5 h-3.5" style={{ color }} />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-sm font-medium truncate ${isSelected ? 'text-foreground' : ''}`}>
                                                        {group.name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                                                    <Server className="w-3 h-3 shrink-0" />
                                                    <span>{group._count.servers} server{group._count.servers !== 1 ? 's' : ''}</span>
                                                </div>
                                            </div>

                                            {/* Row actions (visible on hover) */}
                                            <div
                                                className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <button
                                                    disabled={idx === 0}
                                                    onClick={() => handleMove(group.id, 'up')}
                                                    title="Move up"
                                                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    <ChevronUp className="w-3 h-3" />
                                                </button>
                                                <button
                                                    disabled={idx === filtered.length - 1}
                                                    onClick={() => handleMove(group.id, 'down')}
                                                    title="Move down"
                                                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    <ChevronDown className="w-3 h-3" />
                                                </button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                                                            <MoreVertical className="w-3 h-3" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-36 bg-card border-border text-xs">
                                                        <DropdownMenuItem onClick={() => setEditTarget(group)} className="gap-2 text-xs">
                                                            <Pencil className="w-3.5 h-3.5" /> Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => setDeleteTarget(group)}
                                                            className="gap-2 text-xs text-destructive focus:text-destructive"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" /> Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Sidebar footer stats */}
                    {!loading && groups.length > 0 && (
                        <div className="px-4 py-3 border-t border-border/40 shrink-0 bg-secondary/20">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
                                <span>{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
                                <span>{totalServers} server{totalServers !== 1 ? 's' : ''} total</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right panel: group detail ── */}
                <div className={`flex-1 min-w-0 min-h-0 overflow-hidden ${selectedGroup ? '' : 'hidden lg:flex'}`}>
                    <GroupDetailPanel
                        group={selectedGroup}
                        detail={selectedDetail}
                        loadingDetail={loadingDetail}
                        onEdit={(g) => setEditTarget(g)}
                        onDelete={(g) => setDeleteTarget(g)}
                        onConnect={handleConnect}
                    />
                </div>
            </div>

            {/* Modals */}
            <GroupModal
                open={showCreate}
                mode="create"
                initial={EMPTY_FORM}
                onClose={() => setShowCreate(false)}
                onSave={handleCreate}
            />
            <GroupModal
                open={!!editTarget}
                mode="edit"
                initial={
                    editTarget
                        ? { name: editTarget.name, description: editTarget.description ?? '', color: editTarget.color ?? '', icon: editTarget.icon ?? '' }
                        : EMPTY_FORM
                }
                onClose={() => setEditTarget(null)}
                onSave={handleEdit}
            />

            <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                            </div>
                            <div>
                                <AlertDialogTitle>Delete Group</AlertDialogTitle>
                                <AlertDialogDescription className="mt-1">
                                    Are you sure you want to delete{' '}
                                    <span className="text-foreground font-medium">&ldquo;{deleteTarget?.name}&rdquo;</span>?
                                    {deleteTarget && deleteTarget._count.servers > 0 && (
                                        <> The {deleteTarget._count.servers} server{deleteTarget._count.servers !== 1 ? 's' : ''} in this group will be ungrouped.</>
                                    )}
                                </AlertDialogDescription>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
