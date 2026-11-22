import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import {
    CLOSED_MESSAGE,
    planReport,
    type ReportedConnection,
    type StoredConnection,
} from './live-connection.service';

const T = 1_700_000_000_000;

const reported = (id: string, over: Partial<ReportedConnection> = {}): ReportedConnection => ({
    id,
    userId: 'alice',
    sid: 's1',
    kind: 'session',
    protocol: 'ssh',
    serverId: 'srv1',
    sessionId: 'sess',
    attached: true,
    guests: 0,
    startedAt: T,
    lastActivityAt: T,
    ...over,
});

const stored = (connId: string, over: Partial<StoredConnection> = {}): StoredConnection => ({
    id: `row-${connId}`,
    connId,
    sid: 's1',
    attached: true,
    guests: 0,
    lastActivityAt: new Date(T),
    closeRequestedAt: null,
    ...over,
});

describe('planReport', () => {
    it('creates new, removes gone, leaves unchanged rows alone', () => {
        const plan = planReport([stored('a'), stored('gone')], [reported('a'), reported('new')]);
        expect(plan.create.map((c) => c.id)).toEqual(['new']);
        expect(plan.remove).toEqual(['row-gone']);
        expect(plan.update).toEqual([]);
        expect(plan.close).toEqual([]);
    });

    it('updates what changed, but not small activity moves', () => {
        const plan = planReport(
            [stored('a'), stored('b')],
            [
                reported('a', { attached: false, guests: 2, lastActivityAt: T + 5_000 }),
                reported('b', { lastActivityAt: T + 60_000, sid: 's2' }),
            ],
        );
        expect(plan.update).toEqual([
            { id: 'row-a', data: { attached: false, guests: 2 } },
            { id: 'row-b', data: { sid: 's2', lastActivityAt: new Date(T + 60_000) } },
        ]);
    });

    it('answers close requests for connections still open', () => {
        const plan = planReport(
            [
                stored('a', { closeRequestedAt: new Date(T) }),
                stored('b', { closeRequestedAt: new Date(T) }),
            ],
            [reported('a')],
        );
        expect(plan.close).toEqual([{ id: 'a', message: CLOSED_MESSAGE }]);
        // b is gone already: its row is simply removed.
        expect(plan.remove).toEqual(['row-b']);
    });

    it('counts a duplicated id once', () => {
        const plan = planReport([], [reported('a'), reported('a')]);
        expect(plan.create).toHaveLength(1);
    });

    it('an empty report removes everything for that gateway', () => {
        expect(planReport([stored('a')], []).remove).toEqual(['row-a']);
    });
});
