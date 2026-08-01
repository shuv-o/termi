'use client';

import { useEffect, useState } from 'react';

/** Tailwind's `md` breakpoint — below this we render touch-first layouts. */
const MOBILE_BREAKPOINT = 768;

/** Tracks whether the viewport is narrower than the mobile breakpoint. */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    return isMobile;
}
