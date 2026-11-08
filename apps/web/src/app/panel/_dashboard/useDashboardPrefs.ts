'use client';

import { useCallback, useEffect, useState } from 'react';
import { setAppearance, useAppearance } from '@/lib/appearance/store';
import type { SortDir, SortField, ViewMode } from './types';

const SORT_KEY = 'panel-sort';

/**
 * Cards or list (the user's Appearance choice, so it follows them between
 * devices) and the sort order (remembered in this browser).
 */
export function useDashboardPrefs() {
    const { serverView } = useAppearance();
    const viewMode: ViewMode = serverView;
    const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
        field: 'name',
        dir: 'asc',
    });

    useEffect(() => {
        const s = localStorage.getItem(SORT_KEY);
        if (s) {
            try {
                setSort(JSON.parse(s));
            } catch {
                /* ignore */
            }
        }
    }, []);

    const switchView = useCallback((v: ViewMode) => setAppearance({ serverView: v }), []);

    const applySort = useCallback((field: SortField, dir: SortDir) => {
        setSort({ field, dir });
        localStorage.setItem(SORT_KEY, JSON.stringify({ field, dir }));
    }, []);

    return { viewMode, switchView, sort, applySort };
}
