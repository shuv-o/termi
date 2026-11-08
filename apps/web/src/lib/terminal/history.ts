/**
 * Per-server command history for terminal suggestions. Kept in the browser
 * only (localStorage): commands can contain secrets, so they never go to
 * Termi's server. Lines starting with a space are never remembered (the
 * shell's own convention for "don't record this").
 */

export interface HistoryEntry {
    command: string;
    count: number;
    lastUsed: number;
}

export const MAX_ENTRIES_PER_SERVER = 300;
const KEY_PREFIX = 'termi-history:';
const ENABLED_KEY = 'termi-suggestions';

/** Minimal storage interface (localStorage, or a stand-in in tests). */
export interface KVStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    readonly length: number;
    key(index: number): string | null;
}

const browserStore = (): KVStore | null => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
};

export function suggestionsEnabled(store: KVStore | null = browserStore()): boolean {
    try {
        return store?.getItem(ENABLED_KEY) !== 'off';
    } catch {
        return true;
    }
}

export function setSuggestionsEnabled(on: boolean, store: KVStore | null = browserStore()): void {
    try {
        store?.setItem(ENABLED_KEY, on ? 'on' : 'off');
    } catch {
        /* storage unavailable */
    }
}

export function loadHistory(
    serverId: string,
    store: KVStore | null = browserStore(),
): HistoryEntry[] {
    try {
        const raw = store?.getItem(KEY_PREFIX + serverId);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.filter(
                  (e) => e && typeof e.command === 'string' && typeof e.count === 'number',
              )
            : [];
    } catch {
        return [];
    }
}

/** Remember a command; returns the updated history. */
export function recordCommand(
    serverId: string,
    line: string,
    store: KVStore | null = browserStore(),
    now = Date.now(),
): HistoryEntry[] {
    const history = loadHistory(serverId, store);
    if (line.startsWith(' ')) return history;
    const command = line.trim();
    if (command.length < 2 || command.length > 1000) return history;
    const existing = history.find((e) => e.command === command);
    if (existing) {
        existing.count += 1;
        existing.lastUsed = now;
    } else {
        history.push({ command, count: 1, lastUsed: now });
    }
    // Keep the most useful: frequently and recently used.
    history.sort((a, b) => score(b, now) - score(a, now));
    const kept = history.slice(0, MAX_ENTRIES_PER_SERVER);
    try {
        store?.setItem(KEY_PREFIX + serverId, JSON.stringify(kept));
    } catch {
        /* storage full or unavailable: suggestions just won't learn */
    }
    return kept;
}

function score(e: HistoryEntry, now: number): number {
    const days = (now - e.lastUsed) / 86_400_000;
    return e.count / (1 + days);
}

/**
 * The best completion for what's typed so far: the remaining text of a
 * history command or snippet that starts with it, or null.
 */
export function suggest(
    typed: string,
    history: HistoryEntry[],
    snippets: string[] = [],
    now = Date.now(),
): string | null {
    if (typed.trim().length < 2 || typed.startsWith(' ')) return null;
    const candidates = [
        ...[...history].sort((a, b) => score(b, now) - score(a, now)).map((e) => e.command),
        ...snippets.filter((s) => !/\{\{/.test(s)), // a snippet with variables needs its dialog
    ];
    const match = candidates.find((c) => c.startsWith(typed) && c.length > typed.length);
    return match ? match.slice(typed.length) : null;
}

/** Forget every server's history; returns how many servers had one. */
export function clearAllHistory(store: KVStore | null = browserStore()): number {
    if (!store) return 0;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k?.startsWith(KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => store.removeItem(k));
    return keys.length;
}
