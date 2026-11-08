'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import {
    ACCENTS,
    CURSOR_STYLES,
    DEFAULT_APPEARANCE,
    FONT_SIZE,
    LINE_HEIGHT,
    TERMINAL_FONTS,
    TERMINAL_SCHEMES,
    type Appearance,
} from '@/lib/appearance/prefs';
import { replaceAppearance, setAppearance, useAppearance } from '@/lib/appearance/store';
import {
    ACCENT_COLORS,
    SCHEMES,
    TERMINAL_FONT_OPTIONS,
    concreteScheme,
} from '@/lib/appearance/terminal-themes';
import { bundledMonoFamily, fontInstalled } from '@/lib/appearance/useTerminalLook';
import { useResolvedTheme } from '@/lib/appearance/store';
import { MenuArranger } from './MenuArranger';

/* ---------------------------------------------------------------------------
 * Building blocks
 * ------------------------------------------------------------------------- */

interface Option<T extends string> {
    value: T;
    label: string;
    hint?: string;
    visual?: ReactNode;
    disabled?: boolean;
}

/**
 * A row of choices backed by real radio buttons, so arrow keys, Tab and
 * screen readers work as everywhere else.
 */
function Choices<T extends string>({
    legend,
    description,
    value,
    options,
    onChange,
    columns = 3,
    disabled,
}: {
    legend: string;
    description?: string;
    value: T;
    options: Option<T>[];
    onChange: (v: T) => void;
    columns?: 2 | 3 | 4 | 6;
    disabled?: boolean;
}) {
    const name = useId();
    const cols = {
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-2 sm:grid-cols-4',
        6: 'grid-cols-3 sm:grid-cols-6',
    }[columns];
    return (
        <fieldset className={`min-w-0 ${disabled ? 'opacity-50' : ''}`} disabled={disabled}>
            <legend className="text-sm font-medium">{legend}</legend>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            <div className={`mt-2.5 grid gap-2 ${cols}`}>
                {options.map((o) => {
                    const checked = o.value === value;
                    return (
                        <label
                            key={o.value}
                            className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-[var(--radius-card)] border p-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                                checked
                                    ? 'border-primary bg-primary/[0.06]'
                                    : 'border-border hover:border-muted-foreground/40'
                            } ${o.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                            <input
                                type="radio"
                                name={name}
                                value={o.value}
                                checked={checked}
                                disabled={o.disabled || disabled}
                                onChange={() => onChange(o.value)}
                                className="sr-only"
                            />
                            {o.visual}
                            <span className="flex items-baseline justify-between gap-1">
                                <span
                                    className={`text-xs ${checked ? 'font-semibold text-foreground' : 'text-foreground/90'}`}
                                >
                                    {o.label}
                                </span>
                            </span>
                            {o.hint && (
                                <span className="-mt-1 text-[11px] leading-snug text-muted-foreground">
                                    {o.hint}
                                </span>
                            )}
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

/** A tiny schematic: a frame with boxes placed in percent. */
function Sketch({ boxes }: { boxes: [number, number, number, number, 'nav' | 'pane' | 'item'][] }) {
    return (
        <span
            aria-hidden
            className="relative block h-16 w-full overflow-hidden rounded-[5px] border border-border bg-background"
        >
            {boxes.map(([l, t, w, h, kind], i) => (
                <span
                    key={i}
                    className={`absolute rounded-[2px] ${
                        kind === 'nav'
                            ? 'bg-muted-foreground/25'
                            : kind === 'item'
                              ? 'bg-primary/70'
                              : 'bg-[var(--terminal-bg)] ring-1 ring-border'
                    }`}
                    style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` }}
                />
            ))}
        </span>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-6 border-t border-border pt-8 first:border-t-0 first:pt-0">
            <h3 className="text-lg font-semibold tracking-[-0.015em]">{title}</h3>
            {children}
        </section>
    );
}

function Range({
    label,
    value,
    min,
    max,
    step,
    format,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    onChange: (v: number) => void;
}) {
    const id = useId();
    return (
        <div>
            <div className="flex items-baseline justify-between">
                <label htmlFor={id} className="text-sm font-medium">
                    {label}
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">{format(value)}</span>
            </div>
            <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--primary)]"
            />
        </div>
    );
}

function Toggle({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    const id = useId();
    return (
        <div className="flex items-start justify-between gap-4">
            <div>
                <label htmlFor={id} className="text-sm font-medium">
                    {label}
                </label>
                <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </div>
    );
}

/* ---------------------------------------------------------------------------
 * Option visuals
 * ------------------------------------------------------------------------- */

/** The theme drawn in its own colours (scoped tokens), with the user's accent. */
function ThemeSwatch({ theme, accent }: { theme: 'night' | 'black' | 'day'; accent: string }) {
    return (
        <span
            aria-hidden
            data-theme={theme}
            data-accent={accent}
            className="flex aspect-[16/10] w-full overflow-hidden rounded-[5px] border border-border bg-background"
        >
            <span className="flex w-1/4 flex-col gap-[3px] bg-card p-1">
                <span className="h-[3px] w-full rounded-full bg-primary" />
                <span className="h-[3px] w-3/4 rounded-full bg-muted-foreground/50" />
                <span className="h-[3px] w-3/4 rounded-full bg-muted-foreground/50" />
            </span>
            <span className="flex flex-1 flex-col gap-1 p-1.5">
                <span className="h-[3px] w-1/2 rounded-full bg-foreground/80" />
                <span className="flex-1 rounded-[3px] border border-border bg-card" />
            </span>
        </span>
    );
}

function SystemSwatch({ accent }: { accent: string }) {
    return (
        <span
            aria-hidden
            className="relative flex aspect-[16/10] w-full overflow-hidden rounded-[5px] border border-border"
        >
            <span className="w-1/2 overflow-hidden">
                <span className="block w-[200%]">
                    <ThemeSwatch theme="night" accent={accent} />
                </span>
            </span>
            <span className="relative w-1/2 overflow-hidden">
                <span className="absolute right-0 block w-[200%]">
                    <ThemeSwatch theme="day" accent={accent} />
                </span>
            </span>
        </span>
    );
}

function SchemeSwatch({ scheme }: { scheme: keyof typeof SCHEMES }) {
    const p = SCHEMES[scheme].palette;
    return (
        <span
            aria-hidden
            className="flex aspect-[16/10] w-full flex-col justify-between overflow-hidden rounded-[5px] border border-border p-1.5"
            style={{ background: p.background }}
        >
            <span className="h-[3px] w-2/3 rounded-full" style={{ background: p.foreground }} />
            <span className="flex gap-[3px]">
                {[p.red, p.green, p.yellow, p.blue, p.magenta, p.cyan].map((c, i) => (
                    <span key={i} className="h-2 flex-1 rounded-[2px]" style={{ background: c }} />
                ))}
            </span>
        </span>
    );
}

/* ---------------------------------------------------------------------------
 * The editor
 * ------------------------------------------------------------------------- */

/**
 * Every look and layout choice, applied as it is picked. Used by the
 * first-run setup and by Settings → Appearance.
 */
export function AppearanceEditor() {
    const a = useAppearance();
    const app = useResolvedTheme();
    const set = setAppearance;
    const [installed, setInstalled] = useState<Record<string, boolean>>({});
    const [mono, setMono] = useState('');
    useEffect(() => {
        setMono(bundledMonoFamily());
        const found: Record<string, boolean> = {};
        for (const f of TERMINAL_FONTS) {
            const o = TERMINAL_FONT_OPTIONS[f];
            found[f] = o.bundled || fontInstalled(o.probe ?? o.label);
        }
        setInstalled(found);
    }, []);

    const isDefault = JSON.stringify(a) === JSON.stringify(DEFAULT_APPEARANCE);

    return (
        <div className="space-y-6">
            <Section title="Look">
                <Choices
                    legend="Theme"
                    value={a.theme}
                    columns={4}
                    onChange={(theme) => set({ theme })}
                    options={[
                        {
                            value: 'night',
                            label: 'Night',
                            visual: <ThemeSwatch theme="night" accent={a.accent} />,
                        },
                        {
                            value: 'black',
                            label: 'Black',
                            hint: 'Best on OLED screens',
                            visual: <ThemeSwatch theme="black" accent={a.accent} />,
                        },
                        {
                            value: 'day',
                            label: 'Day',
                            visual: <ThemeSwatch theme="day" accent={a.accent} />,
                        },
                        {
                            value: 'system',
                            label: 'Match system',
                            hint: 'Night or Day, as your device is set',
                            visual: <SystemSwatch accent={a.accent} />,
                        },
                    ]}
                />
                <fieldset>
                    <legend className="text-sm font-medium">Accent colour</legend>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Buttons, the selected item and the terminal cursor.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                        {ACCENTS.map((acc) => {
                            const checked = a.accent === acc;
                            const c = ACCENT_COLORS[acc];
                            return (
                                <label
                                    key={acc}
                                    title={c.label}
                                    className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                                        checked
                                            ? 'border-primary bg-primary/[0.06] font-semibold'
                                            : 'border-border hover:border-muted-foreground/40'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="accent"
                                        value={acc}
                                        checked={checked}
                                        onChange={() => set({ accent: acc })}
                                        className="sr-only"
                                    />
                                    <span
                                        aria-hidden
                                        className="h-5 w-5 rounded-full"
                                        style={{ background: app === 'day' ? c.light : c.dark }}
                                    />
                                    {c.label}
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
                <Choices
                    legend="Density"
                    value={a.density}
                    columns={2}
                    onChange={(density) => set({ density })}
                    options={[
                        {
                            value: 'comfortable',
                            label: 'Comfortable',
                            hint: 'Roomier, easier to tap',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [8, 12, 84, 18, 'nav'],
                                        [8, 41, 84, 18, 'nav'],
                                        [8, 70, 84, 18, 'nav'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'compact',
                            label: 'Compact',
                            hint: 'More on screen at once',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [8, 8, 84, 13, 'nav'],
                                        [8, 26, 84, 13, 'nav'],
                                        [8, 44, 84, 13, 'nav'],
                                        [8, 62, 84, 13, 'nav'],
                                        [8, 80, 84, 13, 'nav'],
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
                <Toggle
                    label="Reduce motion"
                    description="Turn off animations and the blinking cursor. Termi already does this when your device asks for less motion."
                    checked={a.motion === 'reduced'}
                    onChange={(v) => set({ motion: v ? 'reduced' : 'full' })}
                />
            </Section>

            <Section title="Layout">
                <Choices
                    legend="Menu"
                    value={a.nav}
                    onChange={(nav) => set({ nav })}
                    options={[
                        {
                            value: 'sidebar',
                            label: 'Sidebar',
                            hint: 'Names and icons',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [0, 0, 30, 100, 'nav'],
                                        [6, 14, 18, 8, 'item'],
                                        [36, 10, 58, 80, 'pane'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'rail',
                            label: 'Icon rail',
                            hint: 'Icons only, more room',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [0, 0, 11, 100, 'nav'],
                                        [3, 14, 5, 8, 'item'],
                                        [17, 10, 77, 80, 'pane'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'topbar',
                            label: 'Top bar',
                            hint: 'Full width for terminals',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [0, 0, 100, 16, 'nav'],
                                        [22, 5, 14, 6, 'item'],
                                        [6, 26, 88, 66, 'pane'],
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
                <Choices
                    legend="Menu side"
                    value={a.navSide}
                    columns={2}
                    disabled={a.nav === 'topbar'}
                    onChange={(navSide) => set({ navSide })}
                    options={[
                        {
                            value: 'left',
                            label: 'Left',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [0, 0, 22, 100, 'nav'],
                                        [28, 10, 66, 80, 'pane'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'right',
                            label: 'Right',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [78, 0, 22, 100, 'nav'],
                                        [6, 10, 66, 80, 'pane'],
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
                <MenuArranger />
                <Choices
                    legend="Open sessions as"
                    value={a.sessionList}
                    columns={2}
                    onChange={(sessionList) => set({ sessionList })}
                    options={[
                        {
                            value: 'tabs',
                            label: 'Tabs',
                            hint: 'A row across the top',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 6, 20, 12, 'item'],
                                        [26, 6, 20, 12, 'nav'],
                                        [48, 6, 20, 12, 'nav'],
                                        [4, 24, 92, 70, 'pane'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'side',
                            label: 'A list',
                            hint: 'Down the side, with search',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 8, 24, 12, 'item'],
                                        [4, 26, 24, 12, 'nav'],
                                        [4, 44, 24, 12, 'nav'],
                                        [34, 8, 62, 84, 'pane'],
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
                <Choices
                    legend="New connections"
                    description="When a terminal is already open."
                    value={a.openIn}
                    columns={2}
                    onChange={(openIn) => set({ openIn })}
                    options={[
                        {
                            value: 'tab',
                            label: 'Open in a new tab',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 6, 20, 12, 'nav'],
                                        [26, 6, 20, 12, 'item'],
                                        [4, 24, 92, 70, 'pane'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'split',
                            label: 'Open beside it',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 8, 45, 84, 'pane'],
                                        [51, 8, 45, 84, 'pane'],
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
                <Choices
                    legend="Split screen"
                    description="How terminals share the screen when you split it."
                    value={a.splitShape}
                    onChange={(splitShape) => set({ splitShape })}
                    options={[
                        {
                            value: 'columns',
                            label: 'Side by side',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 8, 45, 84, 'pane'],
                                        [51, 8, 45, 84, 'pane'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'rows',
                            label: 'Stacked',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 6, 92, 42, 'pane'],
                                        [4, 52, 92, 42, 'pane'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'grid',
                            label: 'Grid',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 6, 45, 88, 'pane'],
                                        [51, 6, 45, 42, 'pane'],
                                        [51, 52, 45, 42, 'pane'],
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
                <Choices
                    legend="Servers page"
                    value={a.serverView}
                    columns={2}
                    onChange={(serverView) => set({ serverView })}
                    options={[
                        {
                            value: 'grid',
                            label: 'Cards',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 8, 28, 38, 'nav'],
                                        [36, 8, 28, 38, 'nav'],
                                        [68, 8, 28, 38, 'nav'],
                                        [4, 54, 28, 38, 'nav'],
                                        [36, 54, 28, 38, 'nav'],
                                    ]}
                                />
                            ),
                        },
                        {
                            value: 'list',
                            label: 'List',
                            visual: (
                                <Sketch
                                    boxes={[
                                        [4, 8, 92, 14, 'nav'],
                                        [4, 28, 92, 14, 'nav'],
                                        [4, 48, 92, 14, 'nav'],
                                        [4, 68, 92, 14, 'nav'],
                                    ]}
                                />
                            ),
                        },
                    ]}
                />
                <Choices
                    legend="Start on"
                    description="What you see after signing in."
                    value={a.startPage}
                    columns={2}
                    onChange={(startPage) => set({ startPage })}
                    options={[
                        { value: 'servers', label: 'Servers', hint: 'Your server list' },
                        { value: 'sessions', label: 'Connections', hint: 'Your open terminals' },
                    ]}
                />
            </Section>

            <Section title="Terminal">
                <Choices
                    legend="Colours"
                    value={a.terminal.scheme}
                    columns={4}
                    onChange={(scheme) => set({ terminal: { scheme } })}
                    options={TERMINAL_SCHEMES.map((s) => ({
                        value: s,
                        label: s === 'auto' ? 'Match the app' : SCHEMES[s].label,
                        visual: <SchemeSwatch scheme={concreteScheme(s, app)} />,
                    }))}
                />
                <fieldset>
                    <legend className="text-sm font-medium">Font</legend>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        JetBrains Mono comes with Termi. The others need to be installed on this
                        device.
                    </p>
                    <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {TERMINAL_FONTS.map((f) => {
                            const o = TERMINAL_FONT_OPTIONS[f];
                            const checked = a.terminal.font === f;
                            const missing = installed[f] === false;
                            const family = f === 'jetbrains' ? `${mono}, monospace` : o.stack;
                            return (
                                <label
                                    key={f}
                                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 py-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
                                        checked
                                            ? 'border-primary bg-primary/[0.06]'
                                            : 'border-border hover:border-muted-foreground/40'
                                    } ${missing ? 'cursor-not-allowed opacity-50' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="terminal-font"
                                        value={f}
                                        checked={checked}
                                        disabled={missing}
                                        onChange={() => set({ terminal: { font: f } })}
                                        className="sr-only"
                                    />
                                    <span className={`text-xs ${checked ? 'font-semibold' : ''}`}>
                                        {o.label}
                                        {missing && (
                                            <span className="ml-1.5 font-normal text-muted-foreground">
                                                not installed
                                            </span>
                                        )}
                                    </span>
                                    <span
                                        aria-hidden
                                        className="truncate text-[13px] text-muted-foreground"
                                        style={{ fontFamily: family }}
                                    >
                                        {'ls -la ~ {}=>'}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
                <div className="grid gap-5 sm:grid-cols-2">
                    <Range
                        label="Text size"
                        value={a.terminal.fontSize}
                        min={FONT_SIZE.min}
                        max={FONT_SIZE.max}
                        step={1}
                        format={(v) => `${v} px`}
                        onChange={(fontSize) => set({ terminal: { fontSize } })}
                    />
                    <Range
                        label="Line spacing"
                        value={a.terminal.lineHeight}
                        min={LINE_HEIGHT.min}
                        max={LINE_HEIGHT.max}
                        step={0.1}
                        format={(v) => v.toFixed(1)}
                        onChange={(lineHeight) => set({ terminal: { lineHeight } })}
                    />
                </div>
                <Choices
                    legend="Cursor"
                    value={a.terminal.cursor}
                    onChange={(cursor) => set({ terminal: { cursor } })}
                    options={CURSOR_STYLES.map((c) => ({
                        value: c,
                        label: { block: 'Block', bar: 'Bar', underline: 'Underline' }[c],
                        visual: (
                            <span
                                aria-hidden
                                className="flex h-8 items-center justify-center rounded-[5px] bg-[var(--terminal-bg)] font-mono text-[13px] text-muted-foreground ring-1 ring-border"
                            >
                                $&nbsp;
                                <span
                                    className="inline-block bg-primary"
                                    style={
                                        c === 'block'
                                            ? { width: 8, height: 15 }
                                            : c === 'bar'
                                              ? { width: 2, height: 15 }
                                              : { width: 8, height: 2, marginTop: 13 }
                                    }
                                />
                            </span>
                        ),
                    }))}
                />
                <Toggle
                    label="Blinking cursor"
                    description="Off keeps the cursor steady."
                    checked={a.terminal.blink}
                    onChange={(blink) => set({ terminal: { blink } })}
                />
            </Section>

            <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
                <p className="text-xs text-muted-foreground">
                    Saved to your account, so it follows you to every device.
                </p>
                <button
                    type="button"
                    disabled={isDefault}
                    onClick={() => replaceAppearance(DEFAULT_APPEARANCE as Appearance)}
                    className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
                >
                    Back to defaults
                </button>
            </div>
        </div>
    );
}
