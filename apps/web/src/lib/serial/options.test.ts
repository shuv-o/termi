import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SERIAL_SETTINGS,
    echoOf,
    encodeInput,
    sanitizeSettings,
    toSerialOptions,
} from './options';

describe('serial settings', () => {
    it('translates Enter for the device', () => {
        expect(encodeInput('show run\r', 'CR')).toBe('show run\r');
        expect(encodeInput('ls\r', 'LF')).toBe('ls\n');
        expect(encodeInput('a\rb\r', 'CRLF')).toBe('a\r\nb\r\n');
    });

    it('echoes Enter as a new line and Backspace as an erase', () => {
        expect(echoOf('ab\x7f\r')).toBe('ab\b \b\r\n');
    });

    it('maps settings to SerialPort.open options', () => {
        expect(
            toSerialOptions({ ...DEFAULT_SERIAL_SETTINGS, baudRate: 115200, parity: 'even' }),
        ).toMatchObject({
            baudRate: 115200,
            dataBits: 8,
            parity: 'even',
            stopBits: 1,
            flowControl: 'none',
        });
    });

    it('resets anything invalid read from storage', () => {
        expect(
            sanitizeSettings({ baudRate: 12345, parity: 'mark', localEcho: 'yes', enter: 'LF' }),
        ).toEqual({
            ...DEFAULT_SERIAL_SETTINGS,
            enter: 'LF',
        });
        expect(sanitizeSettings(null)).toEqual(DEFAULT_SERIAL_SETTINGS);
    });
});
