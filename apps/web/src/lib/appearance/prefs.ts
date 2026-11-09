/**
 * How Termi looks and is laid out, chosen by each user (at first sign-in or
 * in Settings → Appearance). Saved to the account so it follows the user to
 * every device, and mirrored into a cookie so the server can paint the first
 * frame in the right theme.
 *
 * Pure and dependency-free: used by the server (cookie → <html> attributes,
 * API validation) and the browser alike.
 */

export const THEMES = ['night', 'black', 'day', 'system'] as const;
export const ACCENTS = ['blue', 'green', 'violet', 'amber', 'pink', 'graphite'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const MOTIONS = ['full', 'reduced'] as const;
export const NAV_STYLES = ['sidebar', 'rail', 'topbar'] as const;
export const NAV_SIDES = ['left', 'right'] as const;
export const SESSION_LISTS = ['tabs', 'side'] as const;
export const OPEN_IN = ['tab', 'split'] as const;
export const SPLIT_SHAPES = ['columns', 'rows', 'grid'] as const;
export const SERVER_VIEWS = ['grid', 'list'] as const;
export const START_PAGES = ['servers', 'sessions'] as const;
export const TERMINAL_SCHEMES = [
    'auto',
    'night',
    'day',
    'nord',
    'gruvbox',
    'solarized-dark',
    'solarized-light',
] as const;
export const TERMINAL_FONTS = [
    'jetbrains',
    'system',
    'fira',
    'cascadia',
    'iosevka',
    'hack',
] as const;
export const CURSOR_STYLES = ['block', 'bar', 'underline'] as const;
/** Every page the menu can show, in the default order. */
export const MENU_ITEMS = [
    'servers',
    'connections',
    'workspaces',
    'local',
    'serial',
    'keys',
    'snippets',
    'forwarding',
    'known-hosts',
    'groups',
    'teams',
    'history',
    'settings',
] as const;
/** The phone's bottom bar has room for this many. */
export const MOBILE_BAR_MAX = 5;

export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];
export type Density = (typeof DENSITIES)[number];
export type Motion = (typeof MOTIONS)[number];
export type NavStyle = (typeof NAV_STYLES)[number];
export type NavSide = (typeof NAV_SIDES)[number];
export type SessionList = (typeof SESSION_LISTS)[number];
export type OpenIn = (typeof OPEN_IN)[number];
export type SplitShape = (typeof SPLIT_SHAPES)[number];
export type ServerView = (typeof SERVER_VIEWS)[number];
export type StartPage = (typeof START_PAGES)[number];
export type TerminalScheme = (typeof TERMINAL_SCHEMES)[number];
export type TerminalFont = (typeof TERMINAL_FONTS)[number];
export type CursorStyle = (typeof CURSOR_STYLES)[number];
export type MenuItemId = (typeof MENU_ITEMS)[number];

export interface Appearance {
    theme: Theme;
    accent: Accent;
    density: Density;
    motion: Motion;
    nav: NavStyle;
    navSide: NavSide;
    sessionList: SessionList;
    openIn: OpenIn;
    splitShape: SplitShape;
    serverView: ServerView;
    startPage: StartPage;
    menu: {
        /** Every item, in the order the menu shows them. */
        order: MenuItemId[];
        /** Left out of the desktop menu (Settings can't be). */
        hidden: MenuItemId[];
        /** In the phone's bottom bar, in menu order (up to MOBILE_BAR_MAX). */
        mobile: MenuItemId[];
    };
    terminal: {
        scheme: TerminalScheme;
        font: TerminalFont;
        fontSize: number;
        lineHeight: number;
        cursor: CursorStyle;
        blink: boolean;
    };
}

export const FONT_SIZE = { min: 11, max: 22 } as const;
export const LINE_HEIGHT = { min: 1, max: 1.6 } as const;

/** What Termi looked like before any of this was configurable. */
export const DEFAULT_APPEARANCE: Appearance = {
    theme: 'night',
    accent: 'blue',
    density: 'comfortable',
    motion: 'full',
    nav: 'sidebar',
    navSide: 'left',
    sessionList: 'tabs',
    openIn: 'tab',
    splitShape: 'columns',
    serverView: 'grid',
    startPage: 'servers',
    menu: {
        order: [...MENU_ITEMS],
        hidden: ['serial'],
        mobile: ['servers', 'connections', 'keys', 'groups', 'settings'],
    },
    terminal: {
        scheme: 'auto',
        font: 'jetbrains',
        fontSize: 14,
        lineHeight: 1.2,
        cursor: 'block',
        blink: true,
    },
};

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
    typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;

const clamp = (v: unknown, min: number, max: number, fallback: number, step: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    return Math.round(Math.min(max, Math.max(min, n)) / step) * step;
};

/**
 * Any input (stored JSON, a cookie, a request body) → a complete, valid
 * Appearance. Unknown values fall back to the default instead of failing, so
 * an old or hand-edited value never breaks the app.
 */
