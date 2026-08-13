'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import type { Group, GroupDetail, GroupFormData } from './types';

type ToastKind = 'success' | 'error';

/** Group list, per-group detail cache, and every mutation the page performs. */
export function useGroups() {
    // Cached: revisiting Groups paints the list immediately and revalidates
    // quietly, rather than replaying the skeleton on every navigation.
    const {
        data: groupsData,
        isLoading: loading,
        mutate: mutateGroups,
    } = useCachedFetch<{ groups: Group[] }>('/api/groups');

    const groups = useMemo(() => groupsData?.groups ?? [], [groupsData]);
    const setGroups = useCallback(
        (updater: Group[] | ((prev: Group[]) => Group[])) => {
            mutateGroups((prev) => ({
                groups: typeof updater === 'function' ? updater(prev?.groups ?? []) : updater,
            }));
        },
        [mutateGroups],
    );

    const [details, setDetails] = useState<Record<string, GroupDetail>>({});
    const [loadingDetail, setLoadingDetail] = useState(false);
    // Seeded from `?group=` (e.g. the command palette) so the deep link wins
    // outright — setting this any later would race the auto-select effect
    // below, which runs as soon as the group list loads.
    const [selectedId, setSelectedId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return new URLSearchParams(window.location.search).get('group');
    });
    const [search, setSearch] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState<{ type: ToastKind; msg: string } | null>(null);

    const showToast = useCallback((type: ToastKind, msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    }, []);

    // Auto-select the first group once the list is available (and whenever the
    // current selection disappears, e.g. after a delete).
    useEffect(() => {
        if (groups.length > 0 && !groups.some((g) => g.id === selectedId)) {
            setSelectedId(groups[0].id);
        }
    }, [groups, selectedId]);

    const loadDetail = useCallback(
        async (groupId: string) => {
            if (details[groupId]) return;
            setLoadingDetail(true);
            try {
                const res = await fetch(`/api/groups/${groupId}`);
                const data = await res.json();
                if (data.success) setDetails((prev) => ({ ...prev, [groupId]: data.data.group }));
            } catch {
                /* silent */
            } finally {
                setLoadingDetail(false);
            }
        },
        [details],
    );

    // Auto-load detail when selection changes
    useEffect(() => {
        if (selectedId) loadDetail(selectedId);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the selection changes
    }, [selectedId]);

    const select = useCallback(
        (groupId: string) => {
            setSelectedId(groupId);
            loadDetail(groupId);
        },
        [loadDetail],
    );

    const create = useCallback(
        async (form: GroupFormData) => {
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
            setGroups((prev) => [...prev, newGroup]);
            setSelectedId(newGroup.id);
            showToast('success', `Group "${form.name.trim()}" created`);
        },
        [setGroups, showToast],
    );

    const update = useCallback(
        async (target: Group, form: GroupFormData) => {
            const res = await fetch(`/api/groups/${target.id}`, {
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
            setGroups((prev) =>
                prev.map((g) => (g.id === target.id ? { ...g, ...data.data.group } : g)),
            );
            // Drop the cached detail so it re-fetches with the new metadata.
            setDetails((prev) => {
                const next = { ...prev };
                delete next[target.id];
                return next;
            });
            showToast('success', 'Group updated');
        },
        [setGroups, showToast],
    );

    const remove = useCallback(
        async (target: Group): Promise<boolean> => {
            setDeleting(true);
            try {
                const res = await fetch(`/api/groups/${target.id}`, { method: 'DELETE' });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || 'Failed to delete group');
                setGroups((prev) => {
                    const next = prev.filter((g) => g.id !== target.id);
                    if (selectedId === target.id) {
                        setSelectedId(next.length > 0 ? next[0].id : null);
                    }
                    return next;
                });
                showToast('success', `Group "${target.name}" deleted`);
                return true;
            } catch {
                showToast('error', 'Failed to delete group');
                return false;
            } finally {
                setDeleting(false);
            }
        },
        [setGroups, selectedId, showToast],
    );

    /** Optimistic reorder — reverts the list if the API call fails. */
    const move = useCallback(
        async (groupId: string, direction: 'up' | 'down') => {
            const idx = groups.findIndex((g) => g.id === groupId);
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
                    body: JSON.stringify({ groupIds: next.map((g) => g.id) }),
                });
            } catch {
                setGroups(groups);
                showToast('error', 'Failed to reorder groups');
            }
        },
        [groups, showToast, setGroups],
    );

    const filtered = useMemo(
        () =>
            groups.filter(
                (g) =>
                    !search ||
                    g.name.toLowerCase().includes(search.toLowerCase()) ||
                    g.description?.toLowerCase().includes(search.toLowerCase()),
            ),
        [groups, search],
    );

    return {
        groups,
        filtered,
        loading,
        search,
        setSearch,
        selectedId,
        select,
        selectedGroup: groups.find((g) => g.id === selectedId) ?? null,
        selectedDetail: selectedId ? (details[selectedId] ?? null) : null,
        loadingDetail,
        totalServers: groups.reduce((s, g) => s + g._count.servers, 0),
        toast,
        create,
        update,
        remove,
        deleting,
        move,
    };
}
