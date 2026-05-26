'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
    FolderOpen, Plus, Pencil, Trash2, Server,
    X, Check, Loader2, AlertTriangle, ChevronUp,
    ChevronDown, Terminal, Monitor, FolderClosed,
    Layers, Tag, Globe, Lock, Search,
    ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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

// ============================================================================
// TYPES
// ============================================================================

interface ServerInGroup {
    id: string;
    name: string;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC';
    isFavorite: boolean;
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
    { value: 'folder', label: 'Folder', icon: FolderOpen },
    { value: 'server', label: 'Server', icon: Server },
    { value: 'terminal', label: 'Terminal', icon: Terminal },
    { value: 'monitor', label: 'Monitor', icon: Monitor },
    { value: 'globe', label: 'Globe', icon: Globe },
    { value: 'lock', label: 'Lock', icon: Lock },
    { value: 'tag', label: 'Tag', icon: Tag },
    { value: 'layers', label: 'Layers', icon: Layers },
];

const protocolColors: Record<string, string> = {
    SSH: 'bg-green-500/20 text-green-400',
    SCP: 'bg-blue-500/20 text-blue-400',
    RDP: 'bg-purple-500/20 text-purple-400',
    VNC: 'bg-orange-500/20 text-orange-400',
};

// ============================================================================
// HELPERS
// ============================================================================

function getIconComponent(iconName: string | null) {
    if (!iconName) return FolderOpen;
    const found = PRESET_ICONS.find(i => i.value === iconName);
    return found ? found.icon : FolderOpen;
}

// ============================================================================
// MODAL – Create / Edit Group
// ============================================================================

interface GroupFormData {
    name: string;
    description: string;
    color: string;
    icon: string;
}

