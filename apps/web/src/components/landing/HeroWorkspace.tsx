'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { FileText, Folder, Upload } from 'lucide-react';

/**
 * The landing page's hero: a Termi workspace the visitor can switch between
 * a terminal, the file browser, a remote desktop and split panes.
 */

type View = 'terminal' | 'files' | 'desktop' | 'split';

const VIEWS: { id: View; label: string; host: string; dot: string; caption: string }[] = [
    {
        id: 'terminal',
        label: 'Terminal',
        host: 'web-01',
        dot: 'bg-proto-ssh',
        caption: 'SSH with suggestions from your own history. Press → to accept.',
    },
    {
        id: 'files',
        label: 'Files',
        host: 'web-01',
        dot: 'bg-proto-scp',
        caption: 'Browse, upload and rename over SFTP, next to the terminal.',
    },
    {
        id: 'desktop',
        label: 'Desktop',
        host: 'win-build',
        dot: 'bg-proto-rdp',
        caption: 'Windows over RDP and Linux over VNC, in the same tab strip.',
    },
    {
        id: 'split',
        label: 'Split',
        host: 'web-01 + web-02',
        dot: 'bg-proto-ssh',
        caption: 'Up to four panes side by side, typing into all of them at once if you like.',
    },
];

export default function HeroWorkspace() {
    const [view, setView] = useState<View>('terminal');
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);
    const current = VIEWS.find((v) => v.id === view)!;

    const onKey = (e: KeyboardEvent, i: number) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = (i + step + VIEWS.length) % VIEWS.length;
        setView(VIEWS[next].id);
        tabs.current[next]?.focus();
    };

    return (
        <figure className="min-w-0">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-float)]">
                <div
                    role="tablist"
                    aria-label="Workspace view"
                    className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5"
                >
                    {VIEWS.map((v, i) => {
                        const active = v.id === view;
                        return (
                            <button
                                key={v.id}
                                ref={(el) => {
                                    tabs.current[i] = el;
                                }}
                                role="tab"
                                id={`hero-tab-${v.id}`}
                                aria-selected={active}
                                aria-controls="hero-pane"
                                tabIndex={active ? 0 : -1}
                                onClick={() => setView(v.id)}
                                onKeyDown={(e) => onKey(e, i)}
                                className={`flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                    active
                                        ? 'bg-accent text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
                                {v.label}
                            </button>
                        );
                    })}
                </div>

                <div
                    id="hero-pane"
                    role="tabpanel"
                    aria-labelledby={`hero-tab-${view}`}
                    key={view}
                    className="hero-pane h-[300px] overflow-hidden bg-[var(--terminal-bg)] sm:h-[320px]"
                >
                    {view === 'terminal' && <TerminalView />}
                    {view === 'files' && <FilesView />}
                    {view === 'desktop' && <DesktopView />}
                    {view === 'split' && <SplitView />}
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    <span className="data truncate">{current.host}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        Host key verified
                    </span>
                </div>
            </div>
            <figcaption className="mt-3 min-h-[2.5em] text-sm text-muted-foreground">
                {current.caption}
            </figcaption>
        </figure>
    );
}

function Prompt({ host = 'web-01' }: { host?: string }) {
    return (
        <>
            <span className="text-proto-ssh">deploy@{host}</span>
            <span className="text-muted-foreground">:~$ </span>
        </>
    );
}

function Cursor() {
    return (
        <span
            aria-hidden
            className="inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-primary"
        />
    );
}

function TerminalView() {
    return (
        <div className="data p-4 text-[12.5px] leading-[1.75] sm:p-5 sm:text-[13px]">
            <p>
                <Prompt />
                <span className="text-foreground">systemctl status nginx</span>
            </p>
            <p className="text-foreground/80">
                <span className="text-success">●</span> nginx.service, a high performance web server
            </p>
            <p className="text-muted-foreground">
                {'   '}Active: <span className="text-success">active (running)</span> for 3 days
            </p>
            <p className="text-muted-foreground">{'   '}Memory: 18.4M</p>
            <p className="mt-2">
                <Prompt />
                <span className="text-foreground">df -h /</span>
            </p>
            <p className="whitespace-pre text-muted-foreground">
                {'Filesystem   Size  Used  Avail  Use%'}
            </p>
            <p className="whitespace-pre text-muted-foreground">
                {'/dev/sda1     80G   31G    46G   '}
                <span className="text-foreground">41%</span>
            </p>
            <p className="mt-2">
                <Prompt />
                <span className="text-foreground">docker comp</span>
                <Cursor />
                <span className="text-muted-foreground/60">ose up -d --build</span>
            </p>
        </div>
    );
}

const FILES = [
    { name: 'releases', dir: true, size: '', when: 'today' },
    { name: 'shared', dir: true, size: '', when: '2 days ago' },
    { name: '.env', dir: false, size: '1.2 KB', when: 'yesterday' },
    { name: 'docker-compose.yml', dir: false, size: '3.4 KB', when: 'yesterday' },
    { name: 'nginx.conf', dir: false, size: '2.1 KB', when: 'last week' },
];

function FilesView() {
    return (
        <div className="flex h-full flex-col text-[13px]">
            <p className="data border-b border-border px-4 py-2 text-xs text-muted-foreground">
                /var/www/app
            </p>
            <ul className="flex-1 divide-y divide-border/60">
                {FILES.map((f) => (
                    <li key={f.name} className="flex items-center gap-3 px-4 py-2">
                        {f.dir ? (
                            <Folder className="h-4 w-4 shrink-0 text-proto-scp" />
                        ) : (
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="data min-w-0 flex-1 truncate text-foreground">
                            {f.name}
                        </span>
                        <span className="data hidden w-16 text-right text-xs text-muted-foreground sm:block">
                            {f.size}
                        </span>
                        <span className="w-20 text-right text-xs text-muted-foreground">
                            {f.when}
                        </span>
                    </li>
                ))}
            </ul>
            <div className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-xs">
                <Upload className="h-3.5 w-3.5 shrink-0 text-proto-scp" />
                <span className="data min-w-0 flex-1 truncate text-foreground">
                    release-2.4.1.tar.gz
                </span>
                <span className="h-1 w-24 overflow-hidden rounded-full bg-border">
                    <span className="block h-full w-[68%] rounded-full bg-proto-scp" />
                </span>
                <span className="w-8 text-right tabular-nums text-muted-foreground">68%</span>
            </div>
        </div>
    );
}

function DesktopView() {
    return (
        <div className="relative h-full overflow-hidden bg-[linear-gradient(160deg,#1b2a44,#2a1f3d)]">
            <div className="absolute left-[8%] top-[10%] w-[64%] overflow-hidden rounded-md border border-white/10 bg-[#1e1e1e] shadow-lg">
                <div className="flex items-center justify-between bg-[#2b2b2b] px-3 py-1.5 text-[11px] text-white/80">
                    <span>Build output</span>
                    <span className="flex gap-2 text-white/50">
                        <span>–</span>
                        <span>□</span>
                        <span>×</span>
                    </span>
                </div>
                <div className="data space-y-0.5 p-3 text-[11px] leading-relaxed text-white/75">
                    <p>Restoring packages…</p>
                    <p>Compiling 214 files</p>
                    <p className="text-success">Build succeeded in 41.2 s</p>
                </div>
            </div>
            <div className="absolute bottom-[22%] right-[7%] w-[38%] rounded-md border border-white/10 bg-white/90 p-3 text-[11px] text-neutral-800 shadow-lg">
                <p className="font-medium">Clipboard synced</p>
                <p className="mt-0.5 text-neutral-600">Copy here, paste on your computer.</p>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-8 items-center gap-2 bg-black/50 px-3">
                <span className="h-4 w-4 rounded-sm bg-proto-rdp/80" />
                <span className="h-4 w-4 rounded-sm bg-white/30" />
                <span className="h-4 w-4 rounded-sm bg-white/30" />
                <span className="ml-auto text-[11px] text-white/70">10:42</span>
            </div>
        </div>
    );
}

function SplitView() {
    return (
        <div className="flex h-full flex-col">
            <p className="border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning">
                Typing in both panes
            </p>
            <div className="grid flex-1 grid-cols-2 divide-x divide-border">
                {['web-01', 'web-02'].map((host) => (
                    <div
                        key={host}
                        className="data overflow-hidden p-3 text-[11.5px] leading-[1.7] sm:p-4 sm:text-[12px]"
                    >
                        <p className="truncate">
                            <Prompt host={host} />
                            <span className="text-foreground">uptime</span>
                        </p>
                        <p className="truncate text-muted-foreground">
                            up {host === 'web-01' ? '41' : '38'} days, load 0.21
                        </p>
                        <p className="mt-1 truncate">
                            <Prompt host={host} />
                            <span className="text-foreground">sudo apt update</span>
                        </p>
                        <p className="truncate text-muted-foreground">
                            {host === 'web-01' ? '14' : '9'} packages can be upgraded
                        </p>
                        <p className="mt-1 truncate">
                            <Prompt host={host} />
                            <span className="text-foreground">sudo apt upgrade</span>
                            <Cursor />
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
