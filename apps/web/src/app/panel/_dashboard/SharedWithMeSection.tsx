'use client';

import { Server, Share2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { protocolIcons, protocolVariants, type ServerItem } from './types';

export type SharedServer = ServerItem & { sharedBy: string; permissions: string };

/** Read-only grid of servers other accounts have shared with this user. */
export function SharedWithMeSection({
    servers,
    onConnect,
}: {
    servers: SharedServer[];
    onConnect: (server: SharedServer) => void;
}) {
    if (servers.length === 0) return null;

    return (
        <div className="mx-auto max-w-screen-2xl space-y-4">
            <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Shared with me
                </h2>
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                    {servers.length}
                </span>
            </div>
            {/* Flex-wrap with per-card widths (not `grid`) so 1-2 shared servers sit
                left-aligned instead of stretching across mostly-empty grid tracks. */}
            <div className="flex flex-wrap gap-4">
                {servers.map((server) => {
                    const Icon = protocolIcons[server.protocol];
                    return (
                        <Card
                            key={server.id}
                            className="flex flex-col overflow-hidden border border-border border-primary/20 bg-card transition-all duration-200 hover:-translate-y-[2px] hover:border-primary/40 hover:shadow-md w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)] xl:w-[calc((100%-3rem)/4)] 2xl:w-[calc((100%-4rem)/5)]"
                        >
                            <div className="p-4 flex-1 space-y-3">
                                <div className="flex items-start gap-3">
                                    <div
                                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${protocolVariants[server.protocol]}`}
                                    >
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold truncate text-sm leading-tight">
                                            {server.name}
                                        </h3>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[10px] text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-md font-medium">
                                                Shared by {server.sharedBy}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-md bg-secondary/60 border border-border/50 px-2.5 py-2 space-y-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Server className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                        <span className="text-[11px] text-foreground/80 font-mono truncate">
                                            {server.host}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/50 shrink-0">
                                            :{server.port}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <User className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                        <span className="text-[11px] text-muted-foreground font-mono truncate">
                                            {server.username}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                    <span
                                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${protocolVariants[server.protocol]}`}
                                    >
                                        {server.protocol}
                                    </span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                                        {server.permissions}
                                    </span>
                                </div>
                            </div>
                            <div className="px-4 pb-4">
                                <Button
                                    size="sm"
                                    className="w-full text-xs"
                                    onClick={() => onConnect(server)}
                                >
                                    Connect
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
