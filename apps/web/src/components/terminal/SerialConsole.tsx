'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Cable, Loader2, Plug, Unplug, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    BAUD_RATES,
    echoOf,
    encodeInput,
    sanitizeSettings,
    toSerialOptions,
    type SerialSettings,
} from '@/lib/serial/options';
import '@xterm/xterm/css/xterm.css';

// Minimal Web Serial typings (not in TypeScript's DOM library yet).
interface WebSerialPort {
    open(options: ReturnType<typeof toSerialOptions>): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
    setSignals(signals: { break?: boolean }): Promise<void>;
    getInfo(): { usbVendorId?: number; usbProductId?: number };
}
interface WebSerial {
    requestPort(): Promise<WebSerialPort>;
    addEventListener(type: 'disconnect', cb: (e: Event & { target: unknown }) => void): void;
    removeEventListener(type: 'disconnect', cb: (e: Event & { target: unknown }) => void): void;
}
const webSerial = (): WebSerial | null =>
    typeof navigator !== 'undefined' && 'serial' in navigator
        ? ((navigator as unknown as { serial: WebSerial }).serial ?? null)
        : null;

const SETTINGS_KEY = 'termi-serial-settings';
const loadSettings = () => {
    try {
        return sanitizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'));
    } catch {
        return sanitizeSettings(null);
    }
};

const selectClass =
    'h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60';

/**
 * A console for a device on this computer's serial port (USB console cables
 * for switches, routers, firewalls, embedded boards). Uses the browser's Web
 * Serial API, so nothing goes through Termi's servers.
 */
