/**
 * Shared terminal sessions: guests watching (or, if allowed, typing into)
 * someone else's live SSH session.
 *
 * A guest arrives with a join token minted by the web app for one session
 * share link. Joining is never automatic: the session's owner — who must be
 * connected — gets a prompt and lets each person in or not; unanswered
 * requests are refused after a minute. Guests receive the terminal's output
 * only (never credentials); "control" guests may also type. The owner sees
 * who is connected and can remove anyone at any time.
 */

import { randomBytes } from 'crypto';
import { WebSocket } from 'ws';
import type { PersistentSession } from './PersistentSessionStore.js';

export type GuestMode = 'view' | 'control';

export interface Guest {
    id: string;
    ws: WebSocket;
    userId: string;
    email: string;
    mode: GuestMode;
    /** Web sign-in behind the guest's token (see access-check.ts). */
    sid: string | null;
    /** The share link the guest came in through. */
    shareId: string | null;
}

export const MAX_GUESTS = 10;
const JOIN_TIMEOUT_MS = 60_000;

const send = (ws: WebSocket | null, msg: Record<string, unknown>) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

/** Tell the owner who is in the session now. */
export function announceGuests(session: PersistentSession): void {
    send(session.attachedWs, {
        type: 'participants',
        guests: [...session.guests.values()].map((g) => ({
            id: g.id,
            email: g.email,
            mode: g.mode,
        })),
    });
}

/** Terminal output to every guest. */
export function fanOut(session: PersistentSession, data: Buffer): void {
    for (const g of session.guests.values()) {
        if (g.ws.readyState === WebSocket.OPEN) g.ws.send(data, { binary: true });
    }
}

/** Disconnect every guest (the session ended or the owner closed it). */
export function closeGuests(session: PersistentSession, reason: string): void {
    for (const g of session.guests.values()) {
        send(g.ws, { type: 'session-ended', message: reason });
        g.ws.close(1000, 'Session ended');
    }
    session.guests.clear();
    for (const answer of session.joinRequests.values()) answer(false);
    session.joinRequests.clear();
}

/** The owner's answer to a join request. */
export function answerJoin(session: PersistentSession, id: unknown, allow: unknown): void {
    if (typeof id !== 'string') return;
    session.joinRequests.get(id)?.(allow === true);
}

/** The owner removes a guest. */
export function kickGuest(session: PersistentSession, id: unknown): void {
    if (typeof id !== 'string') return;
    removeGuest(session, id, 'The owner removed you from this session');
}

/** Disconnect one guest, telling them why. */
export function removeGuest(session: PersistentSession, id: string, message: string): void {
    const g = session.guests.get(id);
    if (!g) return;
    send(g.ws, { type: 'session-ended', message });
    g.ws.close(1000, 'Removed');
    session.guests.delete(id);
    announceGuests(session);
}

/**
 * A guest's WebSocket wants in: ask the owner, then attach it as a guest.
 * The caller has already checked that the token is for this session.
 */
export function requestJoin(
    session: PersistentSession,
    ws: WebSocket,
    guest: {
        userId: string;
        email: string;
        mode: GuestMode;
        sid: string | null;
        shareId: string | null;
    },
): void {
    const fail = (message: string) => {
        send(ws, { type: 'error', message });
        ws.close(1000, 'Not admitted');
    };
    if (session.attachedWs?.readyState !== WebSocket.OPEN) {
        return fail('The person sharing this session is not connected right now');
    }
    if (session.guests.size + session.joinRequests.size >= MAX_GUESTS) {
        return fail('This session already has the maximum number of guests');
    }

    const id = randomBytes(8).toString('hex');
    let decided = false;
    const decide = (allow: boolean) => {
        if (decided) return;
        decided = true;
        clearTimeout(timer);
        session.joinRequests.delete(id);
        send(session.attachedWs, { type: 'join-request-closed', id });
        if (!allow || ws.readyState !== WebSocket.OPEN) {
            return fail('The person sharing this session did not let you in');
        }
        session.guests.set(id, { id, ws, ...guest });
        send(ws, { type: 'joined', mode: guest.mode });
        const buffered = session.buffer.snapshot();
        if (buffered.length > 0) ws.send(buffered, { binary: true });
        announceGuests(session);
    };
    const timer = setTimeout(() => decide(false), JOIN_TIMEOUT_MS);
    session.joinRequests.set(id, decide);

    ws.on('message', (data: Buffer, isBinary: boolean) => {
        const g = session.guests.get(id);
        if (!g) return; // not admitted (yet)
        if (isBinary) {
            if (g.mode === 'control' && !session.isClosing) {
                session.lastActivityAt = Date.now();
                session.handler.write(data);
            }
            return;
        }
        // Guests send nothing else: their window size never changes the shell's.
    });
    ws.on('close', () => {
        decide(false);
        if (session.guests.delete(id)) announceGuests(session);
    });
    ws.on('error', () => ws.close());

    send(ws, { type: 'waiting' });
    send(session.attachedWs, { type: 'join-request', id, email: guest.email, mode: guest.mode });
}
