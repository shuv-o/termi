'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

export interface ActiveRect {
    top: number;
    left: number;
    width: number;
    height: number;
    /** False on the first measurement, so the marker appears in place instead of gliding in from 0,0. */
    moved: boolean;
}

/**
 * Where the selected child of `container` sits (the one matching `selector`),
 * relative to the container. A single marker positioned from this can glide
 * from the old selection to the new one, which shows where you went.
 */
export function useActiveRect(
    container: RefObject<HTMLElement | null>,
    selector: string,
    key: unknown,
): ActiveRect | null {
    const [rect, setRect] = useState<ActiveRect | null>(null);

    useLayoutEffect(() => {
        let ro: ResizeObserver | undefined;
        let frame = 0;
        const measure = (box: HTMLElement) => {
            const el = box.querySelector<HTMLElement>(selector);
            if (!el) return setRect(null);
            // Measured from the container itself (not offsetParent), so items
            // wrapped in tooltips or other positioned boxes still line up.
            const b = box.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            setRect((prev) => ({
                top: r.top - b.top + box.scrollTop,
                left: r.left - b.left + box.scrollLeft,
                width: r.width,
                height: r.height,
                moved: prev !== null,
            }));
        };
        // A marker rendered inside its own container runs before the
        // container's ref is set; try again on the next frame.
        const start = () => {
            const box = container.current;
            if (!box) {
                frame = requestAnimationFrame(start);
                return;
            }
            measure(box);
            ro = new ResizeObserver(() => measure(box));
            ro.observe(box);
        };
        start();
        return () => {
            cancelAnimationFrame(frame);
            ro?.disconnect();
        };
    }, [container, selector, key]);

    return rect;
}