function GroupModal({
    open,
    mode,
    initial,
    onClose,
    onSave,
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

    useEffect(() => {
        setForm(initial);
        setError('');
    }, [initial, open]);

    useEffect(() => {
        if (open) {
            setTimeout(() => nameRef.current?.focus(), 50);
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) { setError('Name is required'); return; }
        setSaving(true);
        setError('');
        try {
            await onSave(form);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const update = (fields: Partial<GroupFormData>) => setForm(f => ({ ...f, ...fields }));

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="bg-card border-border max-w-md">
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'Create Group' : 'Edit Group'}</DialogTitle>
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
                            placeholder="Brief description of this group..."
                            maxLength={200}
                            value={form.description}
                            onChange={e => update({ description: e.target.value })}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Color <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {PRESET_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => update({ color: form.color === c ? '' : c })}
                                    className={`w-7 h-7 rounded-full transition-all duration-150 ${
                                        form.color === c
                                            ? 'ring-2 ring-offset-2 ring-offset-card ring-white scale-110'
                                            : 'hover:scale-105'
                                    }`}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                />
                            ))}
                            <label className="w-7 h-7 rounded-full border-2 border-dashed border-border hover:border-muted-foreground transition-colors cursor-pointer flex items-center justify-center text-muted-foreground hover:text-foreground" title="Custom color">
                                <Plus className="w-3.5 h-3.5" />
                                <input
                                    type="color"
                                    className="sr-only"
                                    value={form.color || '#ffffff'}
                                    onChange={e => update({ color: e.target.value })}
                                />
                            </label>
                        </div>
                        {form.color && (
                            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: form.color }} />
                                <span>{form.color}</span>
                                <button type="button" onClick={() => update({ color: '' })} className="text-muted-foreground hover:text-foreground">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Icon <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {PRESET_ICONS.map(({ value, label, icon: Icon }) => (
                                <button
                                    key={value}
                                    type="button"
                                    title={label}
                                    onClick={() => update({ icon: form.icon === value ? '' : value })}
                                    className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-150 ${
                                        form.icon === value
                                            ? 'bg-primary/20 border-primary/60 text-primary'
                                            : 'bg-secondary border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
                            Cancel
                        </Button>
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
// GROUP CARD
// ============================================================================

function GroupCard({
    group,
    detail,
    expanded,
    onToggle,
    onEdit,
    onDelete,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
}: {
    group: Group;
    detail: GroupDetail | null;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
}) {
    const [loadingDetail] = useState(false);
    const IconComp = getIconComponent(group.icon);

    return (
        <Card className="transition-all duration-200 hover:shadow-md">
            <div
                className="flex items-center gap-4 p-4 cursor-pointer select-none"
                onClick={onToggle}
            >
                <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: group.color || '#475569', minHeight: '2rem' }}
                />

                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                        backgroundColor: group.color ? `${group.color}22` : 'rgb(30 41 59)',
                        border: `1px solid ${group.color ? `${group.color}44` : 'rgb(51 65 85)'}`,
                    }}
                >
                    <IconComp
                        className="w-5 h-5"
                        style={{ color: group.color || '#94a3b8' }}
                    />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">{group.name}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary/80 text-secondary-foreground text-xs">
                            {group._count.servers} {group._count.servers === 1 ? 'server' : 'servers'}
                        </span>
                    </div>
                    {group.description && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{group.description}</p>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                        disabled={isFirst}
                        onClick={onMoveUp}
                        title="Move up"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                        disabled={isLast}
                        onClick={onMoveDown}
                        title="Move down"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border mx-1" />
                    <button
                        onClick={onEdit}
                        title="Edit group"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onDelete}
                        title="Delete group"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-border mx-1" />
                    <div className={`p-1.5 rounded-lg text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
                        <ChevronRight className="w-4 h-4" />
                    </div>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/60">
                    {loadingDetail && (
                        <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading servers…
                        </div>
                    )}
                    {!loadingDetail && detail && detail.servers.length === 0 && (
                        <div className="px-6 py-5 text-center text-sm text-muted-foreground">
                            <FolderClosed className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            No servers in this group yet.
                            <Link
                                href="/apps/web/src/app/panel/servers/new"
                                className="block mt-2 text-primary hover:text-primary/80 transition-colors"
                            >
                                Add a server
                            </Link>
                        </div>
                    )}
                    {!loadingDetail && detail && detail.servers.length > 0 && (
                        <div className="divide-y divide-border/40">
                            {detail.servers.map(srv => (
                                <Link
                                    key={srv.id}
                                    href={`/panel/servers/${srv.id}`}
                                    className="flex items-center gap-3 px-6 py-3 hover:bg-accent/50 transition-colors group"
                                >
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium shrink-0 ${protocolColors[srv.protocol] || ''}`}>
                                        {srv.protocol}
                                    </span>
                                    <span className="text-sm text-foreground/80 truncate flex-1 group-hover:text-foreground transition-colors">
                                        {srv.name}
                                    </span>
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const EMPTY_FORM: GroupFormData = { name: '', description: '', color: '', icon: '' };

export default function GroupsPage() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [details, setDetails] = useState<Record<string, GroupDetail>>({});
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
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
            if (data.success) setGroups(data.data.groups);
        } catch {
            showToast('error', 'Failed to load groups');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadGroups(); }, [loadGroups]);

    const handleToggle = useCallback(async (groupId: string) => {
        if (expandedId === groupId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(groupId);
        if (details[groupId]) return;

        try {
            const res = await fetch(`/api/groups/${groupId}`);
            const data = await res.json();
            if (data.success) {
                setDetails(prev => ({ ...prev, [groupId]: data.data.group }));
            }
        } catch {
            /* silent */
        }
    }, [expandedId, details]);

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
        setGroups(prev => [...prev, { ...data.data.group, _count: { servers: 0 } }]);
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
            setGroups(prev => prev.filter(g => g.id !== deleteTarget.id));
            if (expandedId === deleteTarget.id) setExpandedId(null);
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

    const filtered = groups.filter(g =>
        !search || g.name.toLowerCase().includes(search.toLowerCase()) ||
        (g.description?.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="max-w-3xl mx-auto">
            {toast && (
                <div
                    className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-medium transition-all duration-300 ${
                        toast.type === 'success'
                            ? 'bg-green-500/10 border-green-500/30 text-green-300'
                            : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}
                >
                    {toast.type === 'success'
                        ? <Check className="w-4 h-4 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {toast.msg}
                </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Groups</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        Organise your servers into groups
                    </p>
                </div>
                <Button onClick={() => setShowCreate(true)} className="shrink-0">
                    <Plus className="w-4 h-4" />
                    Create Group
                </Button>
            </div>

            {groups.length > 3 && (
                <div className="relative mb-5">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        type="text"
                        className="bg-secondary border-border pl-9"
                        placeholder="Search groups…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Loading groups…</span>
                </div>
            ) : groups.length === 0 ? (
                <Card className="p-10 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                        <FolderOpen className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-lg font-semibold mb-2">No groups yet</h2>
                    <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
                        Groups help you organise servers by environment, project, or team.
                    </p>
                    <Button onClick={() => setShowCreate(true)} className="mx-auto">
                        <Plus className="w-4 h-4" />
                        Create your first group
                    </Button>
                </Card>
            ) : filtered.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No groups match &ldquo;{search}&rdquo;</p>
                    <button
                        onClick={() => setSearch('')}
                        className="mt-3 text-primary hover:text-primary/80 text-sm transition-colors"
                    >
                        Clear search
                    </button>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map((group, idx) => (
                        <GroupCard
                            key={group.id}
                            group={group}
                            detail={details[group.id] ?? null}
                            expanded={expandedId === group.id}
                            onToggle={() => handleToggle(group.id)}
                            onEdit={() => setEditTarget(group)}
                            onDelete={() => setDeleteTarget(group)}
                            onMoveUp={() => handleMove(group.id, 'up')}
                            onMoveDown={() => handleMove(group.id, 'down')}
                            isFirst={idx === 0}
                            isLast={idx === filtered.length - 1}
                        />
                    ))}

                    <p className="text-xs text-muted-foreground/40 text-center pt-2">
                        {groups.length} group{groups.length !== 1 ? 's' : ''}
                        {' · '}
                        {groups.reduce((s, g) => s + g._count.servers, 0)} server{groups.reduce((s, g) => s + g._count.servers, 0) !== 1 ? 's' : ''} total
                    </p>
                </div>
            )}

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
                        ? {
                              name: editTarget.name,
                              description: editTarget.description ?? '',
                              color: editTarget.color ?? '',
                              icon: editTarget.icon ?? '',
                          }
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
