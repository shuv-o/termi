'use client';

import { useMemo } from 'react';

import { useToast } from '@/components/ui/toast';
import type { AddToast } from '../types';

/**
 * Settings' toast entry point: a thin adapter over the app-wide toaster, for
 * the settings hooks that take `addToast` as a parameter.
 */
export function useToasts(): { addToast: AddToast } {
    const { toast } = useToast();
    return useMemo(() => ({ addToast: toast }), [toast]);
}
