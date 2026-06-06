/**
 * Fixed-capacity circular byte buffer.
 * Oldest bytes are overwritten when capacity is exceeded.
 */
export class RingBuffer {
    private readonly buf: Uint8Array;
    private head = 0; // next write position
    private size = 0; // current used bytes

    constructor(private readonly capacity: number = 256 * 1024) {
        if (capacity <= 0 || !Number.isInteger(capacity)) {
            throw new RangeError(`RingBuffer capacity must be a positive integer, got ${capacity}`);
        }
        this.buf = new Uint8Array(capacity);
    }

    append(data: Uint8Array): void {
        const len = data.length;
        if (len === 0) return;

        // If chunk is larger than buffer capacity, only the tail fits.
        const src = len > this.capacity ? data.subarray(len - this.capacity) : data;
        const n = src.length;

        const spaceToEnd = this.capacity - this.head;
        if (n <= spaceToEnd) {
            this.buf.set(src, this.head);
        } else {
            this.buf.set(src.subarray(0, spaceToEnd), this.head);
            this.buf.set(src.subarray(spaceToEnd), 0);
        }

        this.head = (this.head + n) % this.capacity;
        this.size = Math.min(this.size + n, this.capacity);
    }

    /** Returns all buffered bytes in order (oldest first). Does not clear the buffer. */
    snapshot(): Uint8Array {
        if (this.size === 0) return new Uint8Array(0);
        const out = new Uint8Array(this.size);
        const start = this.size < this.capacity ? 0 : this.head;
        for (let i = 0; i < this.size; i++) {
            out[i] = this.buf[(start + i) % this.capacity];
        }
        return out;
    }

    /** Clears the buffer without zeroing memory. */
    clear(): void {
        this.head = 0;
        this.size = 0;
    }

    get byteLength(): number {
        return this.size;
    }
}
