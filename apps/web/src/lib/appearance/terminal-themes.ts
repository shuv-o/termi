/**
 * Terminal looks: colour schemes, fonts, and the xterm options built from a
 * user's Appearance. Pure (no DOM), so it is shared by every terminal in the
 * app — SSH, local, Telnet, serial, guest and recording playback.
 */

import type { Accent, Appearance, TerminalFont, TerminalScheme, Theme } from './prefs';

export interface TerminalPalette {
    background: string;
    foreground: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
}

type Concrete = Exclude<TerminalScheme, 'auto'>;

export const SCHEMES: Record<
    Concrete,
    { label: string; light: boolean; palette: TerminalPalette }
> = {
    night: {
        label: 'Termi Night',
        light: false,
        palette: {
            background: '#0b0f14',
            foreground: '#c9d1d9',
            selectionBackground: '#264f78',
            black: '#484f58',
            red: '#ff7b72',
            green: '#3fb950',
            yellow: '#d29922',
            blue: '#58a6ff',
            magenta: '#bc8cff',
            cyan: '#39c5cf',
            white: '#b1bac4',
            brightBlack: '#6e7681',
            brightRed: '#ffa198',
            brightGreen: '#56d364',
            brightYellow: '#e3b341',
            brightBlue: '#79c0ff',
            brightMagenta: '#d2a8ff',
            brightCyan: '#56d4dd',
            brightWhite: '#f0f6fc',
        },
    },
    day: {
        label: 'Termi Day',
        light: true,
        palette: {
            background: '#fbfcfd',
            foreground: '#1f2933',
            selectionBackground: '#cfe3f5',
            black: '#24292f',
            red: '#cf222e',
            green: '#116329',
            yellow: '#7d4e00',
            blue: '#0550ae',
            magenta: '#8250df',
            cyan: '#1b7c83',
            white: '#6e7781',
            brightBlack: '#57606a',
            brightRed: '#a40e26',
            brightGreen: '#1a7f37',
            brightYellow: '#633c01',
            brightBlue: '#0969da',
            brightMagenta: '#a475f9',
            brightCyan: '#3192aa',
            brightWhite: '#8c959f',
        },
    },
    nord: {
        label: 'Nord',
        light: false,
        palette: {
            background: '#2e3440',
            foreground: '#d8dee9',
            selectionBackground: '#434c5e',
            black: '#3b4252',
            red: '#bf616a',
            green: '#a3be8c',
            yellow: '#ebcb8b',
            blue: '#81a1c1',
            magenta: '#b48ead',
            cyan: '#88c0d0',
            white: '#e5e9f0',
            brightBlack: '#4c566a',
            brightRed: '#bf616a',
            brightGreen: '#a3be8c',
            brightYellow: '#ebcb8b',
            brightBlue: '#81a1c1',
            brightMagenta: '#b48ead',
            brightCyan: '#8fbcbb',
            brightWhite: '#eceff4',
        },
    },
    gruvbox: {
        label: 'Gruvbox',
        light: false,
        palette: {
            background: '#282828',
            foreground: '#ebdbb2',
            selectionBackground: '#504945',
            black: '#282828',
            red: '#cc241d',
            green: '#98971a',
            yellow: '#d79921',
            blue: '#458588',
            magenta: '#b16286',
            cyan: '#689d6a',
            white: '#a89984',
            brightBlack: '#928374',
            brightRed: '#fb4934',
            brightGreen: '#b8bb26',
            brightYellow: '#fabd2f',
            brightBlue: '#83a598',
            brightMagenta: '#d3869b',
            brightCyan: '#8ec07c',
            brightWhite: '#ebdbb2',
        },
    },
    'solarized-dark': {
        label: 'Solarized Dark',
        light: false,
        palette: {
            background: '#002b36',
            foreground: '#93a1a1',
            selectionBackground: '#073642',
            black: '#073642',
            red: '#dc322f',
            green: '#859900',
            yellow: '#b58900',
            blue: '#268bd2',
            magenta: '#d33682',
            cyan: '#2aa198',
            white: '#eee8d5',
            brightBlack: '#586e75',
            brightRed: '#cb4b16',
            brightGreen: '#859900',
            brightYellow: '#b58900',
            brightBlue: '#268bd2',
            brightMagenta: '#6c71c4',
            brightCyan: '#2aa198',
            brightWhite: '#fdf6e3',
        },
    },
    'solarized-light': {
        label: 'Solarized Light',
        light: true,
        palette: {
            background: '#fdf6e3',
            foreground: '#586e75',
            selectionBackground: '#eee8d5',
            black: '#073642',
            red: '#dc322f',
            green: '#859900',
            yellow: '#b58900',
            blue: '#268bd2',
            magenta: '#d33682',
            cyan: '#2aa198',
            white: '#657b83',
            brightBlack: '#002b36',
            brightRed: '#cb4b16',
            brightGreen: '#859900',
            brightYellow: '#b58900',
            brightBlue: '#268bd2',
            brightMagenta: '#6c71c4',
            brightCyan: '#2aa198',
            brightWhite: '#073642',
        },
    },
};

