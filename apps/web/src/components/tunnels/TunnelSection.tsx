'use client';

import { useState } from 'react';
import {
    AlertTriangle,
    ArrowDownLeft,
    ArrowUpRight,
    ExternalLink,
    Globe,
    Laptop,
    Loader2,
    Network,
    Terminal,
    Waypoints,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyTextButton } from '@/components/common/CopyButton';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
    desktopSupports,
    type ForwardMode,
    type TunnelResult,
    type TunnelSessionRow,
    type useTunnels,
} from '@/components/tunnels/useTunnels';

type Tunnels = ReturnType<typeof useTunnels>;

function downloadScript(content: string) {
    const blob = new Blob([content], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'termi-tunnel.mjs';
    a.click();
    URL.revokeObjectURL(url);
}

function TunnelResultCard({ result, onReset }: { result: TunnelResult; onReset: () => void }) {
    if (result.electronBindPort) {
        return (
            <div className="p-3 rounded-lg bg-secondary/40 border border-border/50 space-y-2">
                <p className="text-xs text-muted-foreground">
                    Connected — port{' '}
                    <code className="font-mono text-foreground">{result.electronBindPort}</code> on
                    the server now reaches{' '}
                    <code className="font-mono text-foreground">{result.localTarget}</code> on this
                    computer, while this tunnel stays open.
                </p>
                <Button variant="ghost" size="sm" onClick={onReset}>
                    Close tunnel
                </Button>
            </div>
        );
    }

    if (result.electronLocalPort) {
        const address = `127.0.0.1:${result.electronLocalPort}`;
        const socks = result.mode === 'dynamic';
        return (
            <div className="p-3 rounded-lg bg-secondary/40 border border-border/50 space-y-2">
                <p className="text-xs text-muted-foreground">
                    {socks
                        ? 'Connected — set this as the SOCKS5 proxy in your browser or tool:'
                        : 'Connected — point your tool at this address:'}
                </p>
                <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-secondary text-foreground/90 rounded-md px-3 py-2">
                        {socks ? `socks5://${address}` : address}
                    </code>
                    <CopyTextButton
                        text={socks ? `socks5://${address}` : address}
                        label="Copy address"
                    />
                </div>
                {socks && (
                    <p className="text-[11px] text-muted-foreground/70">
                        e.g. <code className="font-mono">curl --socks5-hostname {address} …</code> —
                        names are resolved by the server, so internal hostnames work.
                    </p>
                )}
                <Button variant="ghost" size="sm" onClick={onReset}>
                    Close tunnel
                </Button>
            </div>
        );
    }

    if (result.isHttp && result.proxyUrl) {
        return (
            <div className="p-3 rounded-lg bg-secondary/40 border border-border/50 space-y-2">
                <p className="text-xs text-muted-foreground">
                    This looks like an HTTP service — open it directly, no extra tooling needed.
                </p>
                <div className="flex gap-2">
                    <Button asChild size="sm" className="gap-1.5">
                        <a href={result.proxyUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open in browser
                        </a>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onReset}>
                        Dismiss
                    </Button>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                    Path-based, not a dedicated subdomain — pages that use absolute-path links or
                    assets may not render perfectly.
                </p>
            </div>
        );
    }

    return (
        <div className="p-3 rounded-lg bg-secondary/40 border border-border/50 space-y-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                {result.mode === 'local'
                    ? 'Not HTTP — run this on your own computer to open a local port'
                    : result.mode === 'dynamic'
                      ? 'Run this on your own computer to start a SOCKS5 proxy'
                      : `Run this on your own computer so the server can reach ${result.localTarget}`}{' '}
                (requires Node.js 22+):
            </p>
            <pre className="text-[11px] font-mono bg-secondary text-foreground/90 rounded-md p-3 overflow-x-auto max-h-48 whitespace-pre">
                {result.bridgeScript}
            </pre>
            <div className="flex gap-2">
                <CopyTextButton text={result.bridgeScript ?? ''} label="Copy script" />
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloadScript(result.bridgeScript ?? '')}
                >
                    Download
                </Button>
                <Button variant="ghost" size="sm" onClick={onReset}>
                    Dismiss
                </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
                Save as <code className="font-mono">termi-tunnel.mjs</code> and run{' '}
                <code className="font-mono">node termi-tunnel.mjs</code> within 5 minutes; once
                connected it keeps running until you stop it.
            </p>
        </div>
    );
}

