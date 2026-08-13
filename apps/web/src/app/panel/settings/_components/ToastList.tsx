'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { Toast, ToastType } from '../types';

const ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
};

const COLORS: Record<ToastType, string> = {
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    error: 'bg-red-500/10 border-red-500/30 text-red-300',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    info: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
};

export function ToastList({
    toasts,
    onDismiss,
}: {
    toasts: Toast[];
    onDismiss: (id: number) => void;
}) {
    if (!toasts.length) return null;
    return (
        <div className="fixed bottom-20 left-3 right-3 sm:bottom-6 sm:left-auto sm:right-6 z-50 flex flex-col gap-2 sm:w-80">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm shadow-xl backdrop-blur-sm ${COLORS[t.type]}`}
                >
                    {ICONS[t.type]}
                    <span className="flex-1">{t.message}</span>
                    <button
                        onClick={() => onDismiss(t.id)}
                        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}
