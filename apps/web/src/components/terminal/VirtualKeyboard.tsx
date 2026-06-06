'use client';

import { useState, useCallback } from 'react';

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

export default function VirtualKeyboard({ onKey }: VirtualKeyboardProps) {
    const [mode, setMode] = useState<Mode>('alpha');
    const [shift, setShift] = useState(false);
    const [ctrl, setCtrl] = useState(false);
    const [alt, setAlt] = useState(false);

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

    // For alphabet keys — applies shift for uppercase, then resets shift
    const sendChar = useCallback(
        (ch: string) => (e: React.PointerEvent) => {
            e.preventDefault();
            const k = mode === 'alpha' && shift && ch.match(/[a-z]/) ? ch.toUpperCase() : ch;
            send(k);
            if (shift && mode === 'alpha') setShift(false);
        },
        [mode, shift, send],
    );

    const press = (key: string) => (e: React.PointerEvent) => {
        e.preventDefault();
        send(key);
    };
    const raw = (key: string) => (e: React.PointerEvent) => {
        e.preventDefault();
        onKey(key);
    };

    //   Special key strip (always visible, top of keyboard)
    const specialStrip: { label: string; cls?: string; action: (e: React.PointerEvent) => void }[] =
        [
            {
                label: ctrl ? '✦Ctrl' : 'Ctrl',
                cls: ctrl ? 'vk-key-active' : 'vk-key-action',
                action: (e) => {
                    e.preventDefault();
                    setCtrl((v) => !v);
                },
            },
            {
                label: alt ? '✦Alt' : 'Alt',
                cls: alt ? 'vk-key-active' : 'vk-key-action',
                action: (e) => {
                    e.preventDefault();
                    setAlt((v) => !v);
                },
            },
            { label: 'Esc', cls: 'vk-key-action', action: press('\x1b') },
            { label: 'Tab', cls: 'vk-key-action', action: press('\t') },
            { label: '←', action: raw('\x1b[D') },
            { label: '↑', action: raw('\x1b[A') },
            { label: '↓', action: raw('\x1b[B') },
            { label: '→', action: raw('\x1b[C') },
            { label: 'Del', cls: 'vk-key-action', action: raw('\x1b[3~') },
            { label: '⌫', cls: 'vk-key-action', action: raw('\x7f') },
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
                        onPointerDown={k.action}
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
                                {shift ? c.toUpperCase() : c}
                            </button>
                        ))}
                        <button
                            className="vk-key vk-key-action"
                            style={{ flex: 1.4 }}
                            onPointerDown={raw('\x7f')}
                        >
                            ⌫
                        </button>
                    </div>
                    {/* Row 2 */}
                    <div className="flex gap-[3px]">
                        <div style={{ flex: 0.5 }} />
                        {alphaRow2.map((c) => (
                            <button key={c} className="vk-key flex-1" onPointerDown={sendChar(c)}>
                                {shift ? c.toUpperCase() : c}
                            </button>
                        ))}
                        <button
                            className="vk-key vk-key-action"
                            style={{ flex: 1.9 }}
                            onPointerDown={raw('\r')}
                        >
                            ↵
                        </button>
                    </div>
                    {/* Row 3 */}
                    <div className="flex gap-[3px]">
                        <button
                            className={`vk-key vk-key-action ${shift ? 'vk-key-active' : ''}`}
                            style={{ flex: 1.5 }}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                setShift((v) => !v);
                            }}
                        >
                            ⇧
                        </button>
                        {alphaRow3.map((c) => (
                            <button key={c} className="vk-key flex-1" onPointerDown={sendChar(c)}>
                                {shift && c.match(/[a-z]/) ? c.toUpperCase() : c}
                            </button>
                        ))}
                        <button
                            className={`vk-key vk-key-action ${shift ? 'vk-key-active' : ''}`}
                            style={{ flex: 1.5 }}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                setShift((v) => !v);
                            }}
                        >
                            ⇧
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
                            onPointerDown={raw('\x7f')}
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
                            className="vk-key vk-key-action"
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
                    <div className="flex gap-[3px] overflow-x-auto no-scrollbar">
                        {fnKeys.map((k) => (
                            <button
                                key={k.l}
                                className="vk-key shrink-0 min-w-[40px]"
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
                                onPointerDown={raw(k.k)}
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
                    className="vk-key vk-key-action"
                    style={{ flex: 1.4 }}
                    onPointerDown={raw('\r')}
                >
                    ↵
                </button>
            </div>
        </div>
    );
}
