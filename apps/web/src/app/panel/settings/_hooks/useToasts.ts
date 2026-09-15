'use client';

import { useMemo } from 'react';

import { useToast } from '@/components/ui/toast';
import type { AddToast } from '../types';

/**
 * Settings' toast entry point, now a thin adapter over the app-wide toaster in
 * the panel layout. Kept as its own hook because a dozen settings hooks take
 * `addToast` as a parameter; this way they did not all need rewiring, and the
 * settings screen no longer renders a second, differently-positioned toast
 * stack of its own.
 */
export function useToasts(): { addToast: AddToast } {
    const { toast } = useToast();
    return useMemo(() => ({ addToast: toast }), [toast]);
}
