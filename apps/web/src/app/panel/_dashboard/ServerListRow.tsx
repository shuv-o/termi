'use client';

import { Cpu, HardDrive, Layers, MemoryStick, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/common/CopyButton';
import { formatRelativeTime } from '@/lib/format';
import { ServerActionsMenu } from './ServerActionsMenu';
import { ServerStatusPill } from './StatusIndicator';
import { protocolIcons, protocolVariants, type ServerCardProps } from './types';

/** Column headings for the list view — also used by the loading skeleton. */
export function ServerListHeader() {
    return (
        <div className="border-b border-border/60 bg-secondary/20 px-4 py-3">
            <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <div className="w-9 shrink-0" />
                <div className="flex-[1.3]">Name</div>
                <div className="hidden flex-1 md:block">Host</div>
                <div className="hidden w-28 lg:block">Protocol</div>
                <div className="hidden w-28 xl:block">Status</div>
                <div className="hidden w-24 2xl:block">Last Used</div>
                <div className="hidden flex-1 2xl:block">Details</div>
                <div className="w-28 shrink-0 text-right">Actions</div>
            </div>
        </div>
    );
}

export function ServerListRow({
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
    const statusLabel =
        m?.reachable === true
            ? m.latencyMs != null
                ? `${m.latencyMs}ms`
                : 'Online'
            : m?.reachable === false
              ? 'Offline'
              : 'Unknown';

    return (
        <div
            className="group flex h-14 cursor-pointer items-center gap-4 border-b border-border/50 px-4 transition-colors hover:bg-secondary/40"
            onClick={onOpen}
        >
            <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${protocolVariants[server.protocol]}`}
            >
                <Icon className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-[1.3]">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{server.name}</span>
                    {server.isFavorite && (
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    )}
                </div>
                <div className="hidden 2xl:flex items-center gap-2 mt-0.5">
                    <span className="truncate text-[11px] text-muted-foreground">
                        {server.username}
                    </span>
                    {(server.group || server.tags[0]) && (
                        <span className="text-muted-foreground/30">·</span>
                    )}
                    {server.group && (
                        <span
                            className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                                backgroundColor: `${server.group.color}20`,
                                color: server.group.color || undefined,
                                borderColor: `${server.group.color}40`,
                            }}
                        >
                            {server.group.name}
                        </span>
                    )}
                    {server.tags[0] && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onTagClick(server.tags[0]);
                            }}
                            className="inline-flex items-center rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                        >
                            {server.tags[0]}
                        </button>
                    )}
                </div>
            </div>

            <div className="min-w-0 hidden flex-1 items-center gap-2 md:flex">
                <span className="truncate font-mono text-xs text-muted-foreground/80">
                    {server.host}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground/50">
                    :{server.port}
                </span>
                <CopyButton text={`${server.host}:${server.port}`} className="shrink-0" />
            </div>

            <div className="hidden w-28 shrink-0 items-center lg:flex">
                <span
                    className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium ${protocolVariants[server.protocol]}`}
                >
                    {server.protocol}
                </span>
            </div>

            <div className="hidden w-28 shrink-0 items-center xl:flex">
                {mLoading ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40 animate-pulse" />
                ) : (
                    <ServerStatusPill
                        status={
                            m?.reachable === true
                                ? 'online'
                                : m?.reachable === false
                                  ? 'offline'
                                  : 'unknown'
                        }
                        label={statusLabel}
                    />
                )}
            </div>

            <div className="hidden w-24 shrink-0 items-center text-xs text-muted-foreground 2xl:flex">
                {formatRelativeTime(server.lastUsedAt)}
            </div>

            <div className="hidden min-w-0 flex-1 items-center gap-3 2xl:flex">
                {server.protocol === 'SSH' && m && m.reachable && !m.error ? (
                    <>
                        {m.cpu != null && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                                <Cpu className="h-3 w-3 text-muted-foreground/50" />
                                <span>{m.cpu}%</span>
                            </div>
                        )}
                        {m.ram && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                                <MemoryStick className="h-3 w-3 text-muted-foreground/50" />
                                <span>{Math.round(m.ram.percent)}%</span>
                            </div>
                        )}
                        {m.disk && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
                                <HardDrive className="h-3 w-3 text-muted-foreground/50" />
                                <span>{Math.round(m.disk.percent)}%</span>
                            </div>
                        )}
                    </>
                ) : (
                    <span className="text-[11px] text-muted-foreground/60">
                        {server.group?.name || server.description || 'No extra details'}
                    </span>
                )}
            </div>

            <div
                className="flex shrink-0 items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
            >
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onFavorite}
                    className={`h-8 w-8 rounded-lg transition-all ${server.isFavorite ? 'text-yellow-400' : 'text-muted-foreground/30 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100 hover:text-yellow-400'}`}
                >
                    <Star className={`h-3.5 w-3.5 ${server.isFavorite ? 'fill-yellow-400' : ''}`} />
                </Button>
                {server.protocol === 'SSH' && (
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={onSessions}
                        className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-all"
                        title={hasSession ? 'Open Session' : 'Add to Sessions'}
                    >
                        <Layers className="h-3.5 w-3.5" />
                    </Button>
                )}
                <Button onClick={onConnect} size="sm" className="h-8 px-3 text-xs">
                    Connect
                </Button>
                <ServerActionsMenu
                    server={server}
                    onEdit={onEdit}
                    onShare={onShare}
                    onCopyPassword={onCopyPassword}
                    onDelete={onDelete}
                    triggerVariant="ghost"
                    triggerClassName="h-8 w-8 rounded-lg text-muted-foreground/50 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100 hover:text-foreground"
                    iconClassName="h-3.5 w-3.5"
                />
            </div>
        </div>
    );
}
