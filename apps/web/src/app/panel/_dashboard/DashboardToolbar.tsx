'use client';

import {
    ArrowUpDown,
    Check,
    LayoutGrid,
    List,
    Loader2,
    RefreshCw,
    Search,
    Star,
    Tag,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PAGE_CONTENT_WIDTH } from '@/components/ui/page-header';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { protocolChipActive, protocolChipIdle } from '@/lib/style/protocol';
import {
    PROTOCOL_FILTERS,
    SORT_OPTIONS,
    type ProtocolFilter,
    type SortDir,
    type SortField,
    type ViewMode,
} from './types';

/** Per-protocol chip colours, from the shared categorical protocol table. */
function protocolChipClass(p: ProtocolFilter, active: boolean): string {
    if (p === 'all') {
        return active
            ? 'bg-accent text-foreground border-input'
            : 'text-muted-foreground border-border hover:text-foreground';
    }
    return active ? protocolChipActive[p] : protocolChipIdle[p];
}

interface DashboardToolbarProps {
    searchQuery: string;
    onSearchChange: (v: string) => void;
    searchPending: boolean;
    filter: 'all' | 'favorites';
    onFilterChange: (f: 'all' | 'favorites') => void;
    sort: { field: SortField; dir: SortDir };
    onSortChange: (field: SortField, dir: SortDir) => void;
    viewMode: ViewMode;
    onViewChange: (v: ViewMode) => void;
    onRefresh: () => void;
    refreshing: boolean;
    protocolFilter: ProtocolFilter;
    onProtocolFilterChange: (p: ProtocolFilter) => void;
    protocolCounts: Record<ProtocolFilter, number>;
    activeTag: string | null;
    onClearTag: () => void;
    allTags: string[];
    onSelectTag: (tag: string) => void;
}

/** Shared look for the small segmented toggles in this bar. */
const SEGMENTED = 'flex h-10 items-center rounded-md border border-input p-0.5 sm:h-9';
const segment = (active: boolean) =>
    `flex h-full items-center justify-center rounded-[5px] text-sm font-medium transition-colors ${
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
    }`;

/** Sticky search / filter / sort / view bar above the server list. */
export function DashboardToolbar({
    searchQuery,
    onSearchChange,
    searchPending,
    filter,
    onFilterChange,
    sort,
    onSortChange,
    viewMode,
    onViewChange,
    onRefresh,
    refreshing,
    protocolFilter,
    onProtocolFilterChange,
    protocolCounts,
    activeTag,
    onClearTag,
    allTags,
    onSelectTag,
}: DashboardToolbarProps) {
    const currentSortLabel =
        SORT_OPTIONS.find((o) => o.field === sort.field && o.dir === sort.dir)?.label ?? 'Sort';

    const showProtocolFilters = PROTOCOL_FILTERS.filter((p) => p !== 'all').some(
        (p) => protocolCounts[p] > 0,
    );

    return (
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-10 -mx-4 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
            <div className={`${PAGE_CONTENT_WIDTH} space-y-2.5`}>
                <div className="flex flex-wrap items-center gap-2 xl:gap-3">
                    <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1 sm:max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search by name, host or tag"
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="pl-9 pr-9"
                        />
                        {searchPending && (
                            <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground/50" />
                        )}
                    </div>

                    <div className="flex w-full shrink-0 items-center gap-1.5 sm:ml-auto sm:w-auto sm:gap-2">
                        <div className={SEGMENTED} role="group" aria-label="Show">
                            <button
                                onClick={() => onFilterChange('all')}
                                aria-pressed={filter === 'all'}
                                className={`${segment(filter === 'all')} hidden px-3 sm:flex`}
                            >
                                All
                            </button>
                            <button
                                onClick={() =>
                                    onFilterChange(filter === 'favorites' ? 'all' : 'favorites')
                                }
                                aria-pressed={filter === 'favorites'}
                                aria-label="Starred only"
                                className={`${segment(filter === 'favorites')} gap-1.5 px-2.5 sm:px-3`}
                            >
                                <Star
                                    className={`h-4 w-4 ${filter === 'favorites' ? 'fill-warning text-warning' : ''}`}
                                />
                                <span className="hidden sm:inline">Starred</span>
                            </button>
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    aria-label={`Sort: ${currentSortLabel}`}
                                    className="max-w-[180px] gap-1.5 px-2.5 sm:px-3"
                                >
                                    <ArrowUpDown className="shrink-0" />
                                    <span className="hidden truncate sm:inline">
                                        {currentSortLabel}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                                {SORT_OPTIONS.map((opt) => {
                                    const active = sort.field === opt.field && sort.dir === opt.dir;
                                    return (
                                        <DropdownMenuItem
                                            key={`${opt.field}-${opt.dir}`}
                                            onClick={() => onSortChange(opt.field, opt.dir)}
                                            className={active ? 'text-primary' : ''}
                                        >
                                            {active ? (
                                                <Check className="w-3 h-3 shrink-0" />
                                            ) : (
                                                <span className="w-3 shrink-0" />
                                            )}
                                            {opt.label}
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <div className={SEGMENTED} role="group" aria-label="Layout">
                            <button
                                onClick={() => onViewChange('grid')}
                                aria-pressed={viewMode === 'grid'}
                                className={`${segment(viewMode === 'grid')} w-9 sm:w-8`}
                                title="Grid view"
                                aria-label="Grid view"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onViewChange('list')}
                                aria-pressed={viewMode === 'list'}
                                className={`${segment(viewMode === 'list')} w-9 sm:w-8`}
                                title="List view"
                                aria-label="List view"
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onRefresh}
                            className="ml-auto sm:ml-0"
                            title="Refresh status"
                            aria-label="Refresh status"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                {showProtocolFilters && (
                    <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                        {PROTOCOL_FILTERS.map((p) => {
                            const count = protocolCounts[p];
                            if (p !== 'all' && count === 0) return null;
                            const active = protocolFilter === p;
                            return (
                                <button
                                    key={p}
                                    onClick={() => onProtocolFilterChange(p)}
                                    aria-pressed={active}
                                    className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:h-7 ${protocolChipClass(p, active)}`}
                                >
                                    {p === 'all' ? 'All' : p}
                                    <span className="tabular-nums opacity-60">{count}</span>
                                </button>
                            );
                        })}

                        {activeTag && (
                            <button
                                onClick={onClearTag}
                                aria-label={`Clear the ${activeTag} tag filter`}
                                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/12 px-3 text-xs font-medium text-primary sm:h-7"
                            >
                                <Tag className="w-3 h-3" />
                                {activeTag}
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                )}

                {allTags.length > 0 && !activeTag && (
                    <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                        <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        {allTags.map((tag) => (
                            <button
                                key={tag}
                                onClick={() => onSelectTag(tag)}
                                className="flex h-8 shrink-0 items-center rounded-full border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:border-input hover:text-foreground sm:h-7"
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
