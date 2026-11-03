'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { formatRelativeTime } from '@/lib/format';
import { connectHref } from '@/lib/connect-route';
import { ServerStatusPill } from '@/app/panel/_dashboard/StatusIndicator';
import { QRConnectDialog } from './QRConnectDialog';
import { protocolColors, protocolIcons, type MonitorConfig, type ServerInfo } from './types';

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="flex min-w-[96px] flex-col gap-0.5 rounded-md border border-border bg-background/50 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
                {label}
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
            {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
        </div>
    );
}

/** Back button, name, live online badge and the edit link. */
export function ServerHeader({
    server,
    isOnline,
}: {
    server: ServerInfo;
    /** `null` while no health check has been recorded yet. */
    isOnline: boolean | null;
}) {
    return (
        <PageHeader
            title={server.name}
            description={
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {isOnline !== null && (
                        <ServerStatusPill
                            status={isOnline ? 'online' : 'offline'}
                            label={isOnline ? 'Online' : 'Offline'}
                        />
                    )}
                    <span>{server.description || `${server.protocol} server`}</span>
                </span>
            }
            actions={
                <>
                    <Button variant="ghost" asChild className="hidden lg:inline-flex">
                        <Link href="/panel">
                            <ArrowLeft /> All servers
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={`/panel/servers/${server.id}/edit`}>
                            <Pencil />
                            Edit server
                        </Link>
                    </Button>
                </>
            }
        />
    );
}

/** Protocol/host chips, at-a-glance stat pills and the connect button. */
export function ServerInfoCard({
    server,
    monitorConfig,
    uptimePct,
    checkCount,
    latencyMs,
}: {
    server: ServerInfo;
    monitorConfig: MonitorConfig | null;
    uptimePct: number | null;
    checkCount: number;
    latencyMs: number | null | undefined;
}) {
    const ProtoIcon = protocolIcons[server.protocol];
    const protoColor = protocolColors[server.protocol];
    const [showQR, setShowQR] = useState(false);

    return (
        <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${protoColor}`}
                >
                    <ProtoIcon className="w-3.5 h-3.5" />
                    {server.protocol}
                </div>
                <span className="data text-sm text-foreground/85">
                    {server.host}:{server.port}
                </span>
                {server.group && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground/80">
                        {server.group.name}
                    </span>
                )}
                {server.tags.map((t) => (
                    <span
                        key={t}
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                        {t}
                    </span>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                <StatPill label="Last used" value={formatRelativeTime(server.lastUsedAt)} />
                {monitorConfig?.lastCheckedAt && (
                    <StatPill
                        label="Last check"
                        value={formatRelativeTime(monitorConfig.lastCheckedAt)}
                    />
                )}
                {uptimePct !== null && (
                    <StatPill
                        label="Uptime"
                        value={`${uptimePct}%`}
                        sub={`last ${checkCount} checks`}
                    />
                )}
                {latencyMs != null && <StatPill label="Latency" value={`${latencyMs}ms`} />}
                {monitorConfig && (
                    <StatPill
                        label="Monitoring"
                        value={monitorConfig.enabled ? 'Active' : 'Inactive'}
                        sub={
                            monitorConfig.enabled
                                ? `every ${monitorConfig.checkIntervalMinutes}m`
                                : undefined
                        }
                    />
                )}
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                <Button size="sm" asChild className="gap-1.5">
                    <Link href={connectHref(server.id, server.protocol)}>
                        <ProtoIcon className="w-3.5 h-3.5" />
                        Connect via {server.protocol}
                    </Link>
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowQR(true)}
                >
                    <QrCode className="w-3.5 h-3.5" />
                    QR
                </Button>
            </div>

            <QRConnectDialog
                open={showQR}
                onClose={() => setShowQR(false)}
                serverId={server.id}
                serverName={server.name}
                protocol={server.protocol}
            />
        </Card>
    );
}
