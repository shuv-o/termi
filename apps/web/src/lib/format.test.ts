import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatBytes, formatRelativeTime, formatUnixDate } from './format';

describe('formatBytes', () => {
    it('scales through each unit', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(1_572_864)).toBe('1.5 MB');
        expect(formatBytes(1_610_612_736)).toBe('1.5 GB');
        expect(formatBytes(1_649_267_441_664)).toBe('1.5 TB');
    });

    it('renders zero as "0 B" by default', () => {
        expect(formatBytes(0)).toBe('0 B');
    });

    it('uses the zero label when provided', () => {
        expect(formatBytes(0, '—')).toBe('—');
        expect(formatBytes(1024, '—')).toBe('1.0 KB');
    });
});

describe('formatRelativeTime', () => {
    afterEach(() => vi.useRealTimers());

    it('returns "Never" for a missing date', () => {
        expect(formatRelativeTime(null)).toBe('Never');
    });

    it('buckets into minutes, hours and days', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));
        expect(formatRelativeTime('2026-01-10T11:59:30Z')).toBe('Just now');
        expect(formatRelativeTime('2026-01-10T11:30:00Z')).toBe('30m ago');
        expect(formatRelativeTime('2026-01-10T07:00:00Z')).toBe('5h ago');
        expect(formatRelativeTime('2026-01-07T12:00:00Z')).toBe('3d ago');
    });
});

describe('formatUnixDate', () => {
    it('returns a dash for a missing timestamp', () => {
        expect(formatUnixDate(0)).toBe('—');
    });

    it('includes the year only for other years', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
        // 2024-03-05 — a different year, so the year is shown.
        expect(formatUnixDate(1709596800)).toMatch(/2024/);
        vi.useRealTimers();
    });
});
