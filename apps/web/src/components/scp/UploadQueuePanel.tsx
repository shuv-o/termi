'use client';

import { AlertCircle, Check, ChevronUp, Loader2, X } from 'lucide-react';
import type { UploadItem } from './types';

/** Collapsible list of in-flight and finished uploads. */
export function UploadQueuePanel({
    uploads,
    expanded,
    onToggle,
    onDismiss,
    pendingCount,
    doneCount,
}: {
    uploads: UploadItem[];
    expanded: boolean;
    onToggle: () => void;
    onDismiss: (id: string) => void;
    pendingCount: number;
    doneCount: number;
}) {
    if (uploads.length === 0) return null;

    return (
        <div className="shrink-0 border-t border-slate-700 bg-slate-800/50">
            <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                onClick={onToggle}
            >
                <span className="flex items-center gap-1.5">
                    {pendingCount > 0 && <Loader2 className="w-3 h-3 animate-spin text-sky-400" />}
                    Uploads ({doneCount}/{uploads.length})
                </span>
                <ChevronUp
                    className={`w-3.5 h-3.5 transition-transform ${expanded ? '' : 'rotate-180'}`}
                />
            </button>
            {expanded && (
                <div className="max-h-36 overflow-y-auto px-3 pb-2 space-y-1">
                    {uploads.map((u) => (
                        <div key={u.id} className="flex items-center gap-2">
                            <div className="shrink-0 w-3.5">
                                {u.status === 'done' && (
                                    <Check className="w-3.5 h-3.5 text-green-400" />
                                )}
                                {u.status === 'error' && (
                                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                )}
                                {u.status === 'uploading' && (
                                    <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-300 truncate">{u.name}</p>
                                {u.status === 'uploading' && (
                                    <div className="h-1 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
                                        <div
                                            className="h-full bg-sky-500 rounded-full transition-all"
                                            style={{ width: `${u.progress}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                            {u.status !== 'uploading' && (
                                <button
                                    onClick={() => onDismiss(u.id)}
                                    className="p-0.5 text-slate-600 hover:text-white"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
