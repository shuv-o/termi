'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Activity, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LiveConnectionRow } from '@/components/connections/LiveConnectionRow';
import { useLiveConnections } from '@/components/connections/useLiveConnections';
import { connectionState } from '@/lib/connections/describe';

/**
 * What you have open on this server right now — terminals (including ones
 * left running after their tab closed), file browsers, desktops and tunnels,
 * from any device — with Open and Close. Same data as Active connections.
 */
export function OpenConnections({ serverId }: { serverId: string }) {
    const { items, busy, close } = useLiveConnections(serverId);
    const [confirmBulk, setConfirmBulk] = useState(false);
    const open = (items ?? []).filter((c) => !c.closing);
    const background = open.filter((c) => connectionState(c) === 'background');

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                    <Activity className="h-4 w-4 text-success" />
                    Open now
                    {open.length > 0 && (
                        <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">
                            {open.length}
                        </span>
                    )}
                </h2>
                <div className="ml-auto flex gap-1">
                    {background.length > 1 &&
                        (confirmBulk ? (
                            <>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmBulk(false)}
                                >
                                    Keep
                                </Button>
                                <Button
                                    size="sm"
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={busy}
                                    onClick={() => {
                                        setConfirmBulk(false);
                                        void close(background.map((c) => c.id));
                                    }}
                                >
                                    End {background.length} shells
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmBulk(true)}>
                                Close {background.length} in the background
                            </Button>
                        ))}
                    <Button size="sm" variant="ghost" asChild>
                        <Link href="/panel/active">All servers</Link>
                    </Button>
                </div>
            </div>
            {items === null ? (
                <Card className="flex justify-center p-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </Card>
            ) : items.length === 0 ? (
                <Card className="p-4 text-sm text-muted-foreground">
                    Nothing open on this server. Terminals, file browsers and forwards you open show
                    up here while they run — even after you close their tab.
                </Card>
            ) : (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                    {items.map((c) => (
                        <LiveConnectionRow
                            key={c.id}
                            connection={c}
                            busy={busy}
                            showServer={false}
                            onClose={(id) => void close([id])}
                        />
                    ))}
                </ul>
            )}
        </div>
    );
}