/**
 * Accent colours, one shade for dark grounds and one for light grounds. The
 * dark shade carries ink text and the light shade white text, so both pass
 * contrast as a button. Mirrored in globals.css (a test keeps them in sync).
 */
export const ACCENT_COLORS: Record<Accent, { label: string; dark: string; light: string }> = {
    blue: { label: 'Cursor blue', dark: '#38b2f0', light: '#0a6aa1' },
    green: { label: 'Signal green', dark: '#3ecf8e', light: '#137a4b' },
    violet: { label: 'Violet', dark: '#a78bfa', light: '#6d3fd6' },
    amber: { label: 'Amber', dark: '#f2b544', light: '#8f5b00' },
    pink: { label: 'Pink', dark: '#f472b6', light: '#b4246f' },
    graphite: { label: 'Graphite', dark: '#c3ccd8', light: '#3d4a5a' },
};

export const TERMINAL_FONT_OPTIONS: Record<
    TerminalFont,
    { label: string; stack: string; bundled: boolean; probe?: string }
> = {
    jetbrains: { label: 'JetBrains Mono', stack: '', bundled: true },
    system: {
        label: 'System monospace',
        stack: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
        bundled: true,
    },
    fira: {
        label: 'Fira Code',
        stack: "'Fira Code', monospace",
        bundled: false,
        probe: 'Fira Code',
    },
    cascadia: {
        label: 'Cascadia Code',
        stack: "'Cascadia Code', 'Cascadia Mono', monospace",
        bundled: false,
        probe: 'Cascadia Code',
    },
    iosevka: {
        label: 'Iosevka',
        stack: "Iosevka, 'Iosevka Term', monospace",
        bundled: false,
        probe: 'Iosevka',
    },
    hack: { label: 'Hack', stack: 'Hack, monospace', bundled: false, probe: 'Hack' },
};

/** The app theme actually showing ('system' resolved by the caller). */
export type ResolvedTheme = Exclude<Theme, 'system'>;

/** "Match the app" picks the scheme that sits naturally on the app's theme. */
export function concreteScheme(scheme: TerminalScheme, app: ResolvedTheme): Concrete {
    if (scheme !== 'auto') return scheme;
    return app === 'day' ? 'day' : 'night';
}

export function terminalPalette(scheme: TerminalScheme, app: ResolvedTheme): TerminalPalette {
    const concrete = concreteScheme(scheme, app);
    const palette = SCHEMES[concrete].palette;
    // On the Black theme, the default terminal goes true black too.
    if (scheme === 'auto' && app === 'black') return { ...palette, background: '#000000' };
    return palette;
}

export interface XtermLook {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    cursorStyle: 'block' | 'bar' | 'underline';
    cursorBlink: boolean;
    theme: TerminalPalette & { cursor: string; cursorAccent: string; selectionForeground?: string };
}

/**
 * xterm options for a user's terminal settings. `bundledMono` is the real
 * family name of the self-hosted JetBrains Mono (next/font renames it).
 */
export function xtermLook(a: Appearance, app: ResolvedTheme, bundledMono: string): XtermLook {
    const t = a.terminal;
    const palette = terminalPalette(t.scheme, app);
    const light = SCHEMES[concreteScheme(t.scheme, app)].light;
    const cursor = ACCENT_COLORS[a.accent][light ? 'light' : 'dark'];
    const font = TERMINAL_FONT_OPTIONS[t.font];
    const fallback = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";
    const fontFamily =
        t.font === 'jetbrains'
            ? `${bundledMono ? `${bundledMono}, ` : ''}${fallback}`
            : `${font.stack.replace(/,\s*monospace$/, '')}, ${bundledMono ? `${bundledMono}, ` : ''}monospace`;
    return {
        fontFamily,
        fontSize: t.fontSize,
        lineHeight: t.lineHeight,
        cursorStyle: t.cursor,
        cursorBlink: t.blink && a.motion === 'full',
        theme: {
            ...palette,
            cursor,
            cursorAccent: palette.background,
            selectionForeground: light ? undefined : '#ffffff',
        },
    };
}
