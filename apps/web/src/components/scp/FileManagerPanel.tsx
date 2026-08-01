'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronUp, Download, Folder, Pencil, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

import { DesktopEntryRow, MobileEntryRow, type EntryRowActions } from './FileEntryRows';
import { DeleteDialog, NewFolderDialog, RenameDialog } from './FileManagerDialogs';
import { FileManagerToolbar } from './FileManagerToolbar';
import { BottomSheet, SheetAction } from './Overlays';
import { UploadQueuePanel } from './UploadQueuePanel';
import { useSftpDirectory } from './useSftpDirectory';
import { useUploadQueue } from './useUploadQueue';
import { parent, sortEntries, type FileManagerPanelProps, type RemoteEntry } from './types';

export type { RemoteEntry, FileManagerPanelProps } from './types';

export default function FileManagerPanel({
    serverId,
    onClose,
    onSelectionChange,
}: FileManagerPanelProps) {
    const isMobile = useIsMobile();

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showHidden, setShowHidden] = useState(false);
    // Mobile-specific: tap-to-select mode
    const [selectMode, setSelectMode] = useState(false);

    const clearSelection = useCallback(() => {
        setSelected(new Set());
        setSelectMode(false);
    }, []);

    const dir = useSftpDirectory(serverId, clearSelection);
    const { currentPath, entries, loading, error, loadDir, reload } = dir;

    const uploads = useUploadQueue(serverId, currentPath, reload);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Dialogs / sheets
    const [renaming, setRenaming] = useState<RemoteEntry | null>(null);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<RemoteEntry[] | null>(null);
    const [mobileActionEntry, setMobileActionEntry] = useState<RemoteEntry | null>(null);

    // Notify parent (transfer mode) whenever selection or path changes
    useEffect(() => {
        if (!onSelectionChange) return;
        onSelectionChange(
            entries.filter((e) => selected.has(e.path)),
            currentPath,
        );
    }, [selected, currentPath, entries, onSelectionChange]);

    const visible = sortEntries(entries.filter((e) => showHidden || !e.name.startsWith('.')));

    const toggle = useCallback((path: string) => {
        setSelected((p) => {
            const n = new Set(p);
            if (n.has(path)) n.delete(path);
            else n.add(path);
            return n;
        });
    }, []);

    const rowActions: EntryRowActions = {
        // On mobile a tap selects (in select mode), descends, or opens the sheet.
        onOpen: (entry) => {
            if (isMobile && selectMode) toggle(entry.path);
            else if (entry.type === 'dir') loadDir(entry.path);
            else if (isMobile) setMobileActionEntry(entry);
        },
        onToggleSelect: toggle,
        onDownload: dir.download,
        onRename: setRenaming,
        onDelete: (entry) => setDeleteTarget([entry]),
        onMoreActions: setMobileActionEntry,
    };

    return (
        <div
            className="relative flex flex-col h-full bg-slate-900 overflow-hidden"
            {...uploads.dragHandlers}
        >
            {uploads.dragging && (
                <div
                    className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2
                    bg-slate-900/95 border-2 border-dashed border-sky-500 rounded-xl pointer-events-none"
                >
                    <Upload className="w-8 h-8 text-sky-400" />
                    <p className="text-sm font-semibold text-sky-300">Drop to upload</p>
                </div>
            )}

            <FileManagerToolbar
                currentPath={currentPath}
                loading={loading}
                isMobile={isMobile}
                selectMode={selectMode}
                onToggleSelectMode={() => {
                    setSelectMode((m) => !m);
                    if (selectMode) setSelected(new Set());
                }}
                showHidden={showHidden}
                onToggleHidden={() => setShowHidden((h) => !h)}
                onNavigate={loadDir}
                onNewFolder={() => setShowNewFolder(true)}
                onUpload={() => fileInputRef.current?.click()}
                onRefresh={reload}
                onClose={onClose}
            />

            {isMobile && selectMode && (
                <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-sky-500/10 border-b border-sky-500/20">
                    <span className="text-xs text-sky-300 font-medium">
                        {selected.size > 0 ? `${selected.size} selected` : 'Tap items to select'}
                    </span>
                    <button
                        onClick={clearSelection}
                        className="text-xs text-sky-400 active:text-white"
                    >
                        Done
                    </button>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto">
                {error ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                        <AlertCircle className="w-6 h-6 text-red-400" />
                        <p className="text-sm text-red-400">{error}</p>
                        <Button variant="secondary" size="sm" onClick={reload}>
                            Retry
                        </Button>
                    </div>
                ) : (
                    <div className="py-0.5">
                        {currentPath !== '/' && (
                            <button
                                onClick={() => loadDir(parent(currentPath))}
                                className={`w-full flex items-center gap-2.5 px-3 hover:bg-slate-800/60 active:bg-slate-800 transition-colors
                                    ${isMobile ? 'py-4' : 'py-2'}`}
                            >
                                <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" />
                                <span className="text-xs text-slate-500 font-mono">..</span>
                                <span className="text-xs text-slate-600 ml-1">
                                    Parent directory
                                </span>
                            </button>
                        )}

                        {loading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`flex items-center gap-2.5 px-3 ${isMobile ? 'py-3.5' : 'py-2'}`}
                                >
                                    <Skeleton className="w-4 h-4 rounded shrink-0" />
                                    <Skeleton
                                        className={`h-4 rounded ${i % 3 === 0 ? 'w-32' : i % 3 === 1 ? 'w-44' : 'w-24'}`}
                                    />
                                </div>
                            ))
                        ) : visible.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2">
                                <Folder className="w-8 h-8 opacity-40" />
                                <p className="text-sm">Empty directory</p>
                            </div>
                        ) : (
                            visible.map((entry) =>
                                isMobile ? (
                                    <MobileEntryRow
                                        key={entry.path}
                                        entry={entry}
                                        isSelected={selected.has(entry.path)}
                                        selectMode={selectMode}
                                        actions={rowActions}
                                    />
                                ) : (
                                    <DesktopEntryRow
                                        key={entry.path}
                                        entry={entry}
                                        isSelected={selected.has(entry.path)}
                                        actions={rowActions}
                                    />
                                ),
                            )
                        )}
                    </div>
                )}
            </div>

            {selected.size > 0 && (
                <div
                    className={`shrink-0 flex items-center justify-between gap-2 px-3 border-t border-slate-700 bg-slate-800/80
                    ${isMobile ? 'py-3' : 'py-2'}`}
                >
                    <span className={`${isMobile ? 'text-sm' : 'text-xs'} text-slate-300`}>
                        {selected.size} selected
                    </span>
                    <Button
                        variant="destructive"
                        size={isMobile ? 'default' : 'sm'}
                        onClick={() => setDeleteTarget(entries.filter((e) => selected.has(e.path)))}
                        className="gap-1"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                    </Button>
                </div>
            )}

            <UploadQueuePanel
                uploads={uploads.uploads}
                expanded={uploads.expanded}
                onToggle={() => uploads.setExpanded((e) => !e)}
                onDismiss={uploads.dismiss}
                pendingCount={uploads.pendingCount}
                doneCount={uploads.doneCount}
            />

            <div className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-slate-800 bg-slate-900/60">
                <span className="text-[10px] text-slate-600">
                    {visible.length} item{visible.length !== 1 ? 's' : ''}
                    {!showHidden && entries.length !== visible.length
                        ? ` · ${entries.length - visible.length} hidden`
                        : ''}
                </span>
                <span className="text-[10px] text-slate-700 font-mono truncate max-w-[160px]">
                    {currentPath}
                </span>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) uploads.uploadFiles(e.target.files);
                    e.target.value = '';
                }}
            />

            {mobileActionEntry && (
                <BottomSheet
                    title={mobileActionEntry.name}
                    onClose={() => setMobileActionEntry(null)}
                >
                    {mobileActionEntry.type === 'dir' ? (
                        <SheetAction
                            icon={Folder}
                            label="Open folder"
                            onClick={() => {
                                loadDir(mobileActionEntry.path);
                                setMobileActionEntry(null);
                            }}
                        />
                    ) : (
                        <SheetAction
                            icon={Download}
                            label="Download"
                            onClick={() => {
                                dir.download(mobileActionEntry);
                                setMobileActionEntry(null);
                            }}
                        />
                    )}
                    <SheetAction
                        icon={Pencil}
                        label="Rename"
                        onClick={() => {
                            setRenaming(mobileActionEntry);
                            setMobileActionEntry(null);
                        }}
                    />
                    <SheetAction
                        icon={Trash2}
                        label="Delete"
                        variant="danger"
                        onClick={() => {
                            setDeleteTarget([mobileActionEntry]);
                            setMobileActionEntry(null);
                        }}
                    />
                </BottomSheet>
            )}

            {showNewFolder && (
                <NewFolderDialog
                    onCreate={dir.createFolder}
                    onClose={() => setShowNewFolder(false)}
                />
            )}

            {renaming && (
                <RenameDialog
                    entry={renaming}
                    onRename={dir.rename}
                    onClose={() => setRenaming(null)}
                />
            )}

            {deleteTarget && (
                <DeleteDialog
                    targets={deleteTarget}
                    onDelete={dir.remove}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
}
