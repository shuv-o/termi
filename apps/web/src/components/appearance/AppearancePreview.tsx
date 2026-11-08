'use client';

import type { CSSProperties } from 'react';
import type { Appearance } from '@/lib/appearance/prefs';
import { useResolvedTheme } from '@/lib/appearance/store';
import { useXtermLook } from '@/lib/appearance/useTerminalLook';
import type { TerminalPalette } from '@/lib/appearance/terminal-themes';
import { NAV_ITEMS, itemAvailable } from '@/app/panel/_shell/navigation';

/** One terminal pane, drawn with the chosen scheme, font and cursor. */
function PreviewPane({
    host,
    lines,
    palette,
    cursor,
    look,
    blink,
}: {
    host: string;
    lines: { text: string; color?: keyof TerminalPalette }[];
    palette: TerminalPalette;
    cursor: string;
    look: { fontFamily: string; fontSize: number; lineHeight: number; cursorStyle: string };
    blink: boolean;
}) {
    // The preview is about a third of real size; keep the ratio between sizes.
    const size = Math.max(7, look.fontSize * 0.62);
    const cursorShape: CSSProperties =
        look.cursorStyle === 'bar'
            ? { width: 1.5, height: '1.05em' }
            : look.cursorStyle === 'underline'
              ? { width: '0.6em', height: 1.5, alignSelf: 'flex-end' }
              : { width: '0.6em', height: '1.05em' };
    return (
        <div
            className="h-full min-h-0 overflow-hidden rounded-[5px] px-2 py-1.5"
            style={{
                background: palette.background,
                color: palette.foreground,
                fontFamily: look.fontFamily,
                fontSize: size,
                lineHeight: look.lineHeight,
            }}
        >
            {lines.map((l, i) => (
                <div
                    key={i}
                    className="truncate"
                    style={l.color ? { color: palette[l.color] } : undefined}
                >
                    {l.text}
                </div>
            ))}
            <div className="flex items-center whitespace-pre">
                <span style={{ color: palette.green }}>root@{host}</span>
                <span style={{ color: palette.blue }}>:~#&nbsp;</span>
                <span
                    aria-hidden
                    className={blink ? 'cursor-block' : undefined}
                    style={{ ...cursorShape, background: cursor, display: 'inline-block' }}
                />
            </div>
        </div>
    );
}

/**
 * A miniature Termi drawn with the user's current choices — menu, session
 * tabs, split, terminal colours and font — so every option shows what it
 * does before anyone has to go looking for it.
 */
