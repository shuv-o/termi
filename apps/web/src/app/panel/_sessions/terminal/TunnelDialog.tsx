'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ForwardForm, TunnelSessionRowCard } from '@/components/tunnels/TunnelSection';
import { useTunnels } from '@/components/tunnels/useTunnels';

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
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Port forwarding — {serverName}</DialogTitle>
                </DialogHeader>

                <ForwardForm tunnels={tunnels} />

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
