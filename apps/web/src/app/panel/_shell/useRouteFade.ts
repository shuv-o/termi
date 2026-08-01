'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Brief opacity/translate dip on route change, without unmounting the page.
 *
 * The previous approach keyed `<main>` on `pathname`, which forced React to
 * unmount the whole page subtree and remount the new one from scratch on
 * every navigation — a real blank frame before the fade-in animation could
 * even start, which read as "loading" rather than as a transition. This
 * hook instead toggles a class on the *same* element: React updates the
 * subtree in place (cheap), and the two-step state flip below forces the
 * browser to paint the "faded" state before transitioning back to normal,
 * so the CSS `transition` actually animates instead of jumping.
 */
export function useRouteFade(pathname: string): boolean {
    const prevPathname = useRef(pathname);
    const [fading, setFading] = useState(false);

    useLayoutEffect(() => {
        if (prevPathname.current === pathname) return;
        prevPathname.current = pathname;
        setFading(true);
        const id = requestAnimationFrame(() => setFading(false));
        return () => cancelAnimationFrame(id);
    }, [pathname]);

    return fading;
}