export function AppearancePreview({ appearance: a }: { appearance: Appearance }) {
    const look = useXtermLook();
    const app = useResolvedTheme();
    const palette = look.theme;

    const panes: { host: string; lines: { text: string; color?: keyof TerminalPalette }[] }[] = [
        {
            host: 'web-1',
            lines: [
                { text: 'root@web-1:~# systemctl status nginx' },
                { text: '● nginx.service — active (running)', color: 'green' },
                { text: 'root@web-1:~# df -h /' },
                { text: '/dev/sda1   40G   33G   82% /', color: 'yellow' },
            ],
        },
        {
            host: 'db-1',
            lines: [
                { text: 'root@db-1:~# uptime' },
                { text: ' up 41 days,  load average: 0.08', color: 'cyan' },
            ],
        },
        {
            host: 'cache-1',
            lines: [{ text: 'root@cache-1:~# redis-cli ping' }, { text: 'PONG', color: 'magenta' }],
        },
    ];
    const split = a.openIn === 'split';
    const shown = split ? panes.slice(0, a.splitShape === 'grid' ? 3 : 2) : panes.slice(0, 1);
    const grid =
        !split || shown.length === 1
            ? 'grid-cols-1'
            : a.splitShape === 'columns'
              ? 'grid-cols-2'
              : a.splitShape === 'rows'
                ? 'grid-rows-2'
                : 'grid-cols-2 grid-rows-2';

    const right = a.navSide === 'right';
    // The user's own menu, in their order; Connections is the open page.
    const NAV = a.menu.order
        .filter((id) => !a.menu.hidden.includes(id))
        .map((id) => ({ ...NAV_ITEMS[id], active: id === 'connections' }))
        .filter((item) =>
            itemAvailable(item, {
                isElectron: typeof window !== 'undefined' && !!window.electronAPI?.isElectron,
            }),
        );
    const navBlock =
        a.nav === 'topbar' ? null : (
            <div
                className={`flex shrink-0 flex-col gap-0.5 bg-card p-1.5 ${right ? 'border-l' : 'border-r'} border-border ${a.nav === 'rail' ? 'w-8 items-center' : 'w-[5.5rem]'}`}
            >
                <div
                    className={`mb-1.5 h-2.5 rounded-[2px] bg-foreground/80 ${a.nav === 'rail' ? 'w-2.5' : 'w-10'}`}
                />
                {NAV.map((n) => (
                    <div
                        key={n.name}
                        className={`flex h-4 items-center gap-1 rounded-[3px] px-1 text-[7px] ${n.active ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                    >
                        <n.icon
                            className={`h-2.5 w-2.5 shrink-0 ${n.active ? 'text-primary' : ''}`}
                        />
                        {a.nav === 'sidebar' && <span className="truncate">{n.name}</span>}
                    </div>
                ))}
            </div>
        );

    return (
        <figure
            aria-label="Preview of your choices"
            className="overflow-hidden rounded-[var(--radius-sheet)] border border-border bg-background shadow-lg"
        >
            {/* Window title bar */}
            <div className="flex h-6 items-center gap-1 border-b border-border bg-card px-2">
                {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                ))}
                <span className="ml-2 text-[8px] text-muted-foreground">termi</span>
            </div>
            {a.nav === 'topbar' && (
                <div className="flex h-6 items-center gap-1 border-b border-border bg-card px-2">
                    <span className="mr-1 h-2.5 w-2.5 rounded-[2px] bg-foreground/80" />
                    {NAV.map((n) => (
                        <span
                            key={n.name}
                            className={`flex h-4 items-center gap-0.5 rounded-[3px] px-1 text-[7px] ${n.active ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                        >
                            <n.icon className={`h-2.5 w-2.5 ${n.active ? 'text-primary' : ''}`} />
                            {n.name}
                        </span>
                    ))}
                </div>
            )}
            <div className={`flex h-48 sm:h-56 ${right ? 'flex-row-reverse' : ''}`}>
                {navBlock}
                <div className="flex min-w-0 flex-1 flex-col">
                    {a.sessionList === 'tabs' ? (
                        <div className="flex h-5 shrink-0 items-end gap-0.5 border-b border-border px-1.5">
                            {shown.concat(split ? [] : panes.slice(1, 2)).map((p, i) => (
                                <span
                                    key={p.host}
                                    className={`rounded-t-[3px] px-1.5 py-0.5 text-[7px] ${i === 0 ? 'bg-card text-foreground' : 'text-muted-foreground'}`}
                                >
                                    {p.host}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    <div className="flex min-h-0 flex-1">
                        {a.sessionList === 'side' && (
                            <div className="w-14 shrink-0 space-y-0.5 border-r border-border bg-card/60 p-1">
                                {panes.map((p, i) => (
                                    <div
                                        key={p.host}
                                        className={`flex items-center gap-1 rounded-[3px] px-1 py-0.5 text-[7px] ${i === 0 ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                                    >
                                        <span className="h-1 w-1 rounded-full bg-success" />
                                        {p.host}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className={`grid min-w-0 flex-1 gap-1 p-1 ${grid}`}>
                            {shown.map((p, i) => (
                                <div
                                    key={p.host}
                                    className={
                                        a.splitShape === 'grid' && split && i === 0
                                            ? 'row-span-2 min-h-0'
                                            : 'min-h-0'
                                    }
                                >
                                    <PreviewPane
                                        host={p.host}
                                        lines={p.lines}
                                        palette={palette}
                                        cursor={palette.cursor}
                                        look={look}
                                        blink={look.cursorBlink && a.motion === 'full'}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <figcaption className="sr-only">
                {`${app === 'day' ? 'Light' : 'Dark'} theme, ${a.nav} menu on the ${a.navSide}, ${a.openIn === 'split' ? `${a.splitShape} split` : 'one terminal at a time'}`}
            </figcaption>
        </figure>
    );
}
