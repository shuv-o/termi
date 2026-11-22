'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { formatRelativeTime } from '@/lib/format';
import { describeUserAgent } from '@/lib/user-agent';

interface Entry {
    id: string;
    protocol: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
}

const KIND: Record<string, string> = {
    ssh: 'Terminal',
    scp: 'Files',
    rdp: 'Remote desktop',
    vnc: 'Screen share',
    telnet: 'Telnet',
};

const LIMIT = 6;

/** The last few times you opened this server, and from where. */
export function RecentConnections({ serverId }: { serverId: string }) {
    const { data } = useCachedFetch<{ entries: Entry[] }>(
        `/api/account/connections?serverId=${encodeURIComponent(serverId)}&limit=${LIMIT}`,
    );
    const entries = data?.entries ?? [];

    return (
        <div>
            <div className="mb-3 flex items-center gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                    <History className="h-4 w-4 text-info" />
                    Recent connections
                </h2>
                <Button size="sm" variant="ghost" asChild className="ml-auto">
                    <Link href="/panel/history">History</Link>
                </Button>
            </div>
            <Card className="px-4 py-2">
                {data && entries.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">Not opened yet.</p>
                ) : (
                    <ul className="divide-y divide-border/50">
                        {entries.map((e) => {
                            const from = [
                                describeUserAgent(e.userAgent),
                                e.ipAddress && e.ipAddress !== 'unknown' ? e.ipAddress : '',
                            ]
                                .filter(Boolean)
                                .join(', ');
                            return (
                                <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                                    <span className="w-28 shrink-0 font-medium">
                                        {KIND[e.protocol] ?? e.protocol}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                        {from}
                                    </span>
                                    <time
                                        dateTime={e.createdAt}
                                        title={new Date(e.createdAt).toLocaleString()}
                                        className="shrink-0 text-xs text-muted-foreground"
                                    >
                                        {formatRelativeTime(e.createdAt)}
                                    </time>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>
        </div>
    );
}
