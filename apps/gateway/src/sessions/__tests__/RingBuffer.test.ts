import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../RingBuffer.js';

describe('RingBuffer', () => {
    it('starts empty', () => {
        const buf = new RingBuffer(100);
        expect(buf.byteLength).toBe(0);
        expect(buf.flush()).toEqual(new Uint8Array(0));
    });

    it('stores and flushes bytes within capacity', () => {
        const buf = new RingBuffer(10);
        buf.append(new Uint8Array([1, 2, 3]));
        expect(buf.byteLength).toBe(3);
        expect(buf.flush()).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('flushes multiple appends in order', () => {
        const buf = new RingBuffer(10);
        buf.append(new Uint8Array([1, 2]));
        buf.append(new Uint8Array([3, 4]));
        expect(buf.flush()).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('wraps around and drops oldest bytes when capacity exceeded', () => {
        const buf = new RingBuffer(4);
        buf.append(new Uint8Array([1, 2, 3, 4])); // fills buffer
        buf.append(new Uint8Array([5]));           // drops byte 1
        expect(buf.byteLength).toBe(4);
        expect(buf.flush()).toEqual(new Uint8Array([2, 3, 4, 5]));
    });

    it('handles append larger than capacity', () => {
        const buf = new RingBuffer(3);
        buf.append(new Uint8Array([1, 2, 3, 4, 5])); // only last 3 survive
        expect(buf.flush()).toEqual(new Uint8Array([3, 4, 5]));
    });
});
