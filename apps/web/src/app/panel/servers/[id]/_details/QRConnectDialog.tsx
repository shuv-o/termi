'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getSiteUrl } from '@/lib/site';

/**
 * Scan-to-connect: renders a QR code for this server's connect URL. The
 * scanning device just needs to already be logged into Termix — the URL
 * carries no credentials or auth token, so a photographed/leaked code can't
 * be used to sign in as anyone.
 */
export function QRConnectDialog({
    open,
    onClose,
    serverId,
    serverName,
    protocol,
}: {
    open: boolean;
    onClose: () => void;
    serverId: string;
    serverName: string;
    protocol: string;
}) {
    const [dataUrl, setDataUrl] = useState('');
    const connectUrl = `${getSiteUrl()}/panel/connect/${serverId}/${protocol.toLowerCase()}`;

    useEffect(() => {
        if (!open) return;
        setDataUrl('');
        QRCode.toDataURL(connectUrl, { width: 280, margin: 1 })
            .then(setDataUrl)
            .catch(() => setDataUrl(''));
    }, [open, connectUrl]);

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-primary" />
                        Scan to Connect
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-[280px] h-[280px] flex items-center justify-center rounded-lg bg-white p-3">
                        {dataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a data: URL, not an optimizable remote image
                            <img src={dataUrl} alt="QR code to connect" width={256} height={256} />
                        ) : (
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        )}
                    </div>
                    <p className="text-sm font-medium text-center">{serverName}</p>
                    <p className="text-xs text-muted-foreground text-center max-w-[260px]">
                        Scan with your phone&apos;s camera to open this server on mobile.
                        You&apos;ll need to already be signed in to Termix on that device.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
