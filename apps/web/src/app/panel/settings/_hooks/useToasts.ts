'use client';

import { useCallback, useRef, useState } from 'react';
import type { AddToast, Toast, ToastType } from '../types';

/** Auto-dismissing toast queue for the settings screen. */
export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    const addToast: AddToast = useCallback((type: ToastType, message: string, duration = 5000) => {
        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return { toasts, addToast, dismissToast };
}
