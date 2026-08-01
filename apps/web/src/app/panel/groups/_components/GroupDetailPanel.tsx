'use client';

import Link from 'next/link';
import { ArrowRight, Boxes, FolderClosed, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@/lib/format';
import {
    DEFAULT_GROUP_COLOR,
    getIconComponent,
    protocolBreakdown,
    protocolColors,
    protocolIcons,
    type Group,
    type GroupDetail,
    type ServerInGroup,
} from './types';

function NoGroupSelected() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-12">
            <div className="w-20 h-20 rounded-2xl bg-secondary/60 flex items-center justify-center mx-auto mb-5">
                <Boxes className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-semibold text-foreground/70 mb-2">Select a group</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
                Click a group on the left to see its servers and manage settings.
            </p>
        </div>
    );
}

function ServerRow({
    srv,
    onConnect,
}: {
    srv: ServerInGroup;
    onConnect: (serverId: string, protocol: string) => void;
}) {
    const ProtoIcon = protocolIcons[srv.protocol];
    return (
        <div className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/60 transition-colors">
            <div
                className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border ${protocolColors[srv.protocol]}`}
            >
                <ProtoIcon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{srv.name}</span>
                    {srv.isFavorite && <span className="text-yellow-400 text-[10px]">★</span>}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 font-mono">
                    <span className="truncate">
                        {srv.username}@{srv.host}
                    </span>
                    <span>:{srv.port}</span>
                </div>
            </div>
            <div className="hidden sm:block text-[10px] text-muted-foreground/40 w-14 text-right shrink-0">
                {formatRelativeTime(srv.lastUsedAt)}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <Button
                    size="sm"
                    className="h-7 text-xs px-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onConnect(srv.id, srv.protocol)}
                >
                    Connect
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    asChild
                >
                    <Link href={`/panel/servers/${srv.id}`}>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </Button>
            </div>
        </div>
    );
}

function GroupHeader({
    group,
    detail,
    onEdit,
    onDelete,
}: {
    group: Group;
    detail: GroupDetail | null;
    onEdit: (g: Group) => void;
    onDelete: (g: Group) => void;
}) {
    const IconComp = getIconComponent(group.icon);
    const color = group.color || DEFAULT_GROUP_COLOR;
    const breakdown = detail ? protocolBreakdown(detail.servers) : [];
    const totalServers = group._count.servers;

    return (
        <div
            className="px-6 py-5 border-b border-border/60 shrink-0"
            style={{ borderLeftColor: color, borderLeftWidth: 4 }}
        >
            <div className="flex items-start gap-4">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{ backgroundColor: `${color}22`, borderColor: `${color}44` }}
                >
                    <IconComp className="w-6 h-6" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-lg font-bold truncate">{group.name}</h2>
                        <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium border"
                            style={{
                                backgroundColor: `${color}15`,
                                color,
                                borderColor: `${color}30`,
                            }}
                        >
                            {totalServers} {totalServers === 1 ? 'server' : 'servers'}
                        </span>
                    </div>
                    {group.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">{group.description}</p>
                    )}
                    {breakdown.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {breakdown.map(([proto, count]) => (
                                <span
                                    key={proto}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${protocolColors[proto]}`}
                                >
                                    {proto} <span className="opacity-60">×{count}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(group)}
                        className="gap-1.5 text-xs h-8"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(group)}
                        className="gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function GroupDetailPanel({
    group,
    detail,
    loadingDetail,
    onEdit,
    onDelete,
    onConnect,
}: {
    group: Group | null;
    detail: GroupDetail | null;
    loadingDetail: boolean;
    onEdit: (g: Group) => void;
    onDelete: (g: Group) => void;
    onConnect: (serverId: string, protocol: string) => void;
}) {
    if (!group) return <NoGroupSelected />;

    const hasServers = !!detail && detail.servers.length > 0;

    return (
        <div className="flex flex-col h-full min-h-0">
            <GroupHeader group={group} detail={detail} onEdit={onEdit} onDelete={onDelete} />

            <div className="flex-1 overflow-y-auto">
                {loadingDetail ? (
                    <div className="p-6 space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className="flex items-center gap-3 px-3 py-3 rounded-lg bg-secondary/30"
                            >
                                <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-3.5 w-36" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                                <Skeleton className="h-7 w-20" />
                            </div>
                        ))}
                    </div>
                ) : !hasServers ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                        <FolderClosed className="w-10 h-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                            No servers in this group
                        </p>
                        <p className="text-xs text-muted-foreground/60 mb-5">
                            Add servers to this group when creating or editing them.
                        </p>
                        <Button asChild size="sm" variant="secondary">
                            <Link href="/panel/servers/new">
                                <Plus className="w-3.5 h-3.5" />
                                Add a server
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="px-6 pt-4 pb-2">
                            <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                                Servers · {detail!.servers.length}
                            </p>
                        </div>
                        <div className="px-4 pb-4 space-y-1.5">
                            {detail!.servers.map((srv) => (
                                <ServerRow key={srv.id} srv={srv} onConnect={onConnect} />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {hasServers && (
                <div className="px-6 py-4 border-t border-border/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" size="sm" className="gap-1.5 text-xs" asChild>
                            <Link href="/panel/servers/new">
                                <Plus className="w-3.5 h-3.5" />
                                Add Server
                            </Link>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                detail!.servers.forEach((srv) => {
                                    window.open(
                                        `/panel/connect/${srv.id}/${srv.protocol.toLowerCase()}`,
                                        '_blank',
                                    );
                                });
                            }}
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Open all ({detail!.servers.length})
                        </Button>
                        <div className="ml-auto text-[10px] text-muted-foreground/40">
                            Created {formatRelativeTime(group.createdAt)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
