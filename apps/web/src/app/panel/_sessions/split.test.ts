import { describe, expect, it } from 'vitest';
import {
    addPane,
    openBeside,
    clampRatio,
    draggableDividers,
    paneRects,
    prunePanes,
    replacePane,
    withLayout,
    type SplitState,
} from './split';

const area = (r: { width: number; height: number }[]) =>
    r.reduce((s, p) => s + p.width * p.height, 0);

describe('paneRects', () => {
    it('tiles the whole workspace with no overlap, for every layout and count', () => {
        for (const layout of ['columns', 'rows', 'grid'] as const) {
            for (const count of [1, 2, 3, 4]) {
                const rects = paneRects({ layout, x: 0.3, y: 0.7 }, count);
                expect(area(rects)).toBeCloseTo(1, 10);
                for (const r of rects) {
                    expect(r.left + r.width).toBeLessThanOrEqual(1 + 1e-9);
                    expect(r.top + r.height).toBeLessThanOrEqual(1 + 1e-9);
                }
            }
        }
    });

    it('follows the dividers', () => {
        const [a, b] = paneRects({ layout: 'columns', x: 0.3, y: 0.5 }, 2);
        expect(a).toEqual({ left: 0, top: 0, width: 0.3, height: 1 });
        expect(b.left).toBeCloseTo(0.3);
        const grid = paneRects({ layout: 'grid', x: 0.6, y: 0.4 }, 4);
        expect(grid[3]).toMatchObject({ left: 0.6, top: 0.4 });
    });

    it('keeps panes usable when a divider is dragged to an edge', () => {
        expect(clampRatio(0)).toBe(0.2);
        expect(clampRatio(1)).toBe(0.8);
        expect(clampRatio(NaN)).toBe(0.5);
        expect(paneRects({ layout: 'columns', x: 0.01, y: 0.5 }, 2)[0].width).toBe(0.2);
    });
});

describe('split editing', () => {
    it('splits the focused pane right, then down into a grid', () => {
        const one = addPane(null, 'a', 'b', 'right')!;
        expect(one).toMatchObject({ layout: 'columns', panes: ['a', 'b'] });
        const two = addPane(one, 'a', 'c', 'down')!;
        expect(two).toMatchObject({ layout: 'grid', panes: ['a', 'c', 'b'] });
        expect(addPane(one, 'b', 'c', 'right')).toMatchObject({ layout: 'columns' });
        const three = addPane(two, 'b', 'd', 'right')!;
        expect(three).toMatchObject({ layout: 'grid', panes: ['a', 'c', 'b', 'd'] });
        expect(addPane(three, 'a', 'e', 'right')).toBeNull();
    });

    it('drops closed tabs and ends a split left with one pane', () => {
        const s: SplitState = { layout: 'grid', panes: ['a', 'b', 'c', 'd'], x: 0.5, y: 0.5 };
        expect(prunePanes(s, ['a', 'b', 'c'])!.panes).toEqual(['a', 'b', 'c']);
        expect(prunePanes(s, ['a', 'b'])).toMatchObject({ layout: 'columns', panes: ['a', 'b'] });
        expect(prunePanes(s, ['a'])).toBeNull();
    });

    it('puts a picked tab in the focused pane', () => {
        const s: SplitState = { layout: 'columns', panes: ['a', 'b'], x: 0.5, y: 0.5 };
        expect(replacePane(s, 'b', 'c').panes).toEqual(['a', 'c']);
        expect(replacePane(s, 'b', 'a')).toBe(s);
    });

    it('switches layout, filling from open tabs and refusing when there are too few', () => {
        expect(withLayout(null, 'columns', 'a', ['a', 'b', 'c'])!.panes).toEqual(['a', 'b', 'c']);
        expect(withLayout(null, 'grid', 'a', ['a', 'b'])).toBeNull();
        const s: SplitState = { layout: 'grid', panes: ['a', 'b', 'c', 'd'], x: 0.4, y: 0.5 };
        expect(withLayout(s, 'rows', 'a', ['a', 'b', 'c', 'd'])).toMatchObject({
            layout: 'rows',
            panes: ['a', 'b', 'c'],
            x: 0.4,
        });
    });

    it('offers draggable dividers only where sizes are adjustable', () => {
        expect(draggableDividers('columns', 2)).toEqual({ x: true, y: false });
        expect(draggableDividers('columns', 3)).toEqual({ x: false, y: false });
        expect(draggableDividers('grid', 4)).toEqual({ x: true, y: true });
    });
});

describe('openBeside', () => {
    it('starts a split in the chosen shape', () => {
        expect(openBeside(null, 'a', 'b', 'rows')).toMatchObject({
            layout: 'rows',
            panes: ['a', 'b'],
        });
    });
    it('a grid starts side by side and becomes a grid at three panes', () => {
        const two = openBeside(null, 'a', 'b', 'grid')!;
        expect(two.layout).toBe('columns');
        expect(openBeside(two, 'b', 'c', 'grid')).toMatchObject({
            layout: 'grid',
            panes: ['a', 'b', 'c'],
        });
    });
    it('a fourth pane turns columns into a grid; a fifth opens as a tab', () => {
        let s = openBeside(null, 'a', 'b', 'columns')!;
        s = openBeside(s, 'b', 'c', 'columns')!;
        expect(s.layout).toBe('columns');
        s = openBeside(s, 'c', 'd', 'columns')!;
        expect(s).toMatchObject({ layout: 'grid', panes: ['a', 'b', 'c', 'd'] });
        expect(openBeside(s, 'd', 'e', 'columns')).toBeNull();
    });
    it('keeps divider positions', () => {
        const s = { layout: 'columns' as const, panes: ['a', 'b'], x: 0.3, y: 0.5 };
        expect(openBeside(s, 'b', 'c', 'grid')).toMatchObject({ x: 0.3 });
    });
});