export function sanitizeAppearance(input: unknown): Appearance {
    const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const t = (o.terminal && typeof o.terminal === 'object' ? o.terminal : {}) as Record<
        string,
        unknown
    >;
    const d = DEFAULT_APPEARANCE;
    return {
        theme: pick(THEMES, o.theme, d.theme),
        accent: pick(ACCENTS, o.accent, d.accent),
        density: pick(DENSITIES, o.density, d.density),
        motion: pick(MOTIONS, o.motion, d.motion),
        nav: pick(NAV_STYLES, o.nav, d.nav),
        navSide: pick(NAV_SIDES, o.navSide, d.navSide),
        sessionList: pick(SESSION_LISTS, o.sessionList, d.sessionList),
        openIn: pick(OPEN_IN, o.openIn, d.openIn),
        splitShape: pick(SPLIT_SHAPES, o.splitShape, d.splitShape),
        serverView: pick(SERVER_VIEWS, o.serverView, d.serverView),
        startPage: pick(START_PAGES, o.startPage, d.startPage),
        menu: sanitizeMenu(o.menu),
        terminal: {
            scheme: pick(TERMINAL_SCHEMES, t.scheme, d.terminal.scheme),
            font: pick(TERMINAL_FONTS, t.font, d.terminal.font),
            fontSize: clamp(t.fontSize, FONT_SIZE.min, FONT_SIZE.max, d.terminal.fontSize, 1),
            lineHeight:
                Math.round(
                    clamp(
                        t.lineHeight,
                        LINE_HEIGHT.min,
                        LINE_HEIGHT.max,
                        d.terminal.lineHeight,
                        0.1,
                    ) * 10,
                ) / 10,
            cursor: pick(CURSOR_STYLES, t.cursor, d.terminal.cursor),
            blink: typeof t.blink === 'boolean' ? t.blink : d.terminal.blink,
        },
    };
}

const isItem = (v: unknown): v is MenuItemId =>
    typeof v === 'string' && (MENU_ITEMS as readonly string[]).includes(v);

/**
 * The order always lists every item exactly once (new pages join next to
 * their default neighbour), Settings can never be hidden, and the phone bar keeps menu order.
 */
function sanitizeMenu(input: unknown): Appearance['menu'] {
    const d = DEFAULT_APPEARANCE.menu;
    if (!input || typeof input !== 'object') return { ...d, order: [...d.order] };
    const m = input as Record<string, unknown>;
    const list = (v: unknown, fallback: MenuItemId[]) =>
        Array.isArray(v) ? [...new Set(v.filter(isItem))] : fallback;
    const order = list(m.order, d.order);
    // A page added since this menu was saved joins after the item it follows
    // by default, so Settings stays last and new pages land where expected.
    MENU_ITEMS.forEach((id, i) => {
        if (order.includes(id)) return;
        const before = MENU_ITEMS.slice(0, i)
            .reverse()
            .find((p) => order.includes(p));
        order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
    });
    const hidden = list(m.hidden, d.hidden).filter((id) => id !== 'settings');
    const mobileSet = new Set(list(m.mobile, d.mobile));
    const mobile = order.filter((id) => mobileSet.has(id)).slice(0, MOBILE_BAR_MAX);
    return { order, hidden, mobile };
}

/** Deep-merge a partial change (terminal settings may be partial too). */
export function mergeAppearance(
    base: Appearance,
    patch: Partial<Omit<Appearance, 'terminal' | 'menu'>> & {
        terminal?: Partial<Appearance['terminal']>;
        menu?: Partial<Appearance['menu']>;
    },
): Appearance {
    return sanitizeAppearance({
        ...base,
        ...patch,
        menu: { ...base.menu, ...(patch.menu ?? {}) },
        terminal: { ...base.terminal, ...(patch.terminal ?? {}) },
    });
}

/* ---------------------------------------------------------------------------
 * The cookie: only what the server needs for the first paint.
 * ------------------------------------------------------------------------- */

export const APPEARANCE_COOKIE = 'termi-ui';

export type PaintAttrs = Pick<Appearance, 'theme' | 'accent' | 'density' | 'motion'>;

export const encodePaintCookie = (a: PaintAttrs) =>
    [a.theme, a.accent, a.density, a.motion].join('.');

export function decodePaintCookie(value: string | undefined | null): PaintAttrs {
    const [theme, accent, density, motion] = (value ?? '').split('.');
    const d = DEFAULT_APPEARANCE;
    return {
        theme: pick(THEMES, theme, d.theme),
        accent: pick(ACCENTS, accent, d.accent),
        density: pick(DENSITIES, density, d.density),
        motion: pick(MOTIONS, motion, d.motion),
    };
}

/** The `<html>` attributes that switch the CSS tokens. */
export const paintAttributes = (a: PaintAttrs) => ({
    'data-theme': a.theme,
    'data-accent': a.accent,
    'data-density': a.density,
    'data-motion': a.motion,
});

/** Browser chrome colour (mobile address bar, PWA title bar) per theme. */
export const THEME_COLOR: Record<Exclude<Theme, 'system'>, string> = {
    night: '#0e1319',
    black: '#000000',
    day: '#f4f6f9',
};
