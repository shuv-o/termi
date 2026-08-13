'use client';

import { useEffect, useMemo, useState } from 'react';
import { Globe, Loader2, Monitor, Search, Server, Terminal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import type { ServerItem } from './types';

const protocolMeta: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    SSH: {
        icon: <Terminal className="w-5 h-5" />,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/15 border-emerald-500/20',
    },
    RDP: {
        icon: <Monitor className="w-5 h-5" />,
        color: 'text-blue-400',
        bg: 'bg-blue-500/15 border-blue-500/20',
    },
    VNC: {
        icon: <Globe className="w-5 h-5" />,
        color: 'text-purple-400',
        bg: 'bg-purple-500/15 border-purple-500/20',
    },
};

function ServerPickerCard({
    server,
    onClick,
    disabled,
}: {
    server: ServerItem;
    onClick: () => void;
    disabled?: boolean;
}) {
    const meta = protocolMeta[server.protocol] ?? {
        icon: <Server className="w-5 h-5" />,
        color: 'text-muted-foreground',
        bg: 'bg-secondary/60 border-border',
    };

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`group relative flex flex-col gap-2.5 p-3 rounded-xl border text-left transition-all
                ${
                    disabled
                        ? 'opacity-40 cursor-not-allowed border-border bg-secondary/30'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-secondary/60 hover:shadow-md active:scale-95'
                }`}
        >
            <div
                className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}
            >
                {meta.icon}
            </div>
            <div className="min-w-0 w-full">
                <p className="text-sm font-medium truncate leading-tight">{server.name}</p>
                {server.host && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
                        {server.host}
                    </p>
                )}
            </div>
            <span
                className={`self-start text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${meta.bg} ${meta.color}`}
            >
                {server.protocol}
            </span>
        </button>
    );
}

function ServerGrid({
    title,
    servers,
    onPick,
    disabled,
    className,
}: {
    title: string;
    servers: ServerItem[];
    onPick: (s: ServerItem) => void;
    disabled?: boolean;
    className: string;
}) {
    if (servers.length === 0) return null;
    return (
        <>
            <p
                className={`text-[10px] uppercase tracking-widest font-semibold text-muted-foreground ${className}`}
            >
                {title}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {servers.map((s) => (
                    <ServerPickerCard
                        key={s.id}
                        server={s}
                        onClick={() => onPick(s)}
                        disabled={disabled}
                    />
                ))}
            </div>
        </>
    );
}

/** Server chooser rendered inside the content area rather than as a modal. */
export function InlineSessionPicker({
    onPick,
    onClose,
    canClose,
}: {
    onPick: (server: ServerItem) => void;
    onClose: () => void;
    canClose: boolean;
}) {
    // Shares the dashboard's server-list cache, so opening the picker shows the
    // list instantly instead of spinning through another /api/servers round-trip.
    const { data: serversData, isLoading: loading } = useCachedFetch<{ servers: ServerItem[] }>(
        '/api/servers',
    );
    const servers = useMemo(() => serversData?.servers ?? [], [serversData]);
    const [query, setQuery] = useState('');

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape' && canClose) onClose();
        }

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, canClose]);

    const filtered = servers.filter(
        (s) =>
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            (s.host ?? '').toLowerCase().includes(query.toLowerCase()),
    );
    const sshServers = filtered.filter((s) => s.protocol === 'SSH');
    const otherServers = filtered.filter((s) => s.protocol !== 'SSH');

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-background overflow-hidden">
            <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-border bg-card/40">
                <div className="flex-1">
                    <h2 className="text-base font-semibold">New Session</h2>
                    <p className="text-xs text-muted-foreground">Pick a server to connect to</p>
                </div>
                {canClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="shrink-0 px-5 pt-4 pb-2">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        autoFocus
                        type="text"
                        placeholder="Search servers…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-9 bg-secondary border-transparent focus:border-border text-sm"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-6">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                        <Server className="w-8 h-8 opacity-30" />
                        <p className="text-sm">No servers found</p>
                    </div>
                ) : (
                    <>
                        <ServerGrid
                            title="SSH Servers"
                            servers={sshServers}
                            onPick={onPick}
                            className="pt-2 pb-2"
                        />
                        {/* Only SSH can be opened as a workspace session today. */}
                        <ServerGrid
                            title="Other Protocols"
                            servers={otherServers}
                            onPick={() => {}}
                            disabled
                            className="pt-4 pb-2"
                        />
                    </>
                )}
            </div>
        </div>
    );
}
