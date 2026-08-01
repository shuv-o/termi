'use client';

import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/format';
import { protocolColors, protocolIcons, type MonitorConfig, type ServerInfo } from './types';

function StatPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-secondary/60 border border-border/50">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {label}
            </span>
            <span className="text-sm font-semibold text-foreground">{value}</span>
            {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
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
        <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                <Link href="/panel">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
            </Button>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-semibold truncate">{server.name}</h1>
                    {isOnline !== null &&
                        (isOnline ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Online
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                Offline
                            </span>
                        ))}
                </div>
                {server.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        {server.description}
                    </p>
                )}
            </div>
            <Button variant="secondary" size="sm" asChild className="gap-1.5">
                <Link href={`/panel/servers/${server.id}/edit`}>
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                </Link>
            </Button>
        </div>
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

    return (
        <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${protoColor}`}
                >
                    <ProtoIcon className="w-3.5 h-3.5" />
                    {server.protocol}
                </div>
                <span className="font-mono text-sm text-foreground/80">
                    {server.host}:{server.port}
                </span>
                {server.group && (
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                        {server.group.name}
                    </span>
                )}
                {server.tags.map((t) => (
                    <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground"
                    >
                        {t}
                    </span>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                <StatPill label="Last Used" value={formatRelativeTime(server.lastUsedAt)} />
                {monitorConfig?.lastCheckedAt && (
                    <StatPill
                        label="Last Check"
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
                    <Link href={`/panel/connect/${server.id}/${server.protocol.toLowerCase()}`}>
                        <ProtoIcon className="w-3.5 h-3.5" />
                        Connect via {server.protocol}
                    </Link>
                </Button>
            </div>
        </Card>
    );
}
