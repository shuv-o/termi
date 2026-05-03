/**
 * Fixed-capacity circular byte buffer.
 * Oldest bytes are overwritten when capacity is exceeded.
 */
export class RingBuffer {
    private readonly buf: Uint8Array;
    private head = 0;  // next write position
    private size = 0;  // current used bytes

    constructor(private readonly capacity: number = 256 * 1024) {
        this.buf = new Uint8Array(capacity);
    }

    append(data: Uint8Array): void {
        for (let i = 0; i < data.length; i++) {
            this.buf[this.head] = data[i];
            this.head = (this.head + 1) % this.capacity;
            if (this.size < this.capacity) this.size++;
        }
    }

    /** Returns all buffered bytes in order (oldest first). */
    flush(): Uint8Array {
        if (this.size === 0) return new Uint8Array(0);
        const out = new Uint8Array(this.size);
        const start = this.size < this.capacity ? 0 : this.head;
        for (let i = 0; i < this.size; i++) {
            out[i] = this.buf[(start + i) % this.capacity];
        }
        return out;
    }

    get byteLength(): number {
        return this.size;
    }
}
