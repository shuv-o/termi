'use client';

import {
    ChevronDown,
    ChevronUp,
    FolderOpen,
    MoreVertical,
    Pencil,
    Search,
    Server,
    Trash2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DEFAULT_GROUP_COLOR, getIconComponent, type Group } from './types';

function GroupRow({
    group,
    isSelected,
    isFirst,
    isLast,
    onSelect,
    onMove,
    onEdit,
    onDelete,
}: {
    group: Group;
    isSelected: boolean;
    isFirst: boolean;
    isLast: boolean;
    onSelect: () => void;
    onMove: (direction: 'up' | 'down') => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const IconComp = getIconComponent(group.icon);
    const color = group.color || DEFAULT_GROUP_COLOR;

    return (
        <div
            className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-primary/10 text-foreground'
                    : 'hover:bg-secondary/60 text-muted-foreground hover:text-foreground'
            }`}
            onClick={onSelect}
        >
            {isSelected && (
                <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                    style={{ backgroundColor: color }}
                />
            )}

            <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                style={{ backgroundColor: `${color}22`, borderColor: `${color}44` }}
            >
                <IconComp className="w-3.5 h-3.5" style={{ color }} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span
                        className={`text-sm font-medium truncate ${isSelected ? 'text-foreground' : ''}`}
                    >
                        {group.name}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                    <Server className="w-3 h-3 shrink-0" />
                    <span>
                        {group._count.servers} server{group._count.servers !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            <div
                className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    disabled={isFirst}
                    onClick={() => onMove('up')}
                    title="Move up"
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronUp className="w-3 h-3" />
                </button>
                <button
                    disabled={isLast}
                    onClick={() => onMove('down')}
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
                        <DropdownMenuItem onClick={onEdit} className="gap-2 text-xs">
                            <Pencil className="w-3.5 h-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={onDelete}
                            className="gap-2 text-xs text-destructive focus:text-destructive"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

/** Searchable, reorderable list of groups down the left edge. */
export function GroupSidebar({
    groups,
    filtered,
    loading,
    selectedId,
    search,
    onSearchChange,
    totalServers,
    onSelect,
    onMove,
    onEdit,
    onDelete,
    onCreate,
    hideOnMobile,
}: {
    groups: Group[];
    filtered: Group[];
    loading: boolean;
    selectedId: string | null;
    search: string;
    onSearchChange: (v: string) => void;
    totalServers: number;
    onSelect: (id: string) => void;
    onMove: (id: string, direction: 'up' | 'down') => void;
    onEdit: (g: Group) => void;
    onDelete: (g: Group) => void;
    onCreate: () => void;
    /** Hidden on mobile while a group's detail is showing full-screen. */
    hideOnMobile?: boolean;
}) {
    return (
        <div
            className={`${hideOnMobile ? 'hidden lg:flex' : 'flex'} w-full lg:w-72 xl:w-80 flex-col border-r border-border/60 bg-card/30 shrink-0 min-h-0 overflow-hidden`}
        >
            <div className="px-3 py-3 border-b border-border/40 shrink-0">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                        type="text"
                        className="bg-secondary border-border pl-8 h-8 text-sm"
                        placeholder="Search groups…"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                {loading ? (
                    <div className="px-3 space-y-2 pt-1">
                        {[1, 2, 3].map((i) => (
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
                                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-secondary/30">
                                    <Search className="h-10 w-10 text-muted-foreground/35" />
                                </div>
                                <p>No match for &ldquo;{search}&rdquo;</p>
                                <button
                                    onClick={() => onSearchChange('')}
                                    className="mt-2 text-primary hover:text-primary/80 text-xs transition-colors"
                                >
                                    Clear search
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-secondary/30">
                                    <FolderOpen className="h-10 w-10 text-muted-foreground/35" />
                                </div>
                                <p>No groups yet</p>
                                <button
                                    onClick={onCreate}
                                    className="mt-2 text-primary hover:text-primary/80 text-xs transition-colors"
                                >
                                    Create your first group
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="px-2 space-y-0.5">
                        {filtered.map((group, idx) => (
                            <GroupRow
                                key={group.id}
                                group={group}
                                isSelected={selectedId === group.id}
                                isFirst={idx === 0}
                                isLast={idx === filtered.length - 1}
                                onSelect={() => onSelect(group.id)}
                                onMove={(direction) => onMove(group.id, direction)}
                                onEdit={() => onEdit(group)}
                                onDelete={() => onDelete(group)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {!loading && groups.length > 0 && (
                <div className="px-4 py-3 border-t border-border/40 shrink-0 bg-secondary/20">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
                        <span>
                            {groups.length} group{groups.length !== 1 ? 's' : ''}
                        </span>
                        <span>
                            {totalServers} server{totalServers !== 1 ? 's' : ''} total
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
