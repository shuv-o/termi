'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import {
    loadHistory,
    recordCommand,
    suggest,
    suggestionsEnabled,
    type HistoryEntry,
} from '@/lib/terminal/history';
import { LineTracker } from '@/lib/terminal/line-tracker';

/** Fired (on window) when the user turns suggestions on or off in Settings. */
export const SUGGESTIONS_CHANGED_EVENT = 'termi-suggestions-changed';

interface Ghost {
    text: string;
    left: number;
    top: number;
    cellHeight: number;
    fontSize: number;
    fontFamily: string;
}

/** The first row of the logical line at absolute row `y` (it may wrap). */
function lineStart(t: Terminal, y: number): number {
    const buf = t.buffer.active;
    while (y > 0 && buf.getLine(y)?.isWrapped) y -= 1;
    return y;
}

/** The text of the logical line starting at absolute row `start`. */
function lineText(t: Terminal, start: number): string {
    const buf = t.buffer.active;
    let text = buf.getLine(start)?.translateToString(true) ?? '';
    for (let y = start + 1; buf.getLine(y)?.isWrapped; y++) {
        text = text.padEnd(t.cols) + (buf.getLine(y)?.translateToString(true) ?? '');
    }
    return text;
}

/** The text of the cursor's line, including rows it wrapped from. */
function cursorLineText(t: Terminal): string {
    const buf = t.buffer.active;
    return lineText(t, lineStart(t, buf.baseY + buf.cursorY));
}

/** How long to wait for the shell to echo a command before not remembering it. */
const ECHO_WAIT_MS = 2000;

/**
 * Fish-style command suggestions for an xterm terminal: as you type at a
 * prompt, the rest of a matching command from this server's history (or your
 * snippets) appears greyed out after the cursor; → or End accepts it.
 *
 * History lives in this browser only. A command is remembered only if the
 * terminal echoed it — so a password typed at a `sudo` prompt (not echoed)
 * is never saved — and never when it starts with a space. Nothing is
 * suggested or remembered in full-screen programs (vim, less, top).
 */
