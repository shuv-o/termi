'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface VirtualKeyboardProps {
    onKey: (key: string) => void;
}

type Mode = 'alpha' | 'sym' | 'fn';

// Ctrl+letter → control char
function ctrlKey(ch: string): string {
    const code = ch.toUpperCase().charCodeAt(0);
    if (code >= 64 && code <= 95) return String.fromCharCode(code - 64);
    return ch;
}

// Short tactile pulse on keypress — no-op where the API is unsupported.
function haptic(ms = 8): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms);
    }
}

export default function VirtualKeyboard({ onKey }: VirtualKeyboardProps) {
    const [mode, setMode] = useState<Mode>('alpha');
    const [shift, setShift] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const [ctrl, setCtrl] = useState(false);
    const [alt, setAlt] = useState(false);

    // Uppercase when a one-shot shift is armed or caps lock is engaged.
    const upper = shift || capsLock;

    const send = useCallback(
        (key: string) => {
            let k = key;
            if (ctrl && k.length === 1) k = ctrlKey(k);
            if (alt) k = '\x1b' + k;
            onKey(k);
            if (ctrl) setCtrl(false);
            if (alt) setAlt(false);
        },
        [ctrl, alt, onKey],
    );

    // For alphabet keys — applies shift/caps for uppercase, then resets one-shot shift
    const sendChar = useCallback(
        (ch: string) => (e: React.PointerEvent) => {
            e.preventDefault();
            haptic();
            const k = mode === 'alpha' && upper && ch.match(/[a-z]/) ? ch.toUpperCase() : ch;
            send(k);
            if (shift && mode === 'alpha') setShift(false); // one-shot; caps lock persists
        },
        [mode, upper, shift, send],
    );

    const press = (key: string) => (e: React.PointerEvent) => {
        e.preventDefault();
        haptic();
        send(key);
    };
    const raw = (key: string) => (e: React.PointerEvent) => {
        e.preventDefault();
        haptic();
        onKey(key);
    };

    //   Key repeat on hold — for backspace / delete / arrows           ─
    const repeatRef = useRef<{
        delay?: ReturnType<typeof setTimeout>;
        interval?: ReturnType<typeof setInterval>;
    }>({});
    const stopRepeat = useCallback(() => {
        if (repeatRef.current.delay) clearTimeout(repeatRef.current.delay);
        if (repeatRef.current.interval) clearInterval(repeatRef.current.interval);
        repeatRef.current = {};
    }, []);
    // Clean up any pending timers on unmount.
    useEffect(() => stopRepeat, [stopRepeat]);

    /**
     * Pointer handlers for a key that fires once on press, then auto-repeats
     * while held (initial 380 ms delay, then every 55 ms — like a real
     * keyboard). Haptics only on the first press to avoid a buzzing hold.
     */
    const repeatKey = useCallback(
        (key: string) => ({
            onPointerDown: (e: React.PointerEvent) => {
                e.preventDefault();
                haptic();
                onKey(key);
                stopRepeat();
                repeatRef.current.delay = setTimeout(() => {
                    repeatRef.current.interval = setInterval(() => onKey(key), 55);
                }, 380);
            },
            onPointerUp: stopRepeat,
            onPointerLeave: stopRepeat,
            onPointerCancel: stopRepeat,
        }),
        [onKey, stopRepeat],
    );

    //   Shift / Caps Lock (double-tap Shift to lock)                   ─
    const lastShiftTap = useRef(0);
    const toggleShift = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            haptic();
            const now = Date.now();
            const isDouble = now - lastShiftTap.current < 300;
            lastShiftTap.current = now;
            if (isDouble) {
                // Double tap → engage caps lock
                setCapsLock(true);
                setShift(false);
            } else if (capsLock) {
                // A single tap while locked releases caps lock
                setCapsLock(false);
                setShift(false);
            } else {
                setShift((v) => !v);
            }
        },
        [capsLock],
    );

    const shiftCls = capsLock ? 'vk-key-lock' : shift ? 'vk-key-active' : 'vk-key-action';
    const shiftGlyph = capsLock ? '⇪' : '⇧';

    const toggleCtrl = (e: React.PointerEvent) => {
        e.preventDefault();
        haptic();
        setCtrl((v) => !v);
    };
    const toggleAlt = (e: React.PointerEvent) => {
        e.preventDefault();
        haptic();
        setAlt((v) => !v);
    };

    //   Paste — stream the system clipboard into the terminal          ─
    const handlePaste = useCallback(
        async (e: React.PointerEvent) => {
            e.preventDefault();
            haptic();
            try {
                const text = await navigator.clipboard?.readText();
                if (text) onKey(text);
            } catch {
                // Clipboard unavailable or permission denied — ignore.
            }
        },
        [onKey],
    );

    //   Special key strip (always visible, top of keyboard)
    const specialStrip: {
        label: string;
        cls?: string;
        action?: (e: React.PointerEvent) => void;
        repeat?: string;
    }[] = [
        {
            label: ctrl ? '✦Ctrl' : 'Ctrl',
            cls: ctrl ? 'vk-key-active' : 'vk-key-action',
            action: toggleCtrl,
        },
        {
            label: alt ? '✦Alt' : 'Alt',
            cls: alt ? 'vk-key-active' : 'vk-key-action',
            action: toggleAlt,
        },
        { label: 'Esc', cls: 'vk-key-action', action: press('\x1b') },
        { label: 'Tab', cls: 'vk-key-action', action: press('\t') },
        { label: '←', repeat: '\x1b[D' },
        { label: '↑', repeat: '\x1b[A' },
        { label: '↓', repeat: '\x1b[B' },
        { label: '→', repeat: '\x1b[C' },
        { label: 'Del', cls: 'vk-key-action', repeat: '\x1b[3~' },
        { label: '⌫', cls: 'vk-key-action', repeat: '\x7f' },
        { label: '📋', cls: 'vk-key-action', action: handlePaste },
    ];

    //   Alpha rows                              ─
    const alphaRow1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
    const alphaRow2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
    const alphaRow3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.'];

    //   Symbol rows
    const symRow1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    // Terminal-common symbols first
    const symRow2 = ['/', '~', '|', '>', '<', '$', '#', '-', '_', '\\'];
    const symRow3 = [
        '!',
        '@',
        '%',
        '^',
        '&',
        '*',
        '(',
        ')',
        '=',
        '+',
        '`',
        ';',
        "'",
        '"',
        ',',
        '.',
        '?',
        '[',
        ']',
        '{',
        '}',
    ];

    //   Fn combos
    const fnKeys = [
        { l: 'F1', k: '\x1bOP' },
        { l: 'F2', k: '\x1bOQ' },
        { l: 'F3', k: '\x1bOR' },
        { l: 'F4', k: '\x1bOS' },
        { l: 'F5', k: '\x1b[15~' },
        { l: 'F6', k: '\x1b[17~' },
        { l: 'F7', k: '\x1b[18~' },
        { l: 'F8', k: '\x1b[19~' },
        { l: 'F9', k: '\x1b[20~' },
        { l: 'F10', k: '\x1b[21~' },
        { l: 'F11', k: '\x1b[23~' },
        { l: 'F12', k: '\x1b[24~' },
    ];
    const navKeys = [
        { l: 'Home', k: '\x1b[H' },
        { l: 'End', k: '\x1b[F' },
        { l: 'PgUp', k: '\x1b[5~' },
        { l: 'PgDn', k: '\x1b[6~' },
        { l: 'Ins', k: '\x1b[2~' },
    ];
    const ctrlCombos = [
        { l: '^A', k: '\x01' },
        { l: '^E', k: '\x05' },
        { l: '^K', k: '\x0b' },
        { l: '^U', k: '\x15' },
        { l: '^W', k: '\x17' },
        { l: '^R', k: '\x12' },
        { l: '^L', k: '\x0c' },
        { l: '^\\', k: '\x1c' },
        { l: '^[', k: '\x1b' },
        { l: '^]', k: '\x1d' },
        { l: '^B', k: '\x02' },
        { l: '^F', k: '\x06' },
    ];

    return (
        <div className="virtual-keyboard select-none">
            {/*   Special strip   */}
            <div className="flex gap-[3px] mb-[5px]">
                {specialStrip.map((k) => (
                    <button
                        key={k.label}
                        className={`vk-key flex-1 text-[11px] ${k.cls ?? ''}`}
                        {...(k.repeat ? repeatKey(k.repeat) : { onPointerDown: k.action })}
                    >
                        {k.label}
                    </button>
                ))}
            </div>

            {/*   Alpha mode   */}
            {mode === 'alpha' && (
                <div className="flex flex-col gap-[3px]">
                    {/* Row 1 */}
                    <div className="flex gap-[3px]">
                        {alphaRow1.map((c) => (
                            <button key={c} className="vk-key flex-1" onPointerDown={sendChar(c)}>
                                {upper ? c.toUpperCase() : c}
                            </button>
                        ))}
                        <button
                            className="vk-key vk-key-action"
                            style={{ flex: 1.4 }}
                            {...repeatKey('\x7f')}
                        >
                            ⌫
                        </button>
                    </div>
                    {/* Row 2 */}
                    <div className="flex gap-[3px]">
                        <div style={{ flex: 0.5 }} />
                        {alphaRow2.map((c) => (
                            <button key={c} className="vk-key flex-1" onPointerDown={sendChar(c)}>
                                {upper ? c.toUpperCase() : c}
                            </button>
                        ))}
                        <button
                            className="vk-key vk-key-enter"
                            style={{ flex: 1.9 }}
                            onPointerDown={raw('\r')}
                        >
                            ↵
                        </button>
                    </div>
                    {/* Row 3 */}
                    <div className="flex gap-[3px]">
                        <button
                            className={`vk-key ${shiftCls}`}
                            style={{ flex: 1.5 }}
                            onPointerDown={toggleShift}
                        >
                            {shiftGlyph}
                        </button>
                        {alphaRow3.map((c) => (
                            <button key={c} className="vk-key flex-1" onPointerDown={sendChar(c)}>
                                {upper && c.match(/[a-z]/) ? c.toUpperCase() : c}
                            </button>
                        ))}
                        <button
                            className={`vk-key ${shiftCls}`}
                            style={{ flex: 1.5 }}
                            onPointerDown={toggleShift}
                        >
                            {shiftGlyph}
                        </button>
                    </div>
                </div>
            )}

            {/*   Symbol mode   */}
            {mode === 'sym' && (
                <div className="flex flex-col gap-[3px]">
                    <div className="flex gap-[3px]">
                        {symRow1.map((c) => (
                            <button key={c} className="vk-key flex-1" onPointerDown={press(c)}>
                                {c}
                            </button>
                        ))}
                        <button
                            className="vk-key vk-key-action"
                            style={{ flex: 1.4 }}
                            {...repeatKey('\x7f')}
                        >
                            ⌫
                        </button>
                    </div>
                    <div className="flex gap-[3px]">
                        {symRow2.map((c) => (
                            <button
                                key={c}
                                className="vk-key flex-1 font-mono"
                                onPointerDown={press(c)}
                            >
                                {c}
                            </button>
                        ))}
                        <button
                            className="vk-key vk-key-enter"
                            style={{ flex: 1.4 }}
                            onPointerDown={raw('\r')}
                        >
                            ↵
                        </button>
                    </div>
                    {/* Row 3 — scrollable overflow of remaining symbols */}
                    <div className="flex gap-[3px] overflow-x-auto no-scrollbar">
                        {symRow3.map((c) => (
                            <button
                                key={c}
                                className="vk-key shrink-0 w-9 font-mono"
                                onPointerDown={press(c)}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/*   Fn mode   */}
            {mode === 'fn' && (
                <div className="flex flex-col gap-[3px]">
                    {/* Function keys — two full-width rows of six */}
                    <div className="flex gap-[3px]">
                        {fnKeys.slice(0, 6).map((k) => (
                            <button
                                key={k.l}
                                className="vk-key flex-1 text-[11px]"
                                onPointerDown={raw(k.k)}
                            >
                                {k.l}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-[3px]">
                        {fnKeys.slice(6).map((k) => (
                            <button
                                key={k.l}
                                className="vk-key flex-1 text-[11px]"
                                onPointerDown={raw(k.k)}
                            >
                                {k.l}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-[3px]">
                        {navKeys.map((k) => (
                            <button
                                key={k.l}
                                className="vk-key flex-1 vk-key-action"
                                {...repeatKey(k.k)}
                            >
                                {k.l}
                            </button>
                        ))}
                        <div style={{ flex: 1 }} />
                        {ctrlCombos.slice(0, 5).map((k) => (
                            <button
                                key={k.l}
                                className="vk-key flex-1 font-mono text-[11px]"
                                onPointerDown={raw(k.k)}
                            >
                                {k.l}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-[3px]">
                        {ctrlCombos.slice(5).map((k) => (
                            <button
                                key={k.l}
                                className="vk-key flex-1 font-mono text-[11px]"
                                onPointerDown={raw(k.k)}
                            >
                                {k.l}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/*   Bottom action row   */}
            <div className="flex gap-[3px] mt-[3px]">
                <button
                    className={`vk-key vk-key-action text-[11px] ${mode === 'sym' ? 'vk-key-active' : ''}`}
                    style={{ flex: 1.6 }}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        haptic();
                        setMode((m) => (m === 'sym' ? 'alpha' : 'sym'));
                        setShift(false);
                    }}
                >
                    {mode === 'sym' ? 'ABC' : '#!='}
                </button>
                <button
                    className={`vk-key vk-key-action text-[11px] ${mode === 'fn' ? 'vk-key-active' : ''}`}
                    style={{ flex: 1.4 }}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        haptic();
                        setMode((m) => (m === 'fn' ? 'alpha' : 'fn'));
                    }}
                >
                    Fn
                </button>
                <button
                    className="vk-key text-slate-400 text-[11px]"
                    style={{ flex: 5 }}
                    onPointerDown={press(' ')}
                >
                    {ctrl ? '✦ Ctrl+…' : alt ? '✦ Alt+…' : 'space'}
                </button>
                <button
                    className="vk-key vk-key-danger text-[11px]"
                    style={{ flex: 1.2 }}
                    onPointerDown={raw('\x03')}
                >
                    ^C
                </button>
                <button
                    className="vk-key vk-key-warn  text-[11px]"
                    style={{ flex: 1.2 }}
                    onPointerDown={raw('\x04')}
                >
                    ^D
                </button>
                <button
                    className="vk-key vk-key-enter"
                    style={{ flex: 1.8 }}
                    onPointerDown={raw('\r')}
                >
                    ↵
                </button>
            </div>
        </div>
    );
}