export default function SerialConsole() {
    const [supported, setSupported] = useState<boolean | null>(null);
    const [settings, setSettings] = useState<SerialSettings>(() => sanitizeSettings(null));
    const [state, setState] = useState<'idle' | 'connecting' | 'connected'>('idle');
    const [error, setError] = useState('');
    const box = useRef<HTMLDivElement>(null);
    const term = useRef<Terminal | null>(null);
    const port = useRef<WebSerialPort | null>(null);
    const reader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const writer = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    useEffect(() => {
        setSupported(!!webSerial());
        setSettings(loadSettings());
    }, []);

    const update = (patch: Partial<SerialSettings>) =>
        setSettings((s) => {
            const next = { ...s, ...patch };
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
            } catch {
                /* not remembered */
            }
            return next;
        });

    // The terminal itself.
    useEffect(() => {
        if (!box.current || !supported) return;
        const t = new Terminal({
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 14,
            cursorBlink: true,
            convertEol: false,
            theme: { background: '#0d1117' },
        });
        const fit = new FitAddon();
        t.loadAddon(fit);
        t.open(box.current);
        fit.fit();
        const ro = new ResizeObserver(() => fit.fit());
        ro.observe(box.current);
        const input = t.onData((data) => {
            const w = writer.current;
            if (!w) return;
            const s = settingsRef.current;
            if (s.localEcho) t.write(echoOf(data));
            void w.write(new TextEncoder().encode(encodeInput(data, s.enter))).catch(() => {});
        });
        term.current = t;
        t.writeln('Choose Connect to pick a serial device.');
        return () => {
            input.dispose();
            ro.disconnect();
            t.dispose();
            term.current = null;
        };
    }, [supported]);

    const disconnect = useCallback(async (note?: string) => {
        try {
            await reader.current?.cancel();
        } catch {
            /* already gone */
        }
        try {
            writer.current?.releaseLock();
        } catch {
            /* already released */
        }
        reader.current = null;
        writer.current = null;
        try {
            await port.current?.close();
        } catch {
            /* unplugged */
        }
        port.current = null;
        setState('idle');
        if (note) term.current?.writeln(`\r\n\x1b[33m${note}\x1b[0m`);
    }, []);

    // An unplugged cable ends the session.
    useEffect(() => {
        const serial = webSerial();
        if (!serial) return;
        const onGone = (e: Event & { target: unknown }) => {
            if (e.target === port.current) void disconnect('Device disconnected.');
        };
        serial.addEventListener('disconnect', onGone);
        return () => serial.removeEventListener('disconnect', onGone);
    }, [disconnect]);

    useEffect(() => () => void disconnect(), [disconnect]);

    const connect = async () => {
        const serial = webSerial();
        if (!serial) return;
        setError('');
        let chosen: WebSerialPort;
        try {
            chosen = await serial.requestPort();
        } catch {
            return; // the user closed the chooser
        }
        setState('connecting');
        try {
            await chosen.open(toSerialOptions(settings));
        } catch (err) {
            setState('idle');
            setError(
                `Could not open the device: ${(err as Error).message}. Is another program using it?`,
            );
            return;
        }
        port.current = chosen;
        writer.current = chosen.writable?.getWriter() ?? null;
        setState('connected');
        const t = term.current;
        t?.writeln(
            `\r\n\x1b[32mConnected at ${settings.baudRate} baud (${settings.dataBits}${settings.parity[0].toUpperCase()}${settings.stopBits}).\x1b[0m`,
        );
        t?.focus();
        // Read until the port closes.
        void (async () => {
            while (port.current === chosen && chosen.readable) {
                const r = chosen.readable.getReader();
                reader.current = r;
                try {
                    for (;;) {
                        const { value, done } = await r.read();
                        if (done) break;
                        if (value) term.current?.write(value);
                    }
                } catch {
                    break; // device error or cancel
                } finally {
                    r.releaseLock();
                }
            }
        })();
    };

    const sendBreak = async () => {
        const p = port.current;
        if (!p) return;
        await p.setSignals({ break: true }).catch(() => {});
        setTimeout(() => void p.setSignals({ break: false }).catch(() => {}), 250);
    };

    if (supported === false) {
        return (
            <div className="mx-auto mt-12 max-w-md space-y-2 rounded-xl border border-border bg-card p-6 text-center">
                <Cable className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="font-medium">
                    Serial consoles need Chrome, Edge or the Termi desktop app
                </p>
                <p className="text-sm text-muted-foreground">
                    This browser doesn&apos;t support the Web Serial API, which lets Termi talk to a
                    USB console cable on your computer.
                </p>
            </div>
        );
    }

    const busy = state !== 'idle';
    return (
        <div className="flex h-full flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Baud rate
                    <select
                        aria-label="Baud rate"
                        value={settings.baudRate}
                        disabled={busy}
                        onChange={(e) => update({ baudRate: Number(e.target.value) })}
                        className={selectClass}
                    >
                        {BAUD_RATES.map((b) => (
                            <option key={b} value={b}>
                                {b}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Data bits
                    <select
                        aria-label="Data bits"
                        value={settings.dataBits}
                        disabled={busy}
                        onChange={(e) => update({ dataBits: Number(e.target.value) as 7 | 8 })}
                        className={selectClass}
                    >
                        <option value={8}>8</option>
                        <option value={7}>7</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Parity
                    <select
                        aria-label="Parity"
                        value={settings.parity}
                        disabled={busy}
                        onChange={(e) =>
                            update({ parity: e.target.value as SerialSettings['parity'] })
                        }
                        className={selectClass}
                    >
                        <option value="none">None</option>
                        <option value="even">Even</option>
                        <option value="odd">Odd</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Stop bits
                    <select
                        aria-label="Stop bits"
                        value={settings.stopBits}
                        disabled={busy}
                        onChange={(e) => update({ stopBits: Number(e.target.value) as 1 | 2 })}
                        className={selectClass}
                    >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Flow control
                    <select
                        aria-label="Flow control"
                        value={settings.flowControl}
                        disabled={busy}
                        onChange={(e) =>
                            update({ flowControl: e.target.value as SerialSettings['flowControl'] })
                        }
                        className={selectClass}
                    >
                        <option value="none">None</option>
                        <option value="hardware">Hardware (RTS/CTS)</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Enter sends
                    <select
                        aria-label="Enter sends"
                        value={settings.enter}
                        onChange={(e) =>
                            update({ enter: e.target.value as SerialSettings['enter'] })
                        }
                        className={selectClass}
                    >
                        <option value="CR">CR</option>
                        <option value="LF">LF</option>
                        <option value="CRLF">CR LF</option>
                    </select>
                </label>
                <label className="flex h-9 items-center gap-1.5 text-xs">
                    <input
                        type="checkbox"
                        checked={settings.localEcho}
                        onChange={(e) => update({ localEcho: e.target.checked })}
                        className="accent-primary"
                    />
                    Local echo
                </label>
                <div className="ml-auto flex gap-2">
                    {state === 'connected' && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={sendBreak}
                            title="Send a break signal"
                        >
                            <Zap /> Break
                        </Button>
                    )}
                    {state === 'connected' ? (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => disconnect('Disconnected.')}
                        >
                            <Unplug /> Disconnect
                        </Button>
                    ) : (
                        <Button size="sm" onClick={connect} disabled={busy}>
                            {state === 'connecting' ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                <Plug />
                            )}
                            Connect
                        </Button>
                    )}
                </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div
                ref={box}
                data-testid="serial-terminal"
                className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-[#0d1117] p-1"
            />
        </div>
    );
}
