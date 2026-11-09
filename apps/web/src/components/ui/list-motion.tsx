'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Matches .termi-fold's transition in globals.css. */
const FOLD_MS = 220;

/**
 * Motion for lists people add to and remove from: `arrived(id)` marks a row
 * as just added (it settles in with an accent wash), `remove(id, done)` folds
 * the row shut and then calls `done` to drop it from the data.
 */
export function useListMotion() {
    const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
    const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    const arrived = useCallback((id: string) => {
        setFresh((s) => new Set(s).add(id));
    }, []);

    const remove = useCallback((id: string, done: () => void) => {
        setLeaving((s) => new Set(s).add(id));
        clearTimeout(timers.current.get(id));
        timers.current.set(
            id,
            setTimeout(() => {
                done();
                setLeaving((s) => {
                    const n = new Set(s);
                    n.delete(id);
                    return n;
                });
            }, FOLD_MS),
        );
    }, []);

    return { fresh, leaving, arrived, remove };
}

/** One row of a list using `useListMotion`; put it in a plain <ul> (no gap). */
export function MotionRow({
    motion,
    id,
    className,
    children,
}: {
    motion: ReturnType<typeof useListMotion>;
    id: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <li className="termi-fold" data-leaving={motion.leaving.has(id) || undefined}>
            {/* The gap lives inside the fold, so it closes along with the row. */}
            <div>
                <div className="pb-2">
                    <div className={cn(className, motion.fresh.has(id) && 'termi-row-new')}>
                        {children}
                    </div>
                </div>
            </div>
        </li>
    );
}
