'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Every SSH connection opens as a session in the sessions workspace. This
 * route only redirects there, because it is baked into QR connect codes,
 * shared links and browser history.
 */
export default function SSHConnectRedirect() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();

    useEffect(() => {
        if (id) router.replace(`/panel/sessions?add=${encodeURIComponent(id)}`);
    }, [id, router]);

    return (
        <div className="flex h-dvh items-center justify-center gap-3 text-muted-foreground lg:h-[calc(100vh-var(--shell-top,0px))]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Opening session…</span>
        </div>
    );
}
