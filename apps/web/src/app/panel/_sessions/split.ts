/**
 * Split-pane layouts for the sessions workspace.
 *
 * Every session's terminal stays mounted (so its connection survives); a split
 * only decides which ones are on screen and where. Layouts are presets rather
 * than an arbitrary tree, which keeps them predictable on any screen:
 *
 *   columns  2–3 panes side by side       rows  2–3 panes stacked
 *   grid     3 panes (one tall + two) or 4 panes (2×2)
 *
 * `x` / `y` are the divider positions (0–1) for the two-pane and grid
 * layouts; three columns or rows are always equal.
 */

export type SplitLayout = 'columns' | 'rows' | 'grid';

export interface SplitState {
    layout: SplitLayout;
    /** Tab ids, in pane order. */
    panes: string[];
    x: number;
    y: number;
}

export interface PaneRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export const MAX_PANES: Record<SplitLayout, number> = { columns: 3, rows: 3, grid: 4 };
export const MIN_PANES: Record<SplitLayout, number> = { columns: 2, rows: 2, grid: 3 };

const MIN_RATIO = 0.2;
export const clampRatio = (v: number) =>
    Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, Number.isFinite(v) ? v : 0.5));

/** Where each pane goes, as fractions (0–1) of the workspace. */
export function paneRects(
    split: Pick<SplitState, 'layout' | 'x' | 'y'>,
    count: number,
): PaneRect[] {
    const x = clampRatio(split.x);
    const y = clampRatio(split.y);
    const n = Math.max(1, Math.min(count, MAX_PANES[split.layout]));
    if (n === 1) return [{ left: 0, top: 0, width: 1, height: 1 }];

    if (split.layout === 'columns') {
        if (n === 2) {
            return [
                { left: 0, top: 0, width: x, height: 1 },
                { left: x, top: 0, width: 1 - x, height: 1 },
            ];
        }
        return [0, 1, 2].map((i) => ({ left: i / 3, top: 0, width: 1 / 3, height: 1 }));
    }
    if (split.layout === 'rows') {
        if (n === 2) {
            return [
                { left: 0, top: 0, width: 1, height: y },
                { left: 0, top: y, width: 1, height: 1 - y },
            ];
        }
        return [0, 1, 2].map((i) => ({ left: 0, top: i / 3, width: 1, height: 1 / 3 }));
    }
    // grid
    if (n === 3) {
        return [
            { left: 0, top: 0, width: x, height: 1 },
            { left: x, top: 0, width: 1 - x, height: y },
            { left: x, top: y, width: 1 - x, height: 1 - y },
        ];
    }
    if (n === 2) {
        return [
            { left: 0, top: 0, width: x, height: 1 },
            { left: x, top: 0, width: 1 - x, height: 1 },
        ];
    }
    return [
        { left: 0, top: 0, width: x, height: y },
        { left: x, top: 0, width: 1 - x, height: y },
        { left: 0, top: y, width: x, height: 1 - y },
        { left: x, top: y, width: 1 - x, height: 1 - y },
    ];
}

/** Which dividers can be dragged for a layout with `count` panes. */
export function draggableDividers(layout: SplitLayout, count: number): { x: boolean; y: boolean } {
    if (layout === 'columns') return { x: count === 2, y: false };
    if (layout === 'rows') return { x: false, y: count === 2 };
    return { x: true, y: count >= 3 };
}

/** The layout that fits `count` panes best when splitting in `direction`. */
export function layoutFor(count: number, direction: 'right' | 'down'): SplitLayout {
    if (count >= 4) return 'grid';
    return direction === 'right' ? 'columns' : 'rows';
}

/**
 * Add `tabId` as a new pane next to the focused one. Returns null when the
 * split is full (4 panes).
 */
export function addPane(
    split: SplitState | null,
    focused: string,
    tabId: string,
    direction: 'right' | 'down',
): SplitState | null {
    const panes = split ? [...split.panes] : [focused];
    if (panes.length >= MAX_PANES.grid || panes.includes(tabId)) return null;
    const at = panes.indexOf(focused);
    panes.splice(at < 0 ? panes.length : at + 1, 0, tabId);
    // Keep going in the same direction while it fits; splitting across it
    // (or a fourth pane) makes a grid.
    const axis: SplitLayout = direction === 'right' ? 'columns' : 'rows';
    const layout: SplitLayout = !split
        ? layoutFor(panes.length, direction)
        : split.layout === axis && panes.length <= MAX_PANES[axis]
          ? axis
          : split.layout === 'grid' || panes.length >= MIN_PANES.grid
            ? 'grid'
            : axis;
    return { layout, panes, x: split?.x ?? 0.5, y: split?.y ?? 0.5 };
}

/** Drop tabs that no longer exist; a split with fewer than two panes ends. */
export function prunePanes(split: SplitState | null, tabIds: string[]): SplitState | null {
    if (!split) return null;
    const panes = split.panes.filter((p) => tabIds.includes(p));
    if (panes.length < 2) return null;
    const layout =
        panes.length < MIN_PANES[split.layout]
            ? 'columns'
            : panes.length > MAX_PANES[split.layout]
              ? 'grid'
              : split.layout;
    return { ...split, layout, panes };
}

/** Show `tabId` in the focused pane's place (a tab picked while split). */
export function replacePane(split: SplitState, focused: string, tabId: string): SplitState {
    if (split.panes.includes(tabId)) return split;
    const at = split.panes.indexOf(focused);
    const panes = [...split.panes];
    panes[at < 0 ? 0 : at] = tabId;
    return { ...split, panes };
}

/** Switch layout, filling or trimming panes from `available` tabs. */
export function withLayout(
    split: SplitState | null,
    layout: SplitLayout,
    focused: string | null,
    available: string[],
): SplitState | null {
    const current = split?.panes ?? (focused ? [focused] : []);
    const panes = [...current, ...available.filter((t) => !current.includes(t))].slice(
        0,
        MAX_PANES[layout],
    );
    if (panes.length < MIN_PANES[layout]) return split;
    return { layout, panes, x: split?.x ?? 0.5, y: split?.y ?? 0.5 };
}

/**
 * "Open beside it": a new connection joins the screen next to what's open,
 * in the user's preferred split shape. A grid needs three panes, so the
 * second pane goes side by side first. Returns null when the screen is full
 * (the connection then just opens as a tab).
 */
export function openBeside(
    split: SplitState | null,
    focused: string,
    tabId: string,
    shape: SplitLayout,
): SplitState | null {
    const panes = split ? [...split.panes] : [focused];
    if (panes.includes(tabId)) return null;
    panes.push(tabId);
    if (panes.length > MAX_PANES.grid) return null;
    let layout: SplitLayout = shape;
    if (panes.length > MAX_PANES[layout]) layout = 'grid';
    if (layout === 'grid' && panes.length < MIN_PANES.grid) layout = 'columns';
    return { layout, panes, x: split?.x ?? 0.5, y: split?.y ?? 0.5 };
}
