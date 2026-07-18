'use client';

/**
 * Client-side data cache with stale-while-revalidate — the piece that makes the
 * panel feel like a native app instead of a website.
 *
 * The problem it solves: every panel page used to fetch on mount with its own
 * `useState(loading=true)`, so navigating away and back re-ran the request and
 * re-flashed a spinner over data the user had just seen. There was no shared
 * cache, so the same endpoints were fetched three times over by different pages.
 *
 * How it behaves:
 *   - Data is cached at module scope, keyed by URL, so it survives navigation
 *     (a component unmounting does not throw the data away).
 *   - `isLoading` is true ONLY when nothing is cached yet. A return visit renders
 *     the cached data synchronously — no spinner — and refreshes in the
 *     background (stale-while-revalidate).
 *   - Concurrent requests for the same key are de-duplicated into one fetch.
 *   - Revalidation happens on mount (i.e. on navigation) and on window focus,
 *     throttled so refocusing rapidly doesn't hammer the network.
 *
 * All endpoints use the `{ success, data }` envelope from `@/lib/api`, so the
 * hook unwraps `data` and treats `success: false` (or a non-2xx) as an error,
 * while keeping any previously cached data visible.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/** Don't refetch on focus if the last fetch finished within this window. */
const FOCUS_THROTTLE_MS = 10_000;

interface CacheEntry<T> {
    data?: T;
    error?: Error;
    /** When the last successful/failed fetch settled. */
    ts: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<void>>();
const subscribers = new Map<string, Set<() => void>>();

function notify(key: string) {
    const subs = subscribers.get(key);
    if (subs) for (const fn of subs) fn();
}

function subscribe(key: string, fn: () => void): () => void {
    let subs = subscribers.get(key);
    if (!subs) {
        subs = new Set();
        subscribers.set(key, subs);
    }
    subs.add(fn);
    return () => {
        subs!.delete(fn);
        if (subs!.size === 0) subscribers.delete(key);
    };
}

/**
 * Fetch a URL and store the unwrapped payload under `key`. Concurrent calls for
 * the same key share one in-flight request. On error the previous cached data is
 * left in place (stale-but-usable) and the error is recorded alongside it.
 */
export function revalidate(key: string, url: string): Promise<void> {
    const existing = inflight.get(key);
    if (existing) return existing;

    const p = (async () => {
        try {
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            const json = await res.json().catch(() => null);

            if (!res.ok || !json || json.success === false) {
                throw new Error(json?.error || `Request failed (${res.status})`);
            }

            cache.set(key, { data: json.data, ts: Date.now() });
        } catch (err) {
            const prev = cache.get(key);
            cache.set(key, {
                data: prev?.data, // keep stale data usable through a transient failure
                error: err instanceof Error ? err : new Error(String(err)),
                ts: Date.now(),
            });
        } finally {
            inflight.delete(key);
            notify(key);
        }
    })();

    inflight.set(key, p);
    return p;
}

/**
 * Imperatively update a cached entry — call after a create/edit/delete so lists
 * reflect the change instantly, then optionally revalidate to reconcile.
 *
 * @param updater new data, or a function of the current data
 */
export function mutateCache<T>(key: string, updater: T | ((prev: T | undefined) => T)): void {
    const prev = cache.get(key)?.data as T | undefined;
    const next =
        typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater;
    cache.set(key, { data: next, ts: Date.now() });
    notify(key);
}

/** Read the currently cached value for a key without subscribing (may be stale). */
export function getCachedData<T>(key: string): T | undefined {
    return cache.get(key)?.data as T | undefined;
}

/** Drop a cached entry entirely (e.g. on sign-out). */
export function clearCache(key?: string): void {
    if (key) {
        cache.delete(key);
        notify(key);
    } else {
        const keys = [...cache.keys()];
        cache.clear();
        for (const k of keys) notify(k);
    }
}

export interface CachedFetchResult<T> {
    data: T | undefined;
    error: Error | undefined;
    /** True only before the first successful load — never on a cached revisit. */
    isLoading: boolean;
    /** Force a background refresh. */
    refresh: () => Promise<void>;
    /** Update the cached value locally (optimistic writes). */
    mutate: (updater: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Read a cached endpoint, revalidating on navigation and focus.
 *
 * @param key unique cache key; pass `null` to disable (e.g. a param not ready)
 * @param url URL to fetch; defaults to `key` when the key is the URL itself
 */
export function useCachedFetch<T>(key: string | null, url?: string): CachedFetchResult<T> {
    const resolvedUrl = url ?? key ?? '';

    const entry = useSyncExternalStore(
        useCallback((cb) => (key ? subscribe(key, cb) : () => {}), [key]),
        () => (key ? (cache.get(key) as CacheEntry<T> | undefined) : undefined),
        () => undefined, // server render: nothing cached
    );

    // Revalidate on mount (navigation). Cached data stays on screen meanwhile.
    useEffect(() => {
        if (key) revalidate(key, resolvedUrl);
    }, [key, resolvedUrl]);

    // Revalidate when the user returns to the window, throttled.
    useEffect(() => {
        if (!key) return;
        const onFocus = () => {
            if (document.visibilityState === 'hidden') return;
            const cached = cache.get(key);
            if (!cached || Date.now() - cached.ts > FOCUS_THROTTLE_MS) {
                revalidate(key, resolvedUrl);
            }
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [key, resolvedUrl]);

    return {
        data: entry?.data,
        error: entry?.error,
        // Loading only when we have neither data nor a resolved error yet.
        isLoading: !!key && entry?.data === undefined && entry?.error === undefined,
        refresh: useCallback(
            () => (key ? revalidate(key, resolvedUrl) : Promise.resolve()),
            [key, resolvedUrl],
        ),
        mutate: useCallback(
            (updater: T | ((prev: T | undefined) => T)) => {
                if (key) mutateCache<T>(key, updater);
            },
            [key],
        ),
    };
}
