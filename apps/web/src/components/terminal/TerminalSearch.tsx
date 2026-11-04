'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search';
import { CaseSensitive, ChevronDown, ChevronUp, Regex, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { isFindShortcut } from './find-shortcut';

export { FIND_SHORTCUT_LABEL, isFindShortcut } from './find-shortcut';

/** Match highlight colours — xterm decorations require #RRGGBB, not CSS vars. */
const DECORATIONS: NonNullable<ISearchOptions['decorations']> = {
    matchBackground: '#3a3417',
    matchBorder: '#f2b544',
    matchOverviewRuler: '#f2b544',
    activeMatchBackground: '#1d4a66',
    activeMatchBorder: '#38b2f0',
    activeMatchColorOverviewRuler: '#38b2f0',
};

/**
 * Scrollback search for an xterm instance.
 *
 * Call `attach(terminal)` once the terminal exists (before `open` or after —
 * either works). It loads the search addon and claims the find shortcut via
 * `attachCustomKeyEventHandler`, so the keystroke never reaches the remote
 * shell. Render `bar` inside the terminal's `relative` container, and expose
 * `openSearch` to any toolbar button (phones have no ⌘F).
 */
export function useTerminalSearch() {
    const addonRef = useRef<SearchAddon | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const [open, setOpen] = useState(false);

    const attach = useCallback((terminal: Terminal) => {
        const addon = new SearchAddon();
        terminal.loadAddon(addon);
        addonRef.current = addon;
        termRef.current = terminal;
        terminal.attachCustomKeyEventHandler((e) => {
            if (isFindShortcut(e)) {
                e.preventDefault();
                setOpen(true);
                return false;
            }
            return true;
        });
    }, []);

    const openSearch = useCallback(() => setOpen(true), []);

    const close = useCallback(() => {
        setOpen(false);
        addonRef.current?.clearDecorations();
        termRef.current?.focus();
    }, []);

    const bar = open ? <SearchBar addonRef={addonRef} onClose={close} /> : null;

    return { attach, openSearch, bar };
}

function SearchBar({
    addonRef,
    onClose,
}: {
    addonRef: React.RefObject<SearchAddon | null>;
    onClose: () => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [regex, setRegex] = useState(false);
    const [results, setResults] = useState<{ index: number; count: number } | null>(null);
    const [invalid, setInvalid] = useState(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    useEffect(() => {
        const addon = addonRef.current;
        if (!addon) return;
        const sub = addon.onDidChangeResults(({ resultIndex, resultCount }) =>
            setResults({ index: resultIndex, count: resultCount }),
        );
        return () => sub.dispose();
    }, [addonRef]);

    const options = useCallback(
        (incremental: boolean): ISearchOptions => ({
            caseSensitive,
            regex,
            incremental,
            decorations: DECORATIONS,
        }),
        [caseSensitive, regex],
    );

    const find = useCallback(
        (direction: 'next' | 'prev', incremental = false) => {
            const addon = addonRef.current;
            if (!addon) return;
            if (!query) {
                addon.clearDecorations();
                setResults(null);
                return;
            }
            if (regex) {
                try {
                    new RegExp(query);
                } catch {
                    setInvalid(true);
                    return;
                }
            }
            setInvalid(false);
            if (direction === 'next') addon.findNext(query, options(incremental));
            else addon.findPrevious(query, options(false));
        },
        [addonRef, query, regex, options],
    );

    // Search as you type, keeping the current match in place when it still fits.
    useEffect(() => {
        find('next', true);
    }, [query, caseSensitive, regex]); // eslint-disable-line react-hooks/exhaustive-deps

    const status = invalid
        ? 'Invalid pattern'
        : !query || !results
          ? ''
          : results.count === 0
            ? 'No matches'
            : results.index < 0
              ? `${results.count}+ matches`
              : `${results.index + 1} of ${results.count}`;

    const toggle = (on: boolean) =>
        cn(
            'flex h-8 w-8 items-center justify-center rounded-[5px] transition-colors sm:h-7 sm:w-7',
            on
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        );
    const iconBtn =
        'flex h-8 w-8 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 sm:h-7 sm:w-7';

    return (
        <div
            role="search"
            className="termi-pop absolute right-2 top-2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
            data-state="open"
        >
            <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        find(e.shiftKey ? 'prev' : 'next');
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onClose();
                    }
                }}
                placeholder="Find in output"
                aria-label="Find in terminal output"
                aria-invalid={invalid || undefined}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="data h-8 w-36 min-w-0 rounded-[5px] bg-transparent px-2 text-base text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground/70 sm:h-7 sm:w-44 sm:text-[13px]"
            />
            <span
                aria-live="polite"
                className={cn(
                    'min-w-[4.5rem] shrink-0 px-1 text-right text-[11px] tabular-nums',
                    invalid || results?.count === 0 ? 'text-danger' : 'text-muted-foreground',
                )}
            >
                {status}
            </span>
            <button
                type="button"
                className={toggle(caseSensitive)}
                aria-pressed={caseSensitive}
                aria-label="Match case"
                title="Match case"
                onClick={() => setCaseSensitive((v) => !v)}
            >
                <CaseSensitive className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={toggle(regex)}
                aria-pressed={regex}
                aria-label="Use regular expression"
                title="Use regular expression"
                onClick={() => setRegex((v) => !v)}
            >
                <Regex className="h-4 w-4" />
            </button>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
            <button
                type="button"
                className={iconBtn}
                aria-label="Previous match"
                title="Previous match (Shift+Enter)"
                disabled={!query}
                onClick={() => find('prev')}
            >
                <ChevronUp className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={iconBtn}
                aria-label="Next match"
                title="Next match (Enter)"
                disabled={!query}
                onClick={() => find('next')}
            >
                <ChevronDown className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={iconBtn}
                aria-label="Close search"
                title="Close (Esc)"
                onClick={onClose}
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
