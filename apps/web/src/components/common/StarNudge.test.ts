import { describe, it, expect, vi, afterEach } from 'vitest';

import { accountAgeDays, shouldShowStarNudge } from './StarNudge';

const DAY_MS = 1000 * 60 * 60 * 24;

describe('accountAgeDays', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('computes whole and fractional days correctly', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));

        expect(accountAgeDays(new Date('2026-01-07T00:00:00.000Z').toISOString())).toBeCloseTo(3);
        expect(accountAgeDays(new Date('2026-01-09T12:00:00.000Z').toISOString())).toBeCloseTo(0.5);
    });

    it('is zero for an account created this instant', () => {
        vi.useFakeTimers();
        const now = new Date('2026-01-10T00:00:00.000Z');
        vi.setSystemTime(now);
        expect(accountAgeDays(now.toISOString())).toBe(0);
    });
});

describe('shouldShowStarNudge', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    function daysAgo(n: number): string {
        return new Date(Date.now() - n * DAY_MS).toISOString();
    }

    it('does not show for a brand-new account, even with a server saved', () => {
        expect(shouldShowStarNudge({ userCreatedAt: daysAgo(0), serverCount: 1 }, false)).toBe(
            false,
        );
    });

    it('does not show for an old account with no servers saved', () => {
        expect(shouldShowStarNudge({ userCreatedAt: daysAgo(10), serverCount: 0 }, false)).toBe(
            false,
        );
    });

    it('does not show once dismissed, regardless of other conditions', () => {
        expect(shouldShowStarNudge({ userCreatedAt: daysAgo(10), serverCount: 3 }, true)).toBe(
            false,
        );
    });

    it('does not show with no user data yet', () => {
        expect(shouldShowStarNudge({ userCreatedAt: undefined, serverCount: 5 }, false)).toBe(
            false,
        );
    });

    it('shows once the account is old enough and a server exists', () => {
        expect(shouldShowStarNudge({ userCreatedAt: daysAgo(3), serverCount: 1 }, false)).toBe(
            true,
        );
        expect(shouldShowStarNudge({ userCreatedAt: daysAgo(30), serverCount: 5 }, false)).toBe(
            true,
        );
    });

    it('is right at the boundary — just under the threshold does not show', () => {
        const almostThreeDays = new Date(Date.now() - (3 * DAY_MS - 1000)).toISOString();
        expect(shouldShowStarNudge({ userCreatedAt: almostThreeDays, serverCount: 1 }, false)).toBe(
            false,
        );
    });
});
