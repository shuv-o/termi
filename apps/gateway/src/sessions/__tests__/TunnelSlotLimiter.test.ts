import { describe, it, expect } from 'vitest';
import { TunnelSlotLimiter } from '../TunnelSlotLimiter.js';

describe('TunnelSlotLimiter', () => {
    it('grants slots up to the per-user cap', () => {
        const limiter = new TunnelSlotLimiter(2);
        expect(limiter.tryAcquire('u1')).toBe(true);
        expect(limiter.tryAcquire('u1')).toBe(true);
        expect(limiter.activeCount('u1')).toBe(2);
    });

    it('rejects once a user is at the cap', () => {
        const limiter = new TunnelSlotLimiter(1);
        expect(limiter.tryAcquire('u1')).toBe(true);
        expect(limiter.tryAcquire('u1')).toBe(false);
        expect(limiter.activeCount('u1')).toBe(1);
    });

    it('tracks each user independently', () => {
        const limiter = new TunnelSlotLimiter(1);
        expect(limiter.tryAcquire('u1')).toBe(true);
        expect(limiter.tryAcquire('u2')).toBe(true);
        expect(limiter.activeCount('u1')).toBe(1);
        expect(limiter.activeCount('u2')).toBe(1);
    });

    it('frees a slot on release, allowing a new acquire', () => {
        const limiter = new TunnelSlotLimiter(1);
        limiter.tryAcquire('u1');
        expect(limiter.tryAcquire('u1')).toBe(false);
        limiter.release('u1');
        expect(limiter.tryAcquire('u1')).toBe(true);
    });

    it('drops the map entry entirely once count reaches zero', () => {
        const limiter = new TunnelSlotLimiter(5);
        limiter.tryAcquire('u1');
        limiter.release('u1');
        expect(limiter.activeCount('u1')).toBe(0);
    });

    it('is a no-op releasing a user that holds no slots', () => {
        const limiter = new TunnelSlotLimiter(5);
        expect(() => limiter.release('ghost')).not.toThrow();
        expect(limiter.activeCount('ghost')).toBe(0);
    });
});
