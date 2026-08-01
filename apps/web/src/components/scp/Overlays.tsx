'use client';

import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Mobile action menu that slides up from the bottom edge. */
export function BottomSheet({
    title,
    children,
    onClose,
}: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col justify-end bg-black/60"
            onClick={onClose}
        >
            <div
                className="bg-slate-800 rounded-t-2xl border-t border-slate-700 shadow-2xl max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-600" />
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60">
                    <h3 className="font-medium text-sm text-white truncate pr-4">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full bg-slate-700/60 text-slate-400 active:bg-slate-600 shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-3 pb-8">{children}</div>
            </div>
        </div>
    );
}

export function SheetAction({
    icon: Icon,
    label,
    onClick,
    variant = 'default',
}: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'default' | 'danger';
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 px-3 py-3.5 rounded-xl text-sm font-medium transition-colors active:scale-[0.98]
                ${
                    variant === 'danger'
                        ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/15'
                        : 'text-slate-200 hover:bg-slate-700 active:bg-slate-600/80'
                }`}
        >
            <Icon
                className={`w-5 h-5 shrink-0 ${variant === 'danger' ? 'text-red-400' : 'text-slate-400'}`}
            />
            {label}
        </button>
    );
}

/** Small centred dialog used for the desktop prompts. */
export function Modal({
    title,
    children,
    onClose,
}: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-card border-border max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-sm">{title}</DialogTitle>
                </DialogHeader>
                {children}
            </DialogContent>
        </Dialog>
    );
}
