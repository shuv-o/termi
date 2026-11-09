'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useAppearance, useResolvedTheme } from './store';
import { xtermLook, type XtermLook } from './terminal-themes';

/** The real family name next/font gave the self-hosted JetBrains Mono. */
export function bundledMonoFamily(): string {
    if (typeof document === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue('--font-jetbrains').trim();
}

/** The xterm options for the user's terminal settings, live. */
export function useXtermLook(): XtermLook {
    const a = useAppearance();
    const app = useResolvedTheme();
    return useMemo(() => xtermLook(a, app, bundledMonoFamily()), [a, app]);
}

/**
 * Keeps a terminal in step with the user's settings: a change in Settings →
 * Appearance restyles every terminal already on screen. Create the terminal
 * with `lookRef.current` (the settings at that moment); `refit` runs after a
 * font change so rows and columns are recomputed.
 */
export function useTerminalLook(
    terminal: { readonly current: Terminal | null },
    refit?: () => void,
): { look: XtermLook; lookRef: { readonly current: XtermLook } } {
    const look = useXtermLook();
    const lookRef = useRef(look);
    lookRef.current = look;
    const refitRef = useRef(refit);
    refitRef.current = refit;
    useEffect(() => {
        const t = terminal.current;
        if (!t) return;
        const o = t.options;
        const fontChanged =
            o.fontFamily !== look.fontFamily ||
            o.fontSize !== look.fontSize ||
            o.lineHeight !== look.lineHeight;
        o.theme = look.theme;
        o.cursorStyle = look.cursorStyle;
        o.cursorBlink = look.cursorBlink;
        if (fontChanged) {
            o.fontFamily = look.fontFamily;
            o.fontSize = look.fontSize;
            o.lineHeight = look.lineHeight;
            // Let the new metrics settle before measuring.
            requestAnimationFrame(() => refitRef.current?.());
        }
    }, [terminal, look]);
    return { look, lookRef };
}

/**
 * Whether a font is installed on this device: text set in it measures
 * differently from the generic fallbacks.
 */
export function fontInstalled(family: string): boolean {
    if (typeof document === 'undefined') return false;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return false;
    const sample = 'mmmmmmmmmmlli10OW@#';
    return ['monospace', 'serif', 'sans-serif'].some((base) => {
        ctx.font = `72px ${base}`;
        const fallback = ctx.measureText(sample).width;
        ctx.font = `72px "${family}", ${base}`;
        return ctx.measureText(sample).width !== fallback;
    });
}