const KIND_ICON = { HTTP_PROXY: Globe, BRIDGE_SCRIPT: Terminal, ELECTRON_LOCAL: Laptop } as const;
const KIND_LABEL = {
    HTTP_PROXY: 'Browser link',
    BRIDGE_SCRIPT: 'Local bridge script',
    ELECTRON_LOCAL: 'Local port',
} as const;

/** One row in the persisted "active tunnels" list — see useTunnels.ts for why
 *  this is a bookkeeping record rather than a live connection indicator.
 *  `proxyUrl` is `null` when the row's server has since been deleted (its
 *  path can't be reconstructed without a serverId), in which case the
 *  HTTP/script actions are disabled but the row can still be removed. */
export function TunnelSessionRowCard({
    row,
    proxyUrl,
    onClose,
    onRegenerateScript,
    serverLabel,
}: {
    row: TunnelSessionRow;
    proxyUrl: string | null;
    onClose: () => void;
    onRegenerateScript: () => Promise<string | null>;
    /** Shown above the row when listing tunnels across multiple servers. */
    serverLabel?: string;
}) {
    const [script, setScript] = useState<string | null>(null);
    const [loadingScript, setLoadingScript] = useState(false);
    const Icon = KIND_ICON[row.kind];

    const serverDeleted = row.serverId === null;

    return (
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/40 space-y-2">
            {serverLabel && (
                <p className="text-xs font-medium text-foreground/80 truncate">{serverLabel}</p>
            )}
            <div className="flex items-center gap-2 min-w-0">
                <Icon className="w-3.5 h-3.5 text-info shrink-0" />
                <span className="text-sm font-mono truncate">{rowLabel(row)}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
                    {KIND_LABEL[row.kind]}
                </span>
                <span className="text-[11px] text-muted-foreground/70 shrink-0 ml-auto">
                    {formatRelativeTime(row.createdAt)}
                </span>
            </div>

            {row.kind === 'ELECTRON_LOCAL' && row.mode === 'REMOTE' && (
                <div className="flex justify-end">
                    <Button variant="ghost" size="sm" className="gap-1" onClick={onClose}>
                        <X className="w-3.5 h-3.5" />
                        Close
                    </Button>
                </div>
            )}

            {row.kind === 'ELECTRON_LOCAL' && row.mode !== 'REMOTE' && row.localPort && (
                <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-secondary text-foreground/90 rounded-md px-3 py-2">
                        {row.mode === 'DYNAMIC' ? 'socks5://' : ''}127.0.0.1:{row.localPort}
                    </code>
                    <CopyTextButton
                        text={`${row.mode === 'DYNAMIC' ? 'socks5://' : ''}127.0.0.1:${row.localPort}`}
                        label="Copy"
                    />
                    <Button variant="ghost" size="sm" className="gap-1" onClick={onClose}>
                        <X className="w-3.5 h-3.5" />
                        Close
                    </Button>
                </div>
            )}

            {row.kind === 'HTTP_PROXY' && (
                <div className="space-y-1.5">
                    <div className="flex gap-2">
                        {proxyUrl ? (
                            <Button asChild size="sm" variant="secondary" className="gap-1.5">
                                <a href={proxyUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Open in browser
                                </a>
                            </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" className="gap-1" onClick={onClose}>
                            <X className="w-3.5 h-3.5" />
                            Remove
                        </Button>
                    </div>
                    {serverDeleted && (
                        <p className="text-[11px] text-muted-foreground/70">
                            This server has been deleted — the link can no longer be reconstructed.
                        </p>
                    )}
                </div>
            )}

            {row.kind === 'BRIDGE_SCRIPT' && (
                <div className="space-y-2">
                    {script ? (
                        <>
                            <pre className="text-[11px] font-mono bg-secondary text-foreground/90 rounded-md p-3 overflow-x-auto max-h-48 whitespace-pre">
                                {script}
                            </pre>
                            <div className="flex gap-2">
                                <CopyTextButton text={script} label="Copy script" />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => downloadScript(script)}
                                >
                                    Download
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1"
                                    onClick={onClose}
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Remove
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-1.5">
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={loadingScript || serverDeleted}
                                    onClick={async () => {
                                        setLoadingScript(true);
                                        const fresh = await onRegenerateScript();
                                        setLoadingScript(false);
                                        if (fresh) setScript(fresh);
                                    }}
                                >
                                    {loadingScript ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        'Get script'
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1"
                                    onClick={onClose}
                                >
                                    <X className="w-3.5 h-3.5" />
                                    Remove
                                </Button>
                            </div>
                            {serverDeleted && (
                                <p className="text-[11px] text-muted-foreground/70">
                                    This server has been deleted — a script can no longer be
                                    generated for it.
                                </p>
                            )}
                        </div>
                    )}
                    <p className="text-[11px] text-muted-foreground/70">
                        A script has to be started within 5 minutes of fetching it — get a fresh one
                        rather than reusing an old copy.
                    </p>
                </div>
            )}
        </div>
    );
}

/** How a saved row reads in a list. */
function rowLabel(row: TunnelSessionRow): string {
    if (row.mode === 'DYNAMIC') return 'SOCKS proxy';
    if (row.mode === 'REMOTE') {
        return `server :${row.remotePort} → ${row.localHost ?? '127.0.0.1'}:${row.localPort ?? '?'}`;
    }
    return `${row.remoteHost}:${row.remotePort}`;
}

const MODES: { mode: ForwardMode; label: string; icon: typeof Waypoints; hint: React.ReactNode }[] =
    [
        {
            mode: 'local',
            label: 'Local',
            icon: ArrowDownLeft,
            hint: (
                <>
                    Reach a port on this server&apos;s network from your computer — like{' '}
                    <code className="font-mono">ssh -L</code>.
                </>
            ),
        },
        {
            mode: 'dynamic',
            label: 'SOCKS proxy',
            icon: Network,
            hint: (
                <>
                    A SOCKS5 proxy on your computer that sends each connection out from this server,
                    to any host it can reach — like <code className="font-mono">ssh -D</code>.
                </>
            ),
        },
        {
            mode: 'remote',
            label: 'Remote',
            icon: ArrowUpRight,
            hint: (
                <>
                    Let this server reach a port on your computer, e.g. to show a local dev server
                    or receive a webhook — like <code className="font-mono">ssh -R</code>.
                </>
            ),
        },
    ];

const portInput = (v: string) => v.replace(/\D/g, '').slice(0, 5);
const validPort = (v: string, allowZero = false) =>
    v !== '' && Number(v) >= (allowZero ? 0 : 1) && Number(v) <= 65535;

/**
 * The forwarding form: a mode switch and that mode's fields, the result and
 * any error. Shared by the server page and the in-terminal dialog.
 */
export function ForwardForm({ tunnels }: { tunnels: Tunnels }) {
    const t = tunnels;
    const canOpen =
        t.mode === 'local'
            ? t.remoteHost.trim().length > 0 && validPort(t.remotePort)
            : t.mode === 'dynamic'
              ? t.localPort === '' || validPort(t.localPort)
              : validPort(t.localPort) && (t.bindPort === '' || validPort(t.bindPort, true));
    const hint = MODES.find((m) => m.mode === t.mode)!.hint;
    const runsHere = desktopSupports(t.mode);

    return (
        <div className="space-y-3">
            <div
                role="radiogroup"
                aria-label="Forwarding type"
                className="grid grid-cols-3 gap-1 rounded-lg bg-secondary/50 p-1"
            >
                {MODES.map(({ mode, label, icon: Icon }) => (
                    <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={t.mode === mode}
                        disabled={t.opening}
                        onClick={() => t.setMode(mode)}
                        className={cn(
                            'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                            t.mode === mode
                                ? 'bg-card text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {mode === 'dynamic' ? (
                            <>
                                <span className="sm:hidden">SOCKS</span>
                                <span className="hidden sm:inline">{label}</span>
                            </>
                        ) : (
                            label
                        )}
                    </button>
                ))}
            </div>

            <p className="text-xs text-muted-foreground">{hint}</p>

            <form
                className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (canOpen && !t.opening) void t.open();
                }}
            >
                {t.mode === 'local' && (
                    <>
                        <Field label="Host, as the server sees it" className="sm:flex-1">
                            <Input
                                value={t.remoteHost}
                                onChange={(e) => t.setRemoteHost(e.target.value)}
                                placeholder="127.0.0.1"
                                className="font-mono text-xs"
                                disabled={t.opening}
                            />
                        </Field>
                        <Field label="Port" className="sm:w-28">
                            <Input
                                value={t.remotePort}
                                onChange={(e) => t.setRemotePort(portInput(e.target.value))}
                                placeholder="5432"
                                inputMode="numeric"
                                className="font-mono text-xs"
                                disabled={t.opening}
                            />
                        </Field>
                    </>
                )}

                {t.mode === 'dynamic' && runsHere && (
                    <Field label="Proxy port on this computer (optional)" className="sm:flex-1">
                        <Input
                            value={t.localPort}
                            onChange={(e) => t.setLocalPort(portInput(e.target.value))}
                            placeholder="1080"
                            inputMode="numeric"
                            className="font-mono text-xs"
                            disabled={t.opening}
                        />
                    </Field>
                )}

                {t.mode === 'remote' && (
                    <>
                        <Field label="Server listens on" className="sm:w-40">
                            <select
                                value={t.bindAddress}
                                onChange={(e) =>
                                    t.setBindAddress(e.target.value as '127.0.0.1' | '0.0.0.0')
                                }
                                disabled={t.opening}
                                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                            >
                                <option value="127.0.0.1">The server only</option>
                                <option value="0.0.0.0">All interfaces</option>
                            </select>
                        </Field>
                        <Field label="Server port" className="sm:w-28">
                            <Input
                                value={t.bindPort}
                                onChange={(e) => t.setBindPort(portInput(e.target.value))}
                                placeholder="9000"
                                inputMode="numeric"
                                className="font-mono text-xs"
                                disabled={t.opening}
                            />
                        </Field>
                        <Field label="Port on this computer" className="sm:w-36">
                            <Input
                                value={t.localPort}
                                onChange={(e) => t.setLocalPort(portInput(e.target.value))}
                                placeholder="3000"
                                inputMode="numeric"
                                className="font-mono text-xs"
                                disabled={t.opening}
                            />
                        </Field>
                    </>
                )}

                <Button type="submit" disabled={t.opening || !canOpen} className="shrink-0">
                    {t.opening ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : t.mode === 'dynamic' ? (
                        'Start proxy'
                    ) : (
                        'Open forward'
                    )}
                </Button>
            </form>

            {t.mode === 'remote' && t.bindAddress === '0.0.0.0' && (
                <p className="text-[11px] text-muted-foreground/80">
                    Other machines can then reach your computer through the server. sshd only allows
                    this with <code className="font-mono">GatewayPorts yes</code>; otherwise it
                    listens on the server only.
                </p>
            )}
            {t.mode !== 'local' && !runsHere && (
                <p className="text-[11px] text-muted-foreground/80">
                    A browser can&apos;t open ports, so you&apos;ll get a small script to run with
                    Node.js — or use the Termi desktop app to run it right here.
                </p>
            )}

            {t.error && (
                <div className="flex items-center gap-2 text-xs text-danger">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {t.error}
                </div>
            )}

            {t.result && <TunnelResultCard result={t.result} onReset={t.reset} />}
        </div>
    );
}

function Field({
    label,
    className,
    children,
}: {
    label: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <label className={cn('flex flex-col gap-1', className)}>
            <span className="text-[11px] text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}

/**
 * Port forwarding for one SSH server: local, SOCKS and remote. No listener
 * opens on Termi's host, so it works behind a reverse proxy that only
 * forwards 80/443. Tunnels opened earlier are listed below so they're still
 * visible after navigating away and back — see useTunnels.ts.
 */
export function TunnelSection({ tunnels }: { tunnels: Tunnels }) {
    return (
        <div>
            <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2 mb-3">
                <Waypoints className="w-4 h-4 text-info" />
                Port forwarding
            </h2>

            <Card className="p-4 space-y-3">
                <ForwardForm tunnels={tunnels} />

                {tunnels.activeSessions.length > 0 && (
                    <div className="space-y-2 pt-1">
                        <p className="text-[11px] font-medium text-muted-foreground">
                            Open forwards on this server
                        </p>
                        {tunnels.activeSessions.map((row) => (
                            <TunnelSessionRowCard
                                key={row.id}
                                row={row}
                                proxyUrl={tunnels.proxyUrlFor(row)}
                                onClose={() => tunnels.closeSession(row)}
                                onRegenerateScript={() => tunnels.regenerateBridgeScript(row)}
                            />
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}
