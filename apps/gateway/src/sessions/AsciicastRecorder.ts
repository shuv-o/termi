/**
 * Records SSH terminal output as an asciicast v2 recording — the same format
 * asciinema uses (a JSON header line, then newline-delimited [time, "o", data]
 * event lines). Only "o" (output) events are captured: an interactive shell
 * already echoes typed input back through its output stream, so a faithful
 * on-screen replay never needs a separate input channel.
 *
 * Capped by both size and duration so a forgotten recording can't grow
 * unbounded in gateway memory — same safety-net pattern as the session
 * RingBuffer and the tunnel/broadcast limits on the web side.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB of asciicast text
const MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export class AsciicastRecorder {
    private readonly startedAt: number;
    private readonly lines: string[] = [];
    private bytes = 0;
    private full = false;

    constructor() {
        this.startedAt = Date.now();
        const header = {
            version: 2,
            width: 80,
            height: 24,
            timestamp: Math.floor(this.startedAt / 1000),
            env: { TERM: 'xterm-256color' },
        };
        const line = JSON.stringify(header) + '\n';
        this.lines.push(line);
        this.bytes += line.length;
    }

    /** True once the size or duration cap has been hit — further data is dropped. */
    get isFull(): boolean {
        return this.full;
    }

    append(data: Buffer): void {
        if (this.full) return;

        if (this.bytes >= MAX_BYTES || Date.now() - this.startedAt >= MAX_DURATION_MS) {
            this.full = true;
            return;
        }

        const t = (Date.now() - this.startedAt) / 1000;
        const line = JSON.stringify([t, 'o', data.toString('utf8')]) + '\n';
        this.lines.push(line);
        this.bytes += line.length;
    }

    serialize(): { cast: string; durationSec: number; sizeBytes: number } {
        const cast = this.lines.join('');
        return {
            cast,
            durationSec: Math.round((Date.now() - this.startedAt) / 1000),
            sizeBytes: cast.length,
        };
    }
}