export function useCommandSuggestions(serverId: string) {
    const { data } = useCachedFetch<{ snippets: { command: string }[] }>('/api/snippets');
    const snippets = useMemo(() => (data?.snippets ?? []).map((s) => s.command), [data]);
    const snippetsRef = useRef(snippets);
    snippetsRef.current = snippets;

    const [enabled, setEnabled] = useState(true);
    const enabledRef = useRef(true);
    useEffect(() => {
        const read = () => {
            enabledRef.current = suggestionsEnabled();
            setEnabled(enabledRef.current);
        };
        read();
        window.addEventListener(SUGGESTIONS_CHANGED_EVENT, read);
        window.addEventListener('storage', read);
        return () => {
            window.removeEventListener(SUGGESTIONS_CHANGED_EVENT, read);
            window.removeEventListener('storage', read);
        };
    }, []);

    const tracker = useRef(new LineTracker());
    const history = useRef<HistoryEntry[]>([]);
    const term = useRef<Terminal | null>(null);
    const box = useRef<HTMLElement | null>(null);
    const send = useRef<(text: string) => void>(() => {});
    const [ghost, setGhost] = useState<Ghost | null>(null);
    const ghostText = useRef<string | null>(null);
    // A command waiting to be confirmed as echoed before it's remembered.
    const pending = useRef<{ line: string; row: number; until: number } | null>(null);

    /** Remember the pending command once its row shows it (the shell echoed it). */
    const confirmPending = useCallback(() => {
        const t = term.current;
        const p = pending.current;
        if (!t || !p) return;
        if (Date.now() > p.until) {
            pending.current = null; // never echoed: a password, or something odd
            return;
        }
        if (lineText(t, p.row).trimEnd().endsWith(p.line.trimEnd())) {
            pending.current = null;
            history.current = recordCommand(serverId, p.line);
        }
    }, [serverId]);

    const clear = useCallback(() => {
        if (ghostText.current === null) return;
        ghostText.current = null;
        setGhost(null);
    }, []);

    const update = useCallback(() => {
        const t = term.current;
        const container = box.current;
        if (!enabledRef.current || !t || !container) return clear();
        const buf = t.buffer.active;
        if (buf.type === 'alternate' || buf.viewportY !== buf.baseY) return clear();
        const typed = tracker.current.current;
        if (!typed) return clear();
        // Only once the shell has echoed exactly what was typed, with the
        // cursor at its end — otherwise the suggestion would be misplaced.
        const row = buf.getLine(buf.baseY + buf.cursorY)?.translateToString(true) ?? '';
        if (!cursorLineText(t).endsWith(typed) || row.length !== buf.cursorX) return clear();
        const rest = suggest(typed, history.current, snippetsRef.current);
        const screen = container.querySelector('.xterm-screen') as HTMLElement | null;
        if (!rest || !screen) return clear();
        const text = rest.split('\n')[0].slice(0, Math.max(0, t.cols - buf.cursorX));
        if (!text) return clear();
        const cellWidth = screen.clientWidth / t.cols;
        const cellHeight = screen.clientHeight / t.rows;
        const s = screen.getBoundingClientRect();
        const b = container.getBoundingClientRect();
        ghostText.current = text;
        setGhost({
            text,
            left: s.left - b.left + buf.cursorX * cellWidth,
            top: s.top - b.top + buf.cursorY * cellHeight,
            cellHeight,
            fontSize: Number(t.options.fontSize ?? 14),
            fontFamily: String(t.options.fontFamily ?? 'monospace'),
        });
    }, [clear]);

    /** Call once the terminal is open. `write` sends text to the shell. */
    const attach = useCallback(
        (terminal: Terminal, container: HTMLElement, write: (text: string) => void) => {
            term.current = terminal;
            box.current = container;
            send.current = write;
            history.current = loadHistory(serverId);
            const sub = terminal.onRender(() => {
                confirmPending();
                update();
            });
            return () => sub.dispose();
        },
        [serverId, update, confirmPending],
    );

    /** Call with everything the user types (xterm onData). */
    const onUserData = useCallback(
        (data: string) => {
            const t = term.current;
            if (!t || t.buffer.active.type === 'alternate') {
                tracker.current.reset();
                return clear();
            }
            const buf = t.buffer.active;
            const row = lineStart(t, buf.baseY + buf.cursorY);
            const event = tracker.current.feed(data);
            if (event.kind === 'commit' && enabledRef.current && !event.line.startsWith(' ')) {
                // The echo may still be on its way: confirm on later renders.
                pending.current = { line: event.line, row, until: Date.now() + ECHO_WAIT_MS };
                confirmPending();
            }
            clear();
        },
        [clear, confirmPending],
    );

    /** Key handler: → or End accepts a visible suggestion. */
    const onKey = useCallback(
        (e: KeyboardEvent): boolean => {
            const text = ghostText.current;
            if (
                !text ||
                e.type !== 'keydown' ||
                (e.key !== 'ArrowRight' && e.key !== 'End') ||
                e.shiftKey ||
                e.altKey ||
                e.ctrlKey ||
                e.metaKey
            ) {
                return true;
            }
            e.preventDefault();
            tracker.current.feed(text);
            send.current(text);
            clear();
            return false;
        },
        [clear],
    );

    const overlay =
        enabled && ghost ? (
            <span
                aria-hidden
                data-testid="command-suggestion"
                className="pointer-events-none absolute z-10 whitespace-pre text-muted-foreground/50"
                style={{
                    left: ghost.left,
                    top: ghost.top,
                    height: ghost.cellHeight,
                    lineHeight: `${ghost.cellHeight}px`,
                    fontSize: ghost.fontSize,
                    fontFamily: ghost.fontFamily,
                }}
            >
                {ghost.text}
            </span>
        ) : null;

    return { attach, onUserData, onKey, overlay };
}
