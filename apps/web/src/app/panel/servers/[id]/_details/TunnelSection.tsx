'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, Terminal, Waypoints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { TunnelResult } from './useTunnels';

function CopyTextButton({ text, label = 'Copy' }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => {
                navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                });
            }}
        >
            {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
                <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? 'Copied' : label}
        </Button>
    );
}

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
    if (result.electronLocalPort) {
        const address = `127.0.0.1:${result.electronLocalPort}`;
        return (
            <div className="p-3 rounded-lg bg-secondary/40 border border-border/50 space-y-2">
                <p className="text-xs text-muted-foreground">
                    Connected — point your tool at this address:
                </p>
                <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-black/40 text-foreground/90 rounded-md px-3 py-2">
                        {address}
                    </code>
                    <CopyTextButton text={address} label="Copy address" />
                </div>
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
                        New tunnel
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
                Not HTTP — run this once on your own machine to open a local port (requires
                Node.js 22+):
            </p>
            <pre className="text-[11px] font-mono bg-black/40 text-foreground/90 rounded-md p-3 overflow-x-auto max-h-48 whitespace-pre">
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
                    New tunnel
                </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
                Save as <code className="font-mono">termi-tunnel.mjs</code> and run{' '}
                <code className="font-mono">node termi-tunnel.mjs</code>. The token inside expires
                in 5 minutes if unused — regenerate here if it fails.
            </p>
        </div>
    );
}

/**
 * Port forwarding for one SSH server. Stateless: each request probes the
 * target and hands back either a one-click browser link (HTTP targets) or a
 * copyable local-bridge script (everything else) — no listener opens on this
 * host, so it works behind a reverse proxy that only forwards 80/443.
 */
export function TunnelSection({
    remoteHost,
    setRemoteHost,
    remotePort,
    setRemotePort,
    opening,
    error,
    onOpen,
    result,
    onReset,
}: {
    remoteHost: string;
    setRemoteHost: (v: string) => void;
    remotePort: string;
    setRemotePort: (v: string) => void;
    opening: boolean;
    error: string;
    onOpen: () => void;
    result: TunnelResult | null;
    onReset: () => void;
}) {
    const canOpen = remoteHost.trim().length > 0 && Number(remotePort) >= 1 && Number(remotePort) <= 65535;

    return (
        <div>
            <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2 mb-3">
                <Waypoints className="w-4 h-4 text-sky-400" />
                Port Forwarding
            </h2>

            <Card className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                    Reach a port on this server&apos;s own network (or anything reachable from it)
                    without opening a terminal — like <code className="font-mono">ssh -L</code>.
                </p>

                {!result && (
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                            value={remoteHost}
                            onChange={(e) => setRemoteHost(e.target.value)}
                            placeholder="127.0.0.1"
                            className="font-mono text-xs sm:flex-1"
                            disabled={opening}
                        />
                        <Input
                            value={remotePort}
                            onChange={(e) => setRemotePort(e.target.value.replace(/\D/g, ''))}
                            placeholder="5432"
                            inputMode="numeric"
                            className="font-mono text-xs sm:w-28"
                            disabled={opening}
                        />
                        <Button onClick={onOpen} disabled={opening || !canOpen} className="shrink-0">
                            {opening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Tunnel'}
                        </Button>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {error}
                    </div>
                )}

                {result && <TunnelResultCard result={result} onReset={onReset} />}
            </Card>
        </div>
    );
}
