'use client';

import { Check, Download, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatBytes, formatUnixDate } from '@/lib/format';
import { EntryIcon } from './EntryIcon';
import type { RemoteEntry } from './types';

export interface EntryRowActions {
    onOpen: (entry: RemoteEntry) => void;
    onToggleSelect: (path: string) => void;
    onDownload: (entry: RemoteEntry) => void;
    onRename: (entry: RemoteEntry) => void;
    onDelete: (entry: RemoteEntry) => void;
    onMoreActions: (entry: RemoteEntry) => void;
}

/** Touch-first row: whole row is tappable, actions live in a bottom sheet. */
export function MobileEntryRow({
    entry,
    isSelected,
    selectMode,
    actions,
}: {
    entry: RemoteEntry;
    isSelected: boolean;
    selectMode: boolean;
    actions: EntryRowActions;
}) {
    return (
        <div
            className={`flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-card/80
                ${isSelected ? 'bg-info/10' : ''}`}
            onClick={() => actions.onOpen(entry)}
        >
            {selectMode && (
                <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                        ${isSelected ? 'bg-info border-info' : 'border-muted-foreground/40'}`}
                >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
            )}

            <EntryIcon entry={entry} size="md" />

            <div className="flex-1 min-w-0">
                <span
                    className={`text-sm truncate block font-medium leading-snug
                        ${entry.type === 'dir' ? 'text-warning' : 'text-foreground'}`}
                >
                    {entry.name}
                </span>
                <span className="text-xs text-muted-foreground/80 block mt-0.5">
                    {entry.type === 'dir' ? 'Folder' : formatBytes(entry.size, '—')}
                    {entry.modifiedAt ? ` · ${formatUnixDate(entry.modifiedAt)}` : ''}
                </span>
            </div>

            {!selectMode && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        actions.onMoreActions(entry);
                    }}
                    className="p-2.5 rounded-full text-muted-foreground/80 active:bg-secondary shrink-0 -mr-1"
                    aria-label="More options"
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}

/** Dense row with a checkbox and hover-revealed inline actions. */
export function DesktopEntryRow({
    entry,
    isSelected,
    actions,
}: {
    entry: RemoteEntry;
    isSelected: boolean;
    actions: EntryRowActions;
}) {
    const isDir = entry.type === 'dir';

    return (
        <div
            className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors
                ${isSelected ? 'bg-info/10' : 'hover:bg-card/60'}`}
            onClick={() => (isDir ? actions.onOpen(entry) : actions.onToggleSelect(entry.path))}
            onDoubleClick={() => isDir && actions.onOpen(entry)}
        >
            <Checkbox
                checked={isSelected}
                onCheckedChange={() => actions.onToggleSelect(entry.path)}
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 data-[state=checked]:opacity-100"
            />

            <EntryIcon entry={entry} />

            <div className="flex-1 min-w-0">
                <span
                    className={`text-sm truncate block ${isDir ? 'text-warning font-medium' : 'text-foreground'}`}
                >
                    {entry.name}
                </span>
            </div>

            <span className="text-[10px] text-muted-foreground/80 shrink-0 w-8 text-right">
                {isDir ? '' : formatBytes(entry.size, '—')}
            </span>

            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {!isDir && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            actions.onDownload(entry);
                        }}
                        className="p-1 rounded-sm hover:bg-secondary text-muted-foreground/80 hover:text-info transition-colors"
                        title="Download"
                    >
                        <Download className="w-3 h-3" />
                    </button>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        actions.onRename(entry);
                    }}
                    className="p-1 rounded-sm hover:bg-secondary text-muted-foreground/80 hover:text-warning transition-colors"
                    title="Rename"
                >
                    <Pencil className="w-3 h-3" />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        actions.onDelete(entry);
                    }}
                    className="p-1 rounded-sm hover:bg-secondary text-muted-foreground/80 hover:text-danger transition-colors"
                    title="Delete"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}
