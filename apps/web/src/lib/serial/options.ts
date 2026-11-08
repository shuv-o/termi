/**
 * Serial console settings (Web Serial API) — the pure parts, kept separate
 * so they can be tested without hardware.
 */

export type Parity = 'none' | 'even' | 'odd';
export type FlowControl = 'none' | 'hardware';
export type EnterMode = 'CR' | 'LF' | 'CRLF';

export interface SerialSettings {
    baudRate: number;
    dataBits: 7 | 8;
    parity: Parity;
    stopBits: 1 | 2;
    flowControl: FlowControl;
    /** What pressing Enter sends. Most network gear wants CR; Linux consoles accept either. */
    enter: EnterMode;
    /** Show what you type yourself (for devices that don't echo). */
    localEcho: boolean;
}

export const BAUD_RATES = [
    1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
];

export const DEFAULT_SERIAL_SETTINGS: SerialSettings = {
    baudRate: 9600,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    flowControl: 'none',
    enter: 'CR',
    localEcho: false,
};

/** Options for `SerialPort.open()`. */
export function toSerialOptions(s: SerialSettings) {
    return {
        baudRate: s.baudRate,
        dataBits: s.dataBits,
        parity: s.parity,
        stopBits: s.stopBits,
        flowControl: s.flowControl,
        bufferSize: 65536,
    };
}

const ENTER: Record<EnterMode, string> = { CR: '\r', LF: '\n', CRLF: '\r\n' };

/** Typed data as it should go to the device (Enter translated). */
export function encodeInput(data: string, enter: EnterMode): string {
    return data.replace(/\r/g, ENTER[enter]);
}

/** What local echo should print for typed data (Enter as a new line). */
export function echoOf(data: string): string {
    return data.replace(/\r/g, '\r\n').replace(/\x7f/g, '\b \b');
}

/** Settings read back from storage, with anything invalid reset to defaults. */
export function sanitizeSettings(raw: unknown): SerialSettings {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SerialSettings>;
    const d = DEFAULT_SERIAL_SETTINGS;
    const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
        allowed.includes(v as T) ? (v as T) : fallback;
    return {
        baudRate: pick(r.baudRate, BAUD_RATES, d.baudRate),
        dataBits: pick(r.dataBits, [7, 8] as const, d.dataBits),
        parity: pick(r.parity, ['none', 'even', 'odd'] as const, d.parity),
        stopBits: pick(r.stopBits, [1, 2] as const, d.stopBits),
        flowControl: pick(r.flowControl, ['none', 'hardware'] as const, d.flowControl),
        enter: pick(r.enter, ['CR', 'LF', 'CRLF'] as const, d.enter),
        localEcho: typeof r.localEcho === 'boolean' ? r.localEcho : d.localEcho,
    };
}
