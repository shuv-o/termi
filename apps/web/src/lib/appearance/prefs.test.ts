import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
    ACCENTS,
    DEFAULT_APPEARANCE,
    MENU_ITEMS,
    MOBILE_BAR_MAX,
    decodePaintCookie,
    encodePaintCookie,
    mergeAppearance,
    sanitizeAppearance,
} from './prefs';
import { ACCENT_COLORS, terminalPalette, xtermLook } from './terminal-themes';

describe('sanitizeAppearance', () => {
    it('fills everything in from nothing', () => {
        expect(sanitizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
        expect(sanitizeAppearance('nonsense')).toEqual(DEFAULT_APPEARANCE);
    });

    it('keeps good choices and drops bad ones one by one', () => {
        const a = sanitizeAppearance({
            theme: 'day',
            accent: 'chartreuse',
            nav: 'topbar',
            terminal: { fontSize: 99, lineHeight: 1.234, cursor: 'bar', font: 'comic-sans' },
        });
        expect(a.theme).toBe('day');
        expect(a.accent).toBe(DEFAULT_APPEARANCE.accent);
        expect(a.nav).toBe('topbar');
        expect(a.terminal).toMatchObject({
            fontSize: 22,
            lineHeight: 1.2,
            cursor: 'bar',
            font: 'jetbrains',
        });
    });

    it('partial terminal changes merge into the rest', () => {
        const a = mergeAppearance(DEFAULT_APPEARANCE, { terminal: { blink: false } });
        expect(a.terminal).toEqual({ ...DEFAULT_APPEARANCE.terminal, blink: false });
    });
});

describe('menu', () => {
    it('always lists every page exactly once, new ones at the end', () => {
        const a = sanitizeAppearance({ menu: { order: ['groups', 'servers', 'groups', 'bogus'] } });
        expect(a.menu.order.slice(0, 2)).toEqual(['groups', 'servers']);
        expect([...a.menu.order].sort()).toEqual([...MENU_ITEMS].sort());
    });

    it('Settings can never be hidden', () => {
        const a = sanitizeAppearance({ menu: { hidden: ['settings', 'teams'] } });
        expect(a.menu.hidden).toEqual(['teams']);
    });

    it('the phone bar keeps menu order and its size limit', () => {
        const a = sanitizeAppearance({
            menu: {
                order: ['settings', 'groups', 'servers', 'keys', 'teams', 'connections'],
                mobile: ['connections', 'servers', 'settings', 'groups', 'keys', 'teams'],
            },
        });
        expect(a.menu.mobile).toHaveLength(MOBILE_BAR_MAX);
        expect(a.menu.mobile).toEqual(['settings', 'groups', 'servers', 'keys', 'teams']);
    });
});

describe('paint cookie', () => {
    it('round-trips and survives garbage', () => {
        const paint = { theme: 'black', accent: 'pink', density: 'compact', motion: 'reduced' } as const;
        expect(decodePaintCookie(encodePaintCookie(paint))).toEqual(paint);
        expect(decodePaintCookie('x.y"><script>')).toEqual({
            theme: 'night',
            accent: 'blue',
            density: 'comfortable',
            motion: 'full',
        });
        expect(decodePaintCookie(undefined).theme).toBe('night');
    });
});

describe('terminal look', () => {
    it('"match the app" follows the theme, true black on Black', () => {
        expect(terminalPalette('auto', 'day').background).toBe('#fbfcfd');
        expect(terminalPalette('auto', 'black').background).toBe('#000000');
        expect(terminalPalette('nord', 'day').background).toBe('#2e3440');
    });

    it('the cursor is the accent, in the shade that suits the terminal', () => {
        const a = mergeAppearance(DEFAULT_APPEARANCE, { accent: 'violet' });
        expect(xtermLook(a, 'night', '').theme.cursor).toBe(ACCENT_COLORS.violet.dark);
        expect(xtermLook(a, 'day', '').theme.cursor).toBe(ACCENT_COLORS.violet.light);
    });

    it('reduced motion stops the cursor blinking', () => {
        const a = mergeAppearance(DEFAULT_APPEARANCE, { motion: 'reduced' });
        expect(xtermLook(a, 'night', '').cursorBlink).toBe(false);
    });
});

it('globals.css carries the same accent colours as the code', () => {
    const css = readFileSync(join(__dirname, '../../styles/globals.css'), 'utf8');
    for (const accent of ACCENTS) {
        const c = ACCENT_COLORS[accent];
        const block = new RegExp(
            `\\[data-accent='${accent}'\\][^{]*\\{\\s*--acc-d:\\s*${c.dark};\\s*--acc-l:\\s*${c.light};`,
        );
        expect(css, accent).toMatch(block);
    }
});
