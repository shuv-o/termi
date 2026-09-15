'use client';

import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { toneBanner, toneText, type Tone } from '@/lib/status-style';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

export type AddToast = (type: ToastType, message: string, duration?: number) => void;

interface ToastContextValue {
    toast: AddToast;
    dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TONE_FOR_TYPE: Record<ToastType, Tone> = {
    success: 'success',
    error: 'danger',
    warning: 'warning',
    info: 'info',
};

const ICON_FOR_TYPE: Record<ToastType, typeof Info> = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
};

/** Errors stay up longer — they usually carry something to act on. */
const DEFAULT_DURATION: Record<ToastType, number> = {
    success: 4000,
    info: 4000,
    warning: 6000,
    error: 8000,
};

/**
 * App-wide transient feedback.
 *
 * Feedback used to arrive three different ways: settings had a floating toast
 * stack, groups pushed an inline banner in from the top of the page, keychain
 * rendered a green strip that only ever reported success, and the dashboard
 * said nothing at all when a delete failed. Same event, four different
 * affordances — and one of them silent. This is the single channel; mount the
 * provider once and call `useToast()` anywhere below it.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = React.useState<Toast[]>([]);
    const nextId = React.useRef(0);
    // Tracked so unmounting the provider (or an early dismiss) cannot leave a
    // timer behind that fires setState on a dead tree.
    const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

    const dismiss = React.useCallback((id: number) => {
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = React.useCallback<AddToast>(
        (type, message, duration) => {
            const id = ++nextId.current;
            setToasts((prev) => [...prev, { id, type, message }]);
            timers.current.set(
                id,
                setTimeout(() => dismiss(id), duration ?? DEFAULT_DURATION[type]),
            );
        },
        [dismiss],
    );

    React.useEffect(() => {
        const pending = timers.current;
        return () => {
            pending.forEach(clearTimeout);
            pending.clear();
        };
    }, []);

    const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <Toaster toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

/**
 * Returns `toast(type, message)`. Safe to call outside a provider (the landing
 * and auth pages have none) — it degrades to a no-op rather than throwing.
 */
export function useToast(): ToastContextValue {
    const ctx = React.useContext(ToastContext);
    return ctx ?? NOOP_TOAST;
}

const NOOP_TOAST: ToastContextValue = {
    toast: () => {},
    dismiss: () => {},
};

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    if (toasts.length === 0) return null;

    return (
        <div
            // `pointer-events-none` on the stack so the strip of empty space
            // above a toast never swallows clicks on the page behind it; each
            // toast re-enables them for itself.
            className="pointer-events-none fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-[60] flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-80"
            // Announced politely: these are confirmations, not interruptions.
            role="status"
            aria-live="polite"
        >
            {toasts.map((t) => {
                const tone = TONE_FOR_TYPE[t.type];
                const Icon = ICON_FOR_TYPE[t.type];
                return (
                    <div
                        key={t.id}
                        className={cn(
                            'animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-sm',
                            toneBanner[tone],
                        )}
                    >
                        <Icon className={cn('mt-px h-4 w-4 shrink-0', toneText[tone])} />
                        <span className="flex-1 break-words text-foreground/90">{t.message}</span>
                        <button
                            type="button"
                            onClick={() => onDismiss(t.id)}
                            className="-m-1 shrink-0 rounded-sm p-1 opacity-60 transition-opacity hover:opacity-100"
                            aria-label="Dismiss notification"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
