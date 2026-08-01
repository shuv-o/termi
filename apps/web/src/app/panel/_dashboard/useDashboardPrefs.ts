'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SortDir, SortField, ViewMode } from './types';

const VIEW_KEY = 'panel-view';
const SORT_KEY = 'panel-sort';

/** View mode and sort order, persisted to localStorage across visits. */
export function useDashboardPrefs() {
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
        field: 'name',
        dir: 'asc',
    });

    useEffect(() => {
        const v = localStorage.getItem(VIEW_KEY) as ViewMode | null;
        if (v === 'grid' || v === 'list') setViewMode(v);
        const s = localStorage.getItem(SORT_KEY);
        if (s) {
            try {
                setSort(JSON.parse(s));
            } catch {
                /* ignore */
            }
        }
    }, []);

    const switchView = useCallback((v: ViewMode) => {
        setViewMode(v);
        localStorage.setItem(VIEW_KEY, v);
    }, []);

    const applySort = useCallback((field: SortField, dir: SortDir) => {
        setSort({ field, dir });
        localStorage.setItem(SORT_KEY, JSON.stringify({ field, dir }));
    }, []);

    return { viewMode, switchView, sort, applySort };
}
