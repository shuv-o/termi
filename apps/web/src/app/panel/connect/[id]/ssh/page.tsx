'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * SSH no longer has a page of its own.
 *
 * It used to: a full-screen terminal at this route, with its own tab strip,
 * file manager, metrics panel and toolbar — a near-duplicate of the sessions
 * workspace that happened to be the only place some of those features existed.
 * Worse, a shell opened here was invisible to the sessions list and did not
 * survive navigating away, so "my terminals" meant two different sets of
 * terminals depending on how you had opened them.
 *
 * Every SSH connection now opens as a session. This route stays as a redirect
 * because it is baked into QR connect codes, shared links and browser history.
 */
export default function SSHConnectRedirect() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();

    useEffect(() => {
        if (id) router.replace(`/panel/sessions?add=${encodeURIComponent(id)}`);
    }, [id, router]);

    return (
        <div className="flex h-dvh items-center justify-center gap-3 text-muted-foreground lg:h-screen">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Opening session…</span>
        </div>
    );
}
