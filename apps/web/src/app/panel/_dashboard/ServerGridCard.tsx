'use client';

import { ArrowDown, ArrowUp, Clock, Layers, Star, Waypoints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/common/CopyButton';
import { formatBytes, formatRelativeTime } from '@/lib/format';
import { ServerActionsMenu } from './ServerActionsMenu';
import { ServerStatusPill } from './StatusIndicator';
import { toneDot, toneText, usageTone } from '@/lib/style/status';
import { protocolIcons, protocolVariants, type ServerCardProps } from './types';

/** A single usage bar (CPU / RAM / Disk) inside the card's metrics strip. */
function UsageBar({
    label,
    percent,
    text,
}: {
    label: string;
    percent: number;
    /** Displayed figure — CPU shows the raw reading, RAM/Disk are rounded. */
    text: string;
    tone: 'cpu' | 'ram' | 'disk';
}) {
    // Thresholds come from the shared scale so this bar turns amber at exactly
    // the point the "High CPU"/"High RAM" fleet stats start counting the server,
    // and red at the point the alert banner starts listing it.
    const loadTone = usageTone(percent);
    // Below the warning line a bar is just a reading, not a verdict — so it
    // stays neutral, and colour is reserved for load that needs attention.
    const idleText = 'text-foreground/80';
    const idleBar = 'bg-muted-foreground/45';
    const textColor = loadTone === 'success' ? idleText : toneText[loadTone];
    const barColor = loadTone === 'success' ? idleBar : toneDot[loadTone];

    return (
        <div className="min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="truncate text-muted-foreground">{label}</span>
                <span className={`tabular-nums font-medium ${textColor}`}>{text}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-accent">
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
    jumpVia,
    onOpen,
    onFavorite,
    onEdit,
    onDelete,
    onCopyPassword,
    onConnect,
    onTagClick,
    onShare,
}: ServerCardProps) {
    const Icon = protocolIcons[server.protocol];
    const hasMetrics = server.protocol === 'SSH' && m && m.reachable && !m.error;

    return (
        <Card className="group relative flex flex-col overflow-hidden transition-colors duration-150 hover:border-input">
            <div className="flex flex-1 cursor-pointer flex-col gap-3 p-4" onClick={onOpen}>
                <div className="flex items-start gap-3">
                    <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${protocolVariants[server.protocol]}`}
                        title={server.protocol}
                    >
                        <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[15px] font-semibold leading-snug">
                            {server.name}
                        </h3>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1">
                            <p className="data truncate text-xs text-muted-foreground">
                                {server.username}@{server.host}
                                <span className="text-muted-foreground/60">:{server.port}</span>
                            </p>
                            <CopyButton
                                text={`${server.host}:${server.port}`}
                                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                            />
                        </div>
                        {jumpVia && (
                            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                                <Waypoints className="h-3 w-3 shrink-0" aria-hidden />
                                <span className="truncate">via {jumpVia}</span>
                            </p>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={server.isFavorite ? 'Unstar' : 'Star'}
                        aria-pressed={server.isFavorite}
                        onClick={(e) => {
                            e.stopPropagation();
                            onFavorite();
                        }}
                        className={`-mr-2 -mt-1.5 h-9 w-9 shrink-0 sm:h-8 sm:w-8 ${server.isFavorite ? 'text-warning hover:text-warning' : 'text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-warning [@media(hover:none)]:opacity-100'}`}
                    >
                        <Star className={`h-4 w-4 ${server.isFavorite ? 'fill-warning' : ''}`} />
                    </Button>
                </div>

                {server.description && (
                    <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                        {server.description}
                    </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                    {mLoading ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-px text-[11px] text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                            Checking
                        </span>
                    ) : m?.reachable === true ? (
                        <ServerStatusPill
                            status="online"
                            label={m.latencyMs != null ? `Online, ${m.latencyMs} ms` : 'Online'}
                        />
                    ) : m?.reachable === false ? (
                        <ServerStatusPill status="offline" label="Offline" />
                    ) : null}
                    {server.group && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-px text-[11px] font-medium text-foreground/80">
                            <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                    backgroundColor:
                                        server.group.color || 'var(--muted-foreground)',
                                }}
                            />
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
                            className="inline-flex items-center rounded-full border border-border px-2 py-px text-[11px] text-muted-foreground transition-colors hover:border-input hover:text-foreground"
                        >
                            #{tag}
                        </button>
                    ))}
                </div>

                <div className="mt-auto space-y-2.5">
                    {hasMetrics && (
                        <div className="grid grid-cols-3 gap-3">
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
                                    label="Memory"
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

                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{formatRelativeTime(server.lastUsedAt)}</span>
                        {m?.network && (
                            <span className="ml-auto flex items-center gap-1 tabular-nums">
                                <ArrowDown className="h-3 w-3" aria-label="Received" />
                                {formatBytes(m.network.rxBytes)}
                                <ArrowUp className="ml-1 h-3 w-3" aria-label="Sent" />
                                {formatBytes(m.network.txBytes)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
                {/* One button: it opens a workspace session, and says whether
                    that session already exists. */}
                <Button
                    onClick={(e) => {
                        e.stopPropagation();
                        onConnect();
                    }}
                    // Quiet in a grid of many: a wall of solid accent buttons
                    // drowns out the one thing on the page that needs it.
                    variant="secondary"
                    size="sm"
                    className={`flex-1 ${hasSession ? '' : 'text-primary hover:border-primary/40 hover:bg-primary/10'}`}
                >
                    {hasSession && <Layers />}
                    {hasSession ? 'Open session' : 'Connect'}
                </Button>
                <ServerActionsMenu
                    server={server}
                    onEdit={onEdit}
                    onShare={onShare}
                    onCopyPassword={onCopyPassword}
                    onDelete={onDelete}
                    triggerClassName="h-9 w-9 shrink-0 sm:h-8 sm:w-8"
                />
            </div>
        </Card>
    );
}
