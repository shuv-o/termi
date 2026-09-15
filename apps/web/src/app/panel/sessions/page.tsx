'use client';

/**
 * The sessions UI (terminals, tab bar, file manager) lives in SessionsWorkspace,
 * which is rendered persistently in the panel layout so that WebSocket
 * connections survive navigation between pages.
 *
 * This page component only handles the `?add=<serverId>` URL param, which is
 * how every other surface opens a shell: the dashboard's Connect button, the
 * server detail page, groups, QR connect codes and the legacy
 * `/panel/connect/<id>/ssh` route all land here.
 */

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSessionsContext } from '../sessions-context';

function AutoConnect() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { addSession, setActiveTabId, sessions } = useSessionsContext();

    // Always-current snapshot, so the effect can read the session list without
    // re-running every time a status changes.
    const sessionsRef = useRef(sessions);
    sessionsRef.current = sessions;

    const addId = searchParams.get('add');

    useEffect(() => {
        if (!addId) return;

        // Focus the existing tab rather than opening a second shell on the same
        // box — clicking Connect twice used to be a no-op that left you looking
        // at whatever tab happened to be active.
        const existing = sessionsRef.current.find((s) => s.serverId === addId);
        if (existing) setActiveTabId(existing.tabId);
        else void addSession(addId);

        // Drop the param so a later back/forward through this entry, or a
        // refresh, doesn't re-trigger the connect.
        router.replace('/panel/sessions');
    }, [addId, addSession, setActiveTabId, router]);

    return null;
}

export default function SessionsPage() {
    return (
        <Suspense fallback={null}>
            <AutoConnect />
        </Suspense>
    );
}
