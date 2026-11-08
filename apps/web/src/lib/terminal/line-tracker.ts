/**
 * Tracks the command line being typed at a shell prompt, from the bytes the
 * user sends — enough to suggest completions and remember commands, without
 * any shell integration.
 *
 * It only trusts what it can follow: plain typing, Backspace and Enter. Any
 * other key (arrows, Tab completion, history, Ctrl shortcuts) may change the
 * line in ways the shell alone knows, so the line becomes "unknown" until the
 * next Enter or Ctrl+C, and nothing is suggested or remembered for it.
 */

export type TrackEvent =
    /** Enter on a line we followed; `line` is what was typed. */
    { kind: 'commit'; line: string } | { kind: 'change' } | { kind: 'none' };

/**
 * Replies xterm sends on its own: cursor position (`ESC[12;5R`, asked for by
 * shells like busybox ash at every prompt), focus in/out, device attributes,
 * window reports and OSC colour answers.
 */
const TERMINAL_REPORT =
    /^(?:\x1b\[\d+;\d+R|\x1b\[[IO]|\x1b\[[?>][\d;]*c|\x1b\[\d+(?:;\d+)*t|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))+$/;

export class LineTracker {
    private line = '';
    private known = true;

    /** The line typed so far, or null when it can't be known. */
    get current(): string | null {
        return this.known ? this.line : null;
    }

    reset(): void {
        this.line = '';
        this.known = true;
    }

    /** Feed what the user typed or pasted (xterm's onData). */
    feed(data: string): TrackEvent {
        // A paste or several keys at once: process character by character,
        // but an escape sequence anywhere means we've lost track.
        if (data.includes('\x1b')) {
            // The terminal's own answers (cursor position, focus, device
            // attributes, OSC replies) travel the same way but aren't typing.
            if (TERMINAL_REPORT.test(data)) return { kind: 'none' };
            if (data === '\x1b[200~' || data === '\x1b[201~') return { kind: 'none' }; // paste markers
            this.known = false;
            return { kind: 'change' };
        }
        let event: TrackEvent = { kind: 'none' };
        for (const ch of data) {
            if (ch === '\r' || ch === '\n') {
                const committed = this.known ? this.line : null;
                this.reset();
                event =
                    committed !== null ? { kind: 'commit', line: committed } : { kind: 'change' };
                // Anything after a newline in one paste is a new, untracked line.
                continue;
            }
            if (ch === '\x03' || ch === '\x15') {
                // Ctrl+C / Ctrl+U: the line is gone.
                this.reset();
                event = { kind: 'change' };
                continue;
            }
            if (ch === '\x7f' || ch === '\b') {
                if (this.known) this.line = this.line.slice(0, -1);
                event = { kind: 'change' };
                continue;
            }
            const code = ch.codePointAt(0)!;
            if (code < 0x20 || code === 0x7f) {
                // Tab, Ctrl+R, Ctrl+A… the shell may rewrite the line.
                this.known = false;
                event = { kind: 'change' };
                continue;
            }
            if (this.known) this.line += ch;
            if (this.line.length > 2000) this.known = false;
            event = { kind: 'change' };
        }
        return event;
    }
}
