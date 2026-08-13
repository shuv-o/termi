'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

import { GroupDetailPanel } from './_components/GroupDetailPanel';
import { GroupModal } from './_components/GroupModal';
import { GroupSidebar } from './_components/GroupSidebar';
import { useGroups } from './_components/useGroups';
import { EMPTY_FORM, type Group } from './_components/types';

export default function GroupsPage() {
    const router = useRouter();
    const g = useGroups();

    const [showCreate, setShowCreate] = useState(false);
    const [editTarget, setEditTarget] = useState<Group | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
    // On mobile the list and detail panel are two full-screen views, not a
    // side-by-side split, so selecting a group doesn't automatically mean
    // "show its detail" the way it does on desktop — that's tracked here,
    // separately from `g.selectedId`, which always has a group (auto-picked)
    // so the desktop split view never shows a blank right pane.
    const [mobileShowDetail, setMobileShowDetail] = useState(false);
    const showDetailOnMobile = mobileShowDetail && !!g.selectedGroup;

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!deleteTarget) return;
        if (await g.remove(deleteTarget)) setDeleteTarget(null);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] lg:h-[calc(100vh-0rem)] -m-4 lg:-m-8">
            {g.toast && (
                <div
                    className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-medium transition-all duration-300 ${
                        g.toast.type === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}
                >
                    {g.toast.type === 'success' ? (
                        <Check className="w-4 h-4 shrink-0" />
                    ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    {g.toast.msg}
                </div>
            )}

            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0 bg-card/50 backdrop-blur-sm lg:px-8">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="mt-0.5 text-xl sm:text-2xl font-bold">Groups</h1>
                        <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                            {g.loading
                                ? 'Loading…'
                                : `${g.groups.length} group${g.groups.length !== 1 ? 's' : ''} · ${g.totalServers} server${g.totalServers !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                </div>
                <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Create Group</span>
                    <span className="sm:hidden">Create</span>
                </Button>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <GroupSidebar
                    groups={g.groups}
                    filtered={g.filtered}
                    loading={g.loading}
                    selectedId={g.selectedId}
                    search={g.search}
                    onSearchChange={g.setSearch}
                    totalServers={g.totalServers}
                    onSelect={(id) => {
                        g.select(id);
                        setMobileShowDetail(true);
                    }}
                    onMove={g.move}
                    onEdit={setEditTarget}
                    onDelete={setDeleteTarget}
                    onCreate={() => setShowCreate(true)}
                    hideOnMobile={showDetailOnMobile}
                />

                <div
                    className={`flex-1 min-w-0 min-h-0 overflow-hidden ${
                        !g.selectedGroup
                            ? 'hidden lg:flex'
                            : showDetailOnMobile
                              ? ''
                              : 'hidden lg:block'
                    }`}
                >
                    <GroupDetailPanel
                        group={g.selectedGroup}
                        detail={g.selectedDetail}
                        loadingDetail={g.loadingDetail}
                        onEdit={setEditTarget}
                        onDelete={setDeleteTarget}
                        onConnect={(serverId, protocol) =>
                            router.push(`/panel/connect/${serverId}/${protocol.toLowerCase()}`)
                        }
                        onBack={() => setMobileShowDetail(false)}
                    />
                </div>
            </div>

            <GroupModal
                open={showCreate}
                mode="create"
                initial={EMPTY_FORM}
                onClose={() => setShowCreate(false)}
                onSave={g.create}
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
                onSave={(form) => g.update(editTarget!, form)}
            />

            <AlertDialog
                open={!!deleteTarget}
                onOpenChange={(o) => !o && !g.deleting && setDeleteTarget(null)}
            >
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
                                    <span className="text-foreground font-medium">
                                        &ldquo;{deleteTarget?.name}&rdquo;
                                    </span>
                                    ?
                                    {deleteTarget && deleteTarget._count.servers > 0 && (
                                        <>
                                            {' '}
                                            The {deleteTarget._count.servers} server
                                            {deleteTarget._count.servers !== 1 ? 's' : ''} in this
                                            group will be ungrouped.
                                        </>
                                    )}
                                </AlertDialogDescription>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={g.deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={g.deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {g.deleting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
