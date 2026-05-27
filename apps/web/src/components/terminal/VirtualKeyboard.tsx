'use client';

import { useState, useCallback } from 'react';

interface VirtualKeyboardProps {
    onKey: (key: string) => void;
    onModifier?: (modifier: 'ctrl' | 'alt' | 'shift', active: boolean) => void;
}

const NAV_KEYS = [
    { label: 'Esc',  key: '\x1b'    },
    { label: 'Tab',  key: '\t'      },
    { label: '↑',    key: '\x1b[A'  },
    { label: '↓',    key: '\x1b[B'  },
    { label: '←',    key: '\x1b[D'  },
    { label: '→',    key: '\x1b[C'  },
    { label: 'Home', key: '\x1b[H'  },
    { label: 'End',  key: '\x1b[F'  },
    { label: 'Del',  key: '\x1b[3~' },
    { label: 'PgUp', key: '\x1b[5~' },
    { label: 'PgDn', key: '\x1b[6~' },
];

const FN_KEYS = [
    { label: 'F1',  key: '\x1bOP'   },
    { label: 'F2',  key: '\x1bOQ'   },
    { label: 'F3',  key: '\x1bOR'   },
    { label: 'F4',  key: '\x1bOS'   },
    { label: 'F5',  key: '\x1b[15~' },
    { label: 'F6',  key: '\x1b[17~' },
    { label: 'F7',  key: '\x1b[18~' },
    { label: 'F8',  key: '\x1b[19~' },
    { label: 'F9',  key: '\x1b[20~' },
    { label: 'F10', key: '\x1b[21~' },
    { label: 'F11', key: '\x1b[23~' },
    { label: 'F12', key: '\x1b[24~' },
];

export default function VirtualKeyboard({ onKey, onModifier }: VirtualKeyboardProps) {
    const [ctrl,   setCtrl]   = useState(false);
    const [alt,    setAlt]    = useState(false);
    const [shift,  setShift]  = useState(false);
    const [showFn, setShowFn] = useState(false);

    const fire = useCallback((key: string) => {
        let k = key;
        if (ctrl && k.length === 1) {
            const code = k.toUpperCase().charCodeAt(0);
            if (code >= 65 && code <= 90) k = String.fromCharCode(code - 64);
        }
        if (alt)              k = '\x1b' + k;
        if (shift && k.length === 1 && !ctrl && !alt) k = k.toUpperCase();

        onKey(k);

        if (ctrl)  { setCtrl(false);  onModifier?.('ctrl',  false); }
        if (alt)   { setAlt(false);   onModifier?.('alt',   false); }
        if (shift) { setShift(false); onModifier?.('shift', false); }
    }, [ctrl, alt, shift, onKey, onModifier]);

    // onPointerDown + preventDefault prevents double-fire on touch and keeps focus on terminal
    const pressKey  = (key: string)                     => (e: React.PointerEvent) => { e.preventDefault(); fire(key); };
    const pressCtrl = (key: string)                     => (e: React.PointerEvent) => { e.preventDefault(); onKey(key); };
    const toggleMod = (mod: 'ctrl' | 'alt' | 'shift')  => (e: React.PointerEvent) => {
        e.preventDefault();
        if (mod === 'ctrl')  { const n = !ctrl;  setCtrl(n);  onModifier?.('ctrl',  n); }
        if (mod === 'alt')   { const n = !alt;   setAlt(n);   onModifier?.('alt',   n); }
        if (mod === 'shift') { const n = !shift; setShift(n); onModifier?.('shift', n); }
    };

    return (
        <div className="virtual-keyboard">
            <div className="flex flex-col gap-1.5">

                {/* Fn row — only when toggled */}
                {showFn && (
                    <div className="flex gap-1 overflow-x-auto no-scrollbar">
                        {FN_KEYS.map((k) => (
                            <button key={k.label} className="virtual-key shrink-0 min-w-[36px]" onPointerDown={pressKey(k.key)}>
                                {k.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Row 1: navigation keys — flex-1 so they fill width evenly, no scroll */}
                <div className="flex gap-1">
                    {NAV_KEYS.map((k) => (
                        <button key={k.label} className="virtual-key flex-1 min-w-0" onPointerDown={pressKey(k.key)}>
                            {k.label}
                        </button>
                    ))}
                </div>

                {/* Row 2: modifiers + ctrl combos + Fn toggle */}
                <div className="flex gap-1">
                    <button
                        className={`virtual-key virtual-key-modifier flex-1 min-w-0 ${ctrl  ? 'virtual-key-active' : ''}`}
                        onPointerDown={toggleMod('ctrl')}
                    >Ctrl</button>
                    <button
                        className={`virtual-key virtual-key-modifier flex-1 min-w-0 ${alt   ? 'virtual-key-active' : ''}`}
                        onPointerDown={toggleMod('alt')}
                    >Alt</button>
                    <button
                        className={`virtual-key virtual-key-modifier flex-1 min-w-0 ${shift ? 'virtual-key-active' : ''}`}
                        onPointerDown={toggleMod('shift')}
                    >Shift</button>

                    <div className="w-px bg-slate-600/60 mx-0.5 self-stretch" />

                    <button className="virtual-key flex-1 min-w-0 text-red-400"   onPointerDown={pressCtrl('\x03')}>^C</button>
                    <button className="virtual-key flex-1 min-w-0 text-amber-400" onPointerDown={pressCtrl('\x04')}>^D</button>
                    <button className="virtual-key flex-1 min-w-0 text-slate-400" onPointerDown={pressCtrl('\x1a')}>^Z</button>

                    <div className="w-px bg-slate-600/60 mx-0.5 self-stretch" />

                    <button
                        className={`virtual-key flex-1 min-w-0 ${showFn ? 'virtual-key-active' : ''}`}
                        onPointerDown={(e) => { e.preventDefault(); setShowFn(v => !v); }}
                    >Fn</button>
                </div>
            </div>
        </div>
    );
}
