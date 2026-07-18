'use client';

import { useEffect, useState } from 'react';
import { Star, X } from 'lucide-react';

/**
 * One-time, dismissible nudge to star the repo — shown only after a real
 * signal that Termi is actually working for this person, never on first load.
 *
 * Asking on day one is just noise; nobody has an opinion yet. This waits for
 * two things to both be true: the account is at least a few days old (they
 * came back), and they've saved at least one server (they set something up).
 * That combination is a genuine "this is useful to me" moment, not a guess.
 *
 * Shown at most once, ever, per browser — dismissing (in either direction)
 * sets a permanent flag. This is a nudge, not a nag.
 */

const DISMISS_KEY = 'termi:star-nudge-dismissed';
const MIN_ACCOUNT_AGE_DAYS = 3;
const STAR_URL = 'https://github.com/shuvoooo/termi';

interface Props {
    /** ISO timestamp the account was created. */
    userCreatedAt: string | undefined;
    /** How many servers the user has saved. */
    serverCount: number;
}

export function accountAgeDays(createdAt: string): number {
    const ms = Date.now() - new Date(createdAt).getTime();
    return ms / (1000 * 60 * 60 * 24);
}

/**
 * The actual gating decision, pulled out of the effect so it can be unit
 * tested without rendering a component — this is the part worth getting
 * right; the effect below is just "when true, show it after a beat."
 */
export function shouldShowStarNudge(
    { userCreatedAt, serverCount }: Props,
    alreadyDismissed: boolean,
): boolean {
    if (!userCreatedAt || serverCount === 0) return false;
    if (alreadyDismissed) return false;
    return accountAgeDays(userCreatedAt) >= MIN_ACCOUNT_AGE_DAYS;
}

export default function StarNudge({ userCreatedAt, serverCount }: Props) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
        if (!shouldShowStarNudge({ userCreatedAt, serverCount }, dismissed)) return;

        // Let the panel finish its own entrance before showing this — appearing
        // instantly alongside everything else reads as a popup, not a nudge.
        const t = setTimeout(() => setVisible(true), 1500);
        return () => clearTimeout(t);
    }, [userCreatedAt, serverCount]);

    const dismiss = () => {
        setVisible(false);
        localStorage.setItem(DISMISS_KEY, '1');
    };

    if (!visible) return null;

    return (
        <div className="fixed top-16 right-4 z-[60] max-w-sm animate-fade-in lg:top-4">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-slate-900/80">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-500/15 text-yellow-400">
                    <Star className="h-4.5 w-4.5" />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200">Glad Termi is working out for you.</p>
                    <p className="mt-1 text-xs text-slate-400">
                        A star helps others find it, and tells me what to prioritize next.
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                        <a
                            href={STAR_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={dismiss}
                            className="rounded-lg bg-gradient-to-r from-primary to-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5"
                        >
                            ⭐ Star on GitHub
                        </a>
                        <button
                            type="button"
                            onClick={dismiss}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        >
                            No thanks
                        </button>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={dismiss}
                    title="Dismiss"
                    className="shrink-0 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}
