'use client';

import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    FileX,
    Loader2,
    RefreshCw,
    X,
} from 'lucide-react';
import { formatBytes } from '@/lib/format';
import type { TransferItem, TransferItemStatus } from './useTransferQueue';

const STATUS_ICONS: Record<TransferItemStatus, React.ReactNode> = {
    queued: <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />,
    transferring: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />,
    done: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
    failed: <FileX className="w-3.5 h-3.5 text-red-400 shrink-0" />,
};

const BAR_COLORS: Record<TransferItemStatus, string> = {
    queued: 'bg-slate-600',
    transferring: 'bg-primary',
    done: 'bg-emerald-500',
    failed: 'bg-red-500',
};

function QueueItemRow({ item }: { item: TransferItem }) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary/40 rounded-lg transition-colors">
            {STATUS_ICONS[item.status]}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs text-foreground truncate font-medium">
                        {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatBytes(item.size, '—')}
                    </span>
                </div>
                {item.status !== 'failed' && (
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[item.status]}`}
                            style={{ width: `${item.progress}%` }}
                        />
                    </div>
                )}
                {item.status === 'failed' && item.error && (
                    <p className="text-[10px] text-red-400 truncate mt-0.5">{item.error}</p>
                )}
            </div>
        </div>
    );
}

/** Collapsible footer listing every queued/completed transfer. */
export function TransferQueuePanel({
    queue,
    open,
    onToggle,
    isTransferring,
    doneItems,
    totalItems,
    failedItems,
    onRetry,
    onClear,
}: {
    queue: TransferItem[];
    open: boolean;
    onToggle: () => void;
    isTransferring: boolean;
    doneItems: number;
    totalItems: number;
    failedItems: number;
    onRetry: () => void;
    onClear: () => void;
}) {
    if (queue.length === 0) return null;

    return (
        <div className="shrink-0 border-t border-border bg-card/80">
            <button
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-secondary/40 transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-center gap-2">
                    {isTransferring ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                    ) : failedItems > 0 ? (
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="text-xs font-medium">Transfer queue</span>
                    <span className="text-[10px] text-muted-foreground">
                        {doneItems}/{totalItems} done
                        {failedItems > 0 && (
                            <span className="text-red-400 ml-1">· {failedItems} failed</span>
                        )}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {failedItems > 0 && !isTransferring && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRetry();
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/20 border border-primary/30 text-primary text-[10px] font-medium hover:bg-primary/30"
                        >
                            <RefreshCw className="w-2.5 h-2.5" /> Retry
                        </button>
                    )}
                    {!isTransferring && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onClear();
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-muted-foreground text-[10px] hover:text-foreground"
                        >
                            <X className="w-2.5 h-2.5" /> Clear
                        </button>
                    )}
                    {open ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                </div>
            </button>

            {open && (
                <div className="max-h-44 overflow-y-auto px-2 pb-2 space-y-0.5">
                    {queue.map((item) => (
                        <QueueItemRow key={item.id} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
}
