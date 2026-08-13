'use client';

import { ArrowDown, ArrowUp, Clock, Layers, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/common/CopyButton';
import { formatBytes, formatRelativeTime } from '@/lib/format';
import { ServerActionsMenu } from './ServerActionsMenu';
import { ServerStatusPill } from './StatusIndicator';
import { protocolIcons, protocolVariants, type ServerCardProps } from './types';

/** A single usage bar (CPU / RAM / Disk) inside the card's metrics strip. */
function UsageBar({
    label,
    percent,
    text,
    tone,
}: {
    label: string;
    percent: number;
    /** Displayed figure — CPU shows the raw reading, RAM/Disk are rounded. */
    text: string;
    tone: 'cpu' | 'ram' | 'disk';
}) {
    const high = percent >= 90;
    const warn = percent >= 70;
    const textColor = high
        ? 'text-red-400'
        : warn
          ? 'text-amber-400'
          : tone === 'cpu'
            ? 'text-emerald-400'
            : tone === 'ram'
              ? 'text-sky-400'
              : 'text-muted-foreground';
    const barColor = high
        ? 'bg-red-500'
        : warn
          ? 'bg-amber-500'
          : tone === 'cpu'
            ? 'bg-emerald-500'
            : tone === 'ram'
              ? 'bg-sky-500'
              : 'bg-muted-foreground/30';

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground/60">{label}</span>
                <span className={`tabular-nums font-medium ${textColor}`}>{text}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-secondary">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                />
            </div>
        </div>
    );
}

export function ServerGridCard({
    server,
    m,
    mLoading,
    hasSession,
    onOpen,
    onFavorite,
    onEdit,
    onDelete,
    onCopyPassword,
    onConnect,
    onSessions,
    onTagClick,
    onShare,
}: ServerCardProps) {
    const Icon = protocolIcons[server.protocol];
    const hasMetrics = server.protocol === 'SSH' && m && m.reachable && !m.error;
    const statusStrip = mLoading
        ? ''
        : m?.reachable === true
          ? 'bg-emerald-500/60'
          : m?.reachable === false
            ? 'bg-red-500/60'
            : '';

    return (
        <Card className="group flex flex-col overflow-hidden border border-border bg-card hover:-translate-y-[2px] hover:border-border/80 hover:shadow-lg transition-all duration-200">
            <div className={`h-0.5 w-full transition-colors duration-500 ${statusStrip}`} />

            <div className="flex flex-1 flex-col gap-3 p-3.5 cursor-pointer" onClick={onOpen}>
                <div className="flex items-start gap-3">
                    <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${protocolVariants[server.protocol]}`}
                    >
                        <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 min-w-0">
                            <div className="min-w-0 flex-1">
                                <h3 className="truncate text-sm font-semibold leading-tight">
                                    {server.name}
                                </h3>
                                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
                                    {server.host}
                                    <span className="text-muted-foreground/50">:{server.port}</span>
                                </p>
                            </div>
                            {mLoading ? (
                                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40 animate-pulse" />
                            ) : m?.reachable === true ? (
                                <span className="mt-0.5">
                                    <ServerStatusPill
                                        status="online"
                                        label={m.latencyMs != null ? `${m.latencyMs}ms` : 'Online'}
                                    />
                                </span>
                            ) : m?.reachable === false ? (
                                <span className="mt-0.5">
                                    <ServerStatusPill status="offline" label="Offline" />
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            onFavorite();
                        }}
                        className={`h-8 w-8 shrink-0 rounded-md transition-all ${server.isFavorite ? 'text-yellow-400' : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-yellow-400 [@media(hover:none)]:opacity-100'}`}
                    >
                        <Star
                            className={`h-3.5 w-3.5 ${server.isFavorite ? 'fill-yellow-400' : ''}`}
                        />
                    </Button>
                </div>

                <div className="rounded-lg border border-border/60 bg-secondary/30 px-2.5 py-2">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[11px] text-foreground/75">
                            {server.username}@{server.host}
                        </span>
                        <CopyButton text={`${server.host}:${server.port}`} className="shrink-0" />
                    </div>
                    {server.description && (
                        <p className="mt-1.5 line-clamp-1 text-[11px] text-muted-foreground">
                            {server.description}
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${protocolVariants[server.protocol]}`}
                    >
                        {server.protocol}
                    </span>
                    {server.group && (
                        <span
                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                            style={{
                                backgroundColor: `${server.group.color}20`,
                                color: server.group.color || undefined,
                                borderColor: `${server.group.color}40`,
                            }}
                        >
                            {server.group.name}
                        </span>
                    )}
                    {server.tags.slice(0, 2).map((tag) => (
                        <button
                            key={tag}
                            onClick={(e) => {
                                e.stopPropagation();
                                onTagClick(tag);
                            }}
                            className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                        >
                            {tag}
                        </button>
                    ))}
                </div>

                <div className="mt-auto space-y-2">
                    {hasMetrics && (
                        <div className="grid grid-cols-3 gap-2">
                            {m!.cpu != null && (
                                <UsageBar
                                    label="CPU"
                                    percent={m!.cpu}
                                    text={String(m!.cpu)}
                                    tone="cpu"
                                />
                            )}
                            {m!.ram && (
                                <UsageBar
                                    label="RAM"
                                    percent={m!.ram.percent}
                                    text={String(Math.round(m!.ram.percent))}
                                    tone="ram"
                                />
                            )}
                            {m!.disk && (
                                <UsageBar
                                    label="Disk"
                                    percent={m!.disk.percent}
                                    text={String(Math.round(m!.disk.percent))}
                                    tone="disk"
                                />
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{formatRelativeTime(server.lastUsedAt)}</span>
                        {m?.network && (
                            <>
                                <span className="mx-0.5 text-muted-foreground/30">·</span>
                                <ArrowDown className="h-2.5 w-2.5 text-emerald-500/60" />
                                <span className="tabular-nums">
                                    {formatBytes(m.network.rxBytes)}
                                </span>
                                <ArrowUp className="h-2.5 w-2.5 text-sky-400/60" />
                                <span className="tabular-nums">
                                    {formatBytes(m.network.txBytes)}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1.5 border-t border-border/60 bg-secondary/20 px-3 py-2.5">
                <Button
                    onClick={(e) => {
                        e.stopPropagation();
                        onConnect();
                    }}
                    size="sm"
                    className="h-8 flex-1 justify-center text-xs"
                >
                    Connect
                </Button>
                {server.protocol === 'SSH' && (
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSessions();
                        }}
                        className="h-8 w-8 shrink-0"
                        title={hasSession ? 'Open Session' : 'Add to Sessions'}
                    >
                        <Layers className="h-3.5 w-3.5" />
                    </Button>
                )}
                <ServerActionsMenu
                    server={server}
                    onEdit={onEdit}
                    onShare={onShare}
                    onCopyPassword={onCopyPassword}
                    onDelete={onDelete}
                    triggerClassName="h-8 w-8 shrink-0"
                />
            </div>
        </Card>
    );
}
