'use client';

import { useRef } from 'react';
import { clampRatio, draggableDividers, type SplitState } from './split';

/**
 * Draggable split dividers, laid over the panes. Dragging updates the split's
 * x / y; terminals re-fit through their ResizeObserver. Arrow keys move a
 * focused divider by 5%.
 */
export function SplitDividers({
    split,
    onChange,
}: {
    split: SplitState;
    onChange: (next: SplitState) => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const { x: canX, y: canY } = draggableDividers(split.layout, split.panes.length);
    // In a three-pane grid the horizontal divider only splits the right column.
    const yFrom = split.layout === 'grid' && split.panes.length === 3 ? split.x : 0;

    const drag = (axis: 'x' | 'y') => (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = box.current?.getBoundingClientRect();
        if (!rect) return;
        e.preventDefault();
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        document.body.style.userSelect = 'none';
        const move = (ev: PointerEvent) => {
            const v =
                axis === 'x'
                    ? (ev.clientX - rect.left) / rect.width
                    : (ev.clientY - rect.top) / rect.height;
            onChange({ ...split, [axis]: clampRatio(v) });
        };
        const up = () => {
            document.body.style.userSelect = '';
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
    };

    const keys = (axis: 'x' | 'y') => (e: React.KeyboardEvent) => {
        const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        if (e.key !== back && e.key !== fwd) return;
        e.preventDefault();
        onChange({ ...split, [axis]: clampRatio(split[axis] + (e.key === fwd ? 0.05 : -0.05)) });
    };

    return (
        <div ref={box} className="pointer-events-none absolute inset-0 z-40">
            {canX && (
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panes"
                    aria-valuenow={Math.round(split.x * 100)}
                    aria-valuemin={20}
                    aria-valuemax={80}
                    tabIndex={0}
                    onPointerDown={drag('x')}
                    onKeyDown={keys('x')}
                    className="group pointer-events-auto absolute top-0 bottom-0 -ml-1.5 w-3 cursor-col-resize focus-visible:outline-none"
                    style={{ left: `${split.x * 100}%` }}
                >
                    <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
                </div>
            )}
            {canY && (
                <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize panes"
                    aria-valuenow={Math.round(split.y * 100)}
                    aria-valuemin={20}
                    aria-valuemax={80}
                    tabIndex={0}
                    onPointerDown={drag('y')}
                    onKeyDown={keys('y')}
                    className="group pointer-events-auto absolute right-0 -mt-1.5 h-3 cursor-row-resize focus-visible:outline-none"
                    style={{ top: `${split.y * 100}%`, left: `${yFrom * 100}%` }}
                >
                    <div className="my-auto mt-1.5 h-px w-full bg-transparent transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
                </div>
            )}
        </div>
    );
}
