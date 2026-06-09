/**
 * Telnet Connection Handler
 *
 * Manages a raw TCP Telnet connection with IAC negotiation.
 * Implements the same SSHOutputSink interface as SSHHandler so index.ts
 * can treat it uniformly for binary I/O and control messages.
 */

import { Socket } from 'net';
import type { SSHOutputSink } from './ssh.js';
import type { TokenPayload } from '../auth/token.js';

// IAC codes
const IAC = 0xff;
const WILL = 0xfb;
const WONT = 0xfc;
const DO = 0xfd;
const DONT = 0xfe;
const SB = 0xfa; // subnegotiation begin
const SE = 0xf0; // subnegotiation end

// Option codes
const OPT_ECHO = 0x01;
const OPT_SGA = 0x03; // Suppress Go-Ahead
const OPT_TERMINAL_TYPE = 0x18;
const OPT_NAWS = 0x1f; // Negotiate About Window Size

export class TelnetHandler {
    private socket: Socket;
    private connected = false;
    private closing = false;
    private sink: SSHOutputSink;
    private iacBuffer: number[] = [];
    private cols = 80;
    private rows = 24;

    constructor(token: TokenPayload, sink: SSHOutputSink) {
        this.sink = sink;
        this.socket = new Socket();
        this.setupSocket(token);
    }

    write(data: Buffer): void {
        if (this.connected && !this.closing) {
            this.socket.write(data);
        }
    }

    resize(rows: number, cols: number): void {
        this.rows = rows;
        this.cols = cols;
        if (this.connected && !this.closing) {
            this.sendNAWS();
        }
    }

    close(): void {
        if (this.closing) return;
        this.closing = true;
        this.connected = false;
        this.socket.destroy();
    }

    isConnected(): boolean {
        return this.connected;
    }

    private setupSocket(token: TokenPayload): void {
        this.socket.setTimeout(15000);

        this.socket.on('connect', () => {
            this.socket.setTimeout(0);
            this.connected = true;
            this.sink.onMessage('shell-ready');
        });

        this.socket.on('data', (data: Buffer) => {
            this.processIncoming(data);
        });

        this.socket.on('close', () => {
            if (!this.closing) {
                this.sink.onMessage('disconnected');
            }
        });

        this.socket.on('error', (err: NodeJS.ErrnoException) => {
            let msg = err.message;
            if (err.code === 'ECONNREFUSED') msg = 'Connection refused — port is closed';
            else if (err.code === 'ENOTFOUND') msg = 'Host not found — check the address';
            else if (err.code === 'ETIMEDOUT') msg = 'Connection timed out';
            else if (err.code === 'ENETUNREACH') msg = 'Network unreachable';
            this.sink.onMessage('error', { message: 'Telnet error: ' + msg });
        });

        this.socket.on('timeout', () => {
            this.sink.onMessage('error', { message: 'Telnet connection timed out' });
            this.close();
        });

        try {
            this.socket.connect(token.port, token.host);
        } catch (err) {
            this.sink.onMessage('error', {
                message: 'Connection failed: ' + (err as Error).message,
            });
            this.close();
        }
    }

    /**
     * Parse incoming bytes, strip IAC sequences, negotiate options,
     * and forward printable data to the sink.
     */
    private processIncoming(data: Buffer): void {
        const output: number[] = [];
        let i = 0;

        while (i < data.length) {
            const byte = data[i];

            if (this.iacBuffer.length > 0 || byte === IAC) {
                this.iacBuffer.push(byte);
                const result = this.consumeIAC();
                if (result !== null) {
                    if (result.length > 0) output.push(...result);
                    this.iacBuffer = [];
                }
                i++;
                continue;
            }

            output.push(byte);
            i++;
        }

        if (output.length > 0) {
            this.sink.onData(Buffer.from(output));
        }
    }

    /**
     * Attempt to consume the current iacBuffer as a complete IAC sequence.
     * Returns null if more bytes are needed, or the bytes to emit (often []).
     */
    private consumeIAC(): number[] | null {
        const buf = this.iacBuffer;
        if (buf.length === 0 || buf[0] !== IAC) return [];

        if (buf.length < 2) return null;

        const cmd = buf[1];

        // Escaped 0xFF literal
        if (cmd === IAC) return [0xff];

        // 3-byte option commands
        if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
            if (buf.length < 3) return null;
            this.handleOption(cmd, buf[2]);
            return [];
        }

        // Subnegotiation: SB option ... IAC SE
        if (cmd === SB) {
            for (let i = 2; i < buf.length - 1; i++) {
                if (buf[i] === IAC && buf[i + 1] === SE) {
                    const opt = buf[2];
                    const payload = Buffer.from(buf.slice(3, i));
                    this.handleSubneg(opt, payload);
                    return [];
                }
            }
            return null; // incomplete subneg — wait for more bytes
        }

        // Other single-byte commands (GA, EL, EC, NOP, …) — skip
        return [];
    }

    private handleOption(cmd: number, opt: number): void {
        switch (cmd) {
            case DO:
                // Server requests we enable an option
                if (opt === OPT_NAWS) {
                    this.sendCmd(WILL, opt);
                    this.sendNAWS();
                } else if (opt === OPT_TERMINAL_TYPE || opt === OPT_SGA) {
                    this.sendCmd(WILL, opt);
                } else {
                    this.sendCmd(WONT, opt);
                }
                break;

            case WILL:
                // Server announces it will enable an option
                if (opt === OPT_ECHO || opt === OPT_SGA) {
                    this.sendCmd(DO, opt);
                } else {
                    this.sendCmd(DONT, opt);
                }
                break;

            case WONT:
            case DONT:
                // Server declining — no response needed
                break;
        }
    }

    private handleSubneg(opt: number, payload: Buffer): void {
        // Server asking for terminal type (SEND = 1)
        if (opt === OPT_TERMINAL_TYPE && payload.length > 0 && payload[0] === 1) {
            const termType = Buffer.from('xterm-256color');
            const response = Buffer.concat([
                Buffer.from([IAC, SB, OPT_TERMINAL_TYPE, 0]), // IS = 0
                termType,
                Buffer.from([IAC, SE]),
            ]);
            this.socket.write(response);
        }
    }

    private sendCmd(cmd: number, opt: number): void {
        this.socket.write(Buffer.from([IAC, cmd, opt]));
    }

    private sendNAWS(): void {
        // Escape any 0xFF bytes in the dimension values per RFC 854
        const raw = [
            (this.cols >> 8) & 0xff,
            this.cols & 0xff,
            (this.rows >> 8) & 0xff,
            this.rows & 0xff,
        ];
        const escaped: number[] = [];
        for (const b of raw) {
            if (b === 0xff) escaped.push(0xff, 0xff);
            else escaped.push(b);
        }
        this.socket.write(Buffer.from([IAC, SB, OPT_NAWS, ...escaped, IAC, SE]));
    }
}
