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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    PROTOCOL_FILTERS,
    SORT_OPTIONS,
    type ProtocolFilter,
    type SortDir,
    type SortField,
    type ViewMode,
} from './types';

/** Per-protocol chip colours, split by active state. */
function protocolChipClass(p: ProtocolFilter, active: boolean): string {
    const map: Record<string, string> = {
        SSH: active
            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
            : 'text-muted-foreground border-border hover:border-emerald-500/30 hover:text-emerald-400',
        SCP: active
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
            : 'text-muted-foreground border-border hover:border-blue-500/30 hover:text-blue-400',
        RDP: active
            ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
            : 'text-muted-foreground border-border hover:border-purple-500/30 hover:text-purple-400',
        VNC: active
            ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
            : 'text-muted-foreground border-border hover:border-orange-500/30 hover:text-orange-400',
        TELNET: active
            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
            : 'text-muted-foreground border-border hover:border-cyan-500/30 hover:text-cyan-400',
        all: active
            ? 'bg-primary/15 text-primary border-primary/30'
            : 'text-muted-foreground border-border hover:text-foreground',
    };
    return map[p];
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
        <div className="-mx-4 sticky top-14 lg:top-0 z-10 border-b border-border bg-background/95 px-4 py-2.5 sm:py-3 backdrop-blur-sm lg:-mx-8 lg:px-8">
            <div className="mx-auto max-w-screen-2xl space-y-2.5 sm:space-y-3">
                <div className="flex items-center gap-2 xl:gap-3">
                    <div className="relative flex-1 max-w-xs sm:max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search servers..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-9 bg-secondary pl-9 pr-9 text-sm"
                        />
                        {searchPending && (
                            <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground/50" />
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
                        <Button
                            onClick={() => onFilterChange('all')}
                            variant={filter === 'all' ? 'default' : 'secondary'}
                            size="sm"
                            className="h-9 px-3 text-xs hidden sm:flex"
                        >
                            All
                        </Button>
                        <Button
                            onClick={() => onFilterChange('favorites')}
                            variant={filter === 'favorites' ? 'default' : 'secondary'}
                            size="sm"
                            className="h-9 px-2.5 sm:px-3 text-xs gap-1.5"
                        >
                            <Star className="w-3.5 h-3.5" />{' '}
                            <span className="hidden sm:inline">Starred</span>
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-9 max-w-[180px] gap-1.5 px-2.5 sm:px-3 text-xs"
                                >
                                    <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                                    <span className="hidden truncate sm:inline">
                                        {currentSortLabel}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                    Sort by
                                </DropdownMenuLabel>
                                {SORT_OPTIONS.map((opt) => {
                                    const active = sort.field === opt.field && sort.dir === opt.dir;
                                    return (
                                        <DropdownMenuItem
                                            key={`${opt.field}-${opt.dir}`}
                                            onClick={() => onSortChange(opt.field, opt.dir)}
                                            className={`gap-2 text-xs ${active ? 'text-primary' : ''}`}
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

                        <div className="flex overflow-hidden rounded-lg border border-border">
                            <button
                                onClick={() => onViewChange('grid')}
                                className={`px-2 sm:px-2.5 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                                title="Grid view"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onViewChange('list')}
                                className={`px-2 sm:px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                                title="List view"
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>

                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={onRefresh}
                            className="h-9 w-9"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                {showProtocolFilters && (
                    <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
                        {PROTOCOL_FILTERS.map((p) => {
                            const count = protocolCounts[p];
                            if (p !== 'all' && count === 0) return null;
                            const active = protocolFilter === p;
                            return (
                                <button
                                    key={p}
                                    onClick={() => onProtocolFilterChange(p)}
                                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${protocolChipClass(p, active)}`}
                                >
                                    {p === 'all' ? 'All protocols' : p}
                                    <span className="tabular-nums opacity-60">{count}</span>
                                </button>
                            );
                        })}

                        {activeTag && (
                            <button
                                onClick={onClearTag}
                                className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition-all"
                            >
                                <Tag className="w-3 h-3" />
                                {activeTag}
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                )}

                {allTags.length > 0 && !activeTag && (
                    <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
                        <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        {allTags.map((tag) => (
                            <button
                                key={tag}
                                onClick={() => onSelectTag(tag)}
                                className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
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
