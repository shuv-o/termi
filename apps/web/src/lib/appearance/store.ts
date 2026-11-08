'use client';

/**
 * The browser's copy of the user's Appearance — one store every component
 * reads, so a change in Settings reaches the sidebar, the session workspace
 * and every open terminal at once, with no reload.
 *
 * A change is applied immediately (the <html> attributes switch the CSS
 * tokens), remembered on this device (localStorage + the `termi-ui` cookie
 * the server paints the first frame from), and saved to the account a
 * moment later so other devices pick it up.
 */

import { useSyncExternalStore } from 'react';
import {
    APPEARANCE_COOKIE,
    DEFAULT_APPEARANCE,
    encodePaintCookie,
    mergeAppearance,
    paintAttributes,
    sanitizeAppearance,
    type Appearance,
} from './prefs';
import type { ResolvedTheme } from './terminal-themes';

const LOCAL_KEY = 'termi-appearance';
const SAVE_DELAY_MS = 600;

type Patch = Parameters<typeof mergeAppearance>[1];

let current: Appearance | null = null;
let systemLight = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const readLocal = (key: string) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

/**
 * First use on this device: the layout choices Termi already remembered
 * one by one (collapsed sidebar, session list, server view) carry over.
 */
function legacyChoices(): Patch {
    const patch: Patch = {};
    if (readLocal('sidebar-collapsed') === 'true') patch.nav = 'rail';
    if (readLocal('sessions-layout') === 'sidebar') patch.sessionList = 'side';
    const view = readLocal('panel-view');
    if (view === 'list' || view === 'grid') patch.serverView = view;
    return patch;
}

function load(): Appearance {
    const saved = readLocal(LOCAL_KEY);
    if (saved) {
        try {
            return sanitizeAppearance(JSON.parse(saved));
        } catch {
            /* fall through */
        }
    }
    return mergeAppearance(DEFAULT_APPEARANCE, legacyChoices());
}

function ensure(): Appearance {
    if (current) return current;
    current = typeof window === 'undefined' ? DEFAULT_APPEARANCE : load();
    if (typeof window !== 'undefined') {
        const mq = window.matchMedia?.('(prefers-color-scheme: light)');
        systemLight = !!mq?.matches;
        mq?.addEventListener?.('change', (e) => {
            systemLight = e.matches;
            emit();
        });
        // Another tab changed it.
        window.addEventListener('storage', (e) => {
            if (e.key !== LOCAL_KEY || !e.newValue) return;
            try {
                current = sanitizeAppearance(JSON.parse(e.newValue));
                paint(current);
                emit();
            } catch {
                /* ignore */
            }
        });
        paint(current);
    }
    return current;
}

function emit() {
    for (const l of listeners) l();
}

function paint(a: Appearance) {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(paintAttributes(a))) root.setAttribute(k, v);
    const secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${APPEARANCE_COOKIE}=${encodePaintCookie(a)}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax${secure}`;
}

function remember(a: Appearance) {
    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(a));
    } catch {
        /* not remembered on this device; the account copy still is */
    }
}

async function saveToAccount(extra?: { onboarded: true }) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const res = await fetch('/api/account/appearance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appearance: ensure(), ...extra }),
    }).catch(() => null);
    return !!res?.ok;
}

export function getAppearance(): Appearance {
    return ensure();
}

/** Change some choices; applied now, saved to the account shortly. */
export function setAppearance(patch: Patch) {
    current = mergeAppearance(ensure(), patch);
    paint(current);
    remember(current);
    emit();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveToAccount(), SAVE_DELAY_MS);
}

/** Replace everything (e.g. "Back to defaults"). */
export function replaceAppearance(next: Appearance) {
    setAppearance(next);
}

/**
 * The account's saved choice arrived (sign-in on a new device, or another
 * device changed it). Adopt it without saving it back.
 */
export function adoptAccountAppearance(saved: Appearance | null | undefined) {
    if (!saved) return;
    const next = sanitizeAppearance(saved);
    if (JSON.stringify(next) === JSON.stringify(ensure())) return;
    // A change made here in the last moment wins over a stale copy.
    if (saveTimer) return;
    current = next;
    paint(current);
    remember(current);
    emit();
}

/** Save now and mark the first-run setup as done. */
export function completeOnboarding(): Promise<boolean> {
    return saveToAccount({ onboarded: true });
}

function subscribe(cb: () => void) {
    ensure();
    listeners.add(cb);
    return () => listeners.delete(cb);
}

/** The user's choices, live. */
export function useAppearance(): Appearance {
    return useSyncExternalStore(subscribe, ensure, () => DEFAULT_APPEARANCE);
}

/** The theme actually on screen ('system' resolved against the OS). */
export function resolveTheme(a: Appearance): ResolvedTheme {
    if (a.theme !== 'system') return a.theme;
    ensure();
    return systemLight ? 'day' : 'night';
}

export function useResolvedTheme(): ResolvedTheme {
    const a = useAppearance();
    useSyncExternalStore(
        subscribe,
        () => systemLight,
        () => false,
    );
    return resolveTheme(a);
}
