'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TunnelSessionRowCard } from '../../servers/[id]/_details/TunnelSection';
import { useTunnels } from '../../servers/[id]/_details/useTunnels';

/**
 * Same port-forwarding flow as the server detail page's Port Forwarding
 * section, surfaced from an active terminal session so opening a tunnel
 * doesn't mean leaving the session to find the server's page.
 */
export function TunnelDialog({
    open,
    onOpenChange,
    serverId,
    serverName,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    serverId: string;
    serverName: string;
}) {
    const tunnels = useTunnels(serverId, serverName);
    const canOpen =
        tunnels.remoteHost.trim().length > 0 &&
        Number(tunnels.remotePort) >= 1 &&
        Number(tunnels.remotePort) <= 65535;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Port Forwarding — {serverName}</DialogTitle>
                </DialogHeader>

                <p className="text-xs text-muted-foreground">
                    Reach a port on this server&apos;s own network without opening a second
                    session — like <code className="font-mono">ssh -L</code>.
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                        value={tunnels.remoteHost}
                        onChange={(e) => tunnels.setRemoteHost(e.target.value)}
                        placeholder="127.0.0.1"
                        className="font-mono text-xs sm:flex-1"
                        disabled={tunnels.opening}
                    />
                    <Input
                        value={tunnels.remotePort}
                        onChange={(e) => tunnels.setRemotePort(e.target.value.replace(/\D/g, ''))}
                        placeholder="5432"
                        inputMode="numeric"
                        className="font-mono text-xs sm:w-28"
                        disabled={tunnels.opening}
                    />
                    <Button
                        onClick={tunnels.open}
                        disabled={tunnels.opening || !canOpen}
                        className="shrink-0"
                    >
                        {tunnels.opening ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            'Create Tunnel'
                        )}
                    </Button>
                </div>

                {tunnels.error && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {tunnels.error}
                    </div>
                )}

                {tunnels.activeSessions.length > 0 && (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
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
            </DialogContent>
        </Dialog>
    );
}
