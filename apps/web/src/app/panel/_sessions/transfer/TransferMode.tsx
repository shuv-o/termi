'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowRightLeft, Loader2, Zap } from 'lucide-react';
import FileManagerPanel, { type RemoteEntry } from '@/components/scp/FileManagerPanel';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatBytes } from '@/lib/format';
import { TransferQueuePanel } from './TransferQueuePanel';
import { useTransferQueue, type TransferDirection } from './useTransferQueue';
import type { ServerItem } from '../types';

function ServerSelector({
    label,
    serverId,
    setServerId,
    servers,
}: {
    label: string;
    serverId: string;
    setServerId: (id: string) => void;
    servers: ServerItem[];
}) {
    const serverName = servers.find((s) => s.id === serverId)?.name ?? serverId;
    return (
        <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0 w-6">
                {label}
            </span>
            {serverId ? (
                <Select value={serverId} onValueChange={setServerId}>
                    <SelectTrigger className="h-7 text-xs bg-secondary border-border max-w-[160px]">
                        <SelectValue>{serverName}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                        {servers.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">
                                {s.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (
                <span className="text-xs text-muted-foreground">No SSH servers</span>
            )}
        </div>
    );
}

/** One of the two big arrow buttons in the desktop centre column. */
function TransferArrow({
    direction,
    fileCount,
    bytes,
    activeDir,
    onClick,
}: {
    direction: TransferDirection;
    fileCount: number;
    bytes: number;
    activeDir: TransferDirection | null;
    onClick: () => void;
}) {
    const enabled = fileCount > 0 && !activeDir;
    const Arrow = direction === 'lr' ? ArrowRight : ArrowLeft;

    return (
        <div className="flex flex-col items-center gap-1.5">
            <button
                onClick={onClick}
                disabled={!!activeDir || fileCount === 0}
                className={`relative flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all
                    ${
                        enabled
                            ? 'bg-primary/20 border-primary/40 text-primary hover:bg-primary/30 hover:scale-105'
                            : 'bg-secondary/40 border-border/50 text-muted-foreground opacity-40 cursor-not-allowed'
                    }`}
                title={
                    direction === 'lr' ? 'Transfer selected → right' : 'Transfer selected ← left'
                }
            >
                {activeDir === direction ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Arrow className="w-4 h-4" />
                )}
                {fileCount > 0 && (
                    <span className="text-[9px] font-bold leading-none">{fileCount}</span>
                )}
            </button>
            {fileCount > 0 && (
                <span className="text-[9px] text-muted-foreground">{formatBytes(bytes, '—')}</span>
            )}
        </div>
    );
}

function NoServersPlaceholder() {
    return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No SSH servers available</p>
        </div>
    );
}

/** Two-pane server-to-server file transfer view. */
export function TransferMode({ servers }: { servers: ServerItem[] }) {
    const [leftId, setLeftIdRaw] = useState(() => servers[0]?.id ?? '');
    const [rightId, setRightIdRaw] = useState(() => servers[1]?.id ?? servers[0]?.id ?? '');
    const [leftPath, setLeftPath] = useState('/');
    const [rightPath, setRightPath] = useState('/');
    const [leftSelected, setLeftSelected] = useState<RemoteEntry[]>([]);
    const [rightSelected, setRightSelected] = useState<RemoteEntry[]>([]);
    const [queueOpen, setQueueOpen] = useState(true);
    const [mobilePanel, setMobilePanel] = useState<'left' | 'right'>('left');

    const transfer = useTransferQueue();

    // Sync server ids when server list changes (initial load)
    useEffect(() => {
        if (!leftId && servers.length > 0) setLeftIdRaw(servers[0].id);
        if (!rightId && servers.length > 1) setRightIdRaw(servers[1].id);
        else if (!rightId && servers.length === 1) setRightIdRaw(servers[0].id);
    }, [servers, leftId, rightId]);

    const setLeftId = useCallback((id: string) => {
        setLeftIdRaw(id);
        setLeftSelected([]);
    }, []);
    const setRightId = useCallback((id: string) => {
        setRightIdRaw(id);
        setRightSelected([]);
    }, []);

    const onLeftChange = useCallback((sel: RemoteEntry[], path: string) => {
        setLeftSelected(sel);
        setLeftPath(path);
    }, []);
    const onRightChange = useCallback((sel: RemoteEntry[], path: string) => {
        setRightSelected(sel);
        setRightPath(path);
    }, []);

    function swap() {
        setLeftIdRaw(rightId);
        setRightIdRaw(leftId);
        setLeftSelected([]);
        setRightSelected([]);
    }

    // Directories can't be transferred, only their files.
    const leftFiles = leftSelected.filter((e) => e.type !== 'dir');
    const rightFiles = rightSelected.filter((e) => e.type !== 'dir');
    const leftBytes = leftFiles.reduce((s, e) => s + e.size, 0);
    const rightBytes = rightFiles.reduce((s, e) => s + e.size, 0);

    const doTransfer = (direction: TransferDirection) => {
        setQueueOpen(true);
        void transfer.start(direction, {
            files: direction === 'lr' ? leftFiles : rightFiles,
            fromServerId: direction === 'lr' ? leftId : rightId,
            toServerId: direction === 'lr' ? rightId : leftId,
            toPath: direction === 'lr' ? rightPath : leftPath,
        });
    };

    const hasNoServers = servers.length === 0;
    const { activeDir } = transfer;

    return (
        <div className="absolute inset-0 flex flex-col">
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-card/60">
                <ServerSelector
                    label="FROM"
                    serverId={leftId}
                    setServerId={setLeftId}
                    servers={servers}
                />
                <button
                    onClick={swap}
                    disabled={!!activeDir}
                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    title="Swap servers"
                >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                </button>
                <ServerSelector
                    label="TO"
                    serverId={rightId}
                    setServerId={setRightId}
                    servers={servers}
                />
            </div>

            {/* Mobile: tab bar to switch between left/right panels */}
            <div className="md:hidden shrink-0 flex border-b border-border">
                <button
                    onClick={() => setMobilePanel('left')}
                    className={`flex-1 py-2 text-xs font-medium truncate px-3 transition-colors border-b-2 ${mobilePanel === 'left' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
                >
                    {servers.find((s) => s.id === leftId)?.name ?? 'Source'}
                </button>
                <button
                    onClick={() => setMobilePanel('right')}
                    className={`flex-1 py-2 text-xs font-medium truncate px-3 transition-colors border-b-2 ${mobilePanel === 'right' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'}`}
                >
                    {servers.find((s) => s.id === rightId)?.name ?? 'Destination'}
                </button>
            </div>

            {/* Mobile: single active panel */}
            <div className="md:hidden flex flex-1 min-h-0 overflow-hidden flex-col">
                {hasNoServers ? (
                    <NoServersPlaceholder />
                ) : mobilePanel === 'left' && leftId ? (
                    <FileManagerPanel
                        key={leftId}
                        serverId={leftId}
                        onSelectionChange={onLeftChange}
                    />
                ) : mobilePanel === 'right' && rightId ? (
                    <FileManagerPanel
                        key={rightId}
                        serverId={rightId}
                        onSelectionChange={onRightChange}
                    />
                ) : null}
            </div>

            {/* Mobile: transfer action bar */}
            <div className="md:hidden shrink-0 flex items-center justify-center gap-3 px-3 py-2 border-t border-border bg-card/60">
                <button
                    onClick={() => doTransfer('rl')}
                    disabled={!!activeDir || rightFiles.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${rightFiles.length > 0 && !activeDir ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-secondary/40 border-border/50 text-muted-foreground opacity-40 cursor-not-allowed'}`}
                >
                    {activeDir === 'rl' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <ArrowLeft className="w-3.5 h-3.5" />
                    )}
                    Send left {rightFiles.length > 0 ? `(${rightFiles.length})` : ''}
                </button>
                <button
                    onClick={() => doTransfer('lr')}
                    disabled={!!activeDir || leftFiles.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${leftFiles.length > 0 && !activeDir ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-secondary/40 border-border/50 text-muted-foreground opacity-40 cursor-not-allowed'}`}
                >
                    Send right {leftFiles.length > 0 ? `(${leftFiles.length})` : ''}
                    {activeDir === 'lr' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                    )}
                </button>
            </div>

            {/* Desktop: side-by-side panels */}
            <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {hasNoServers ? (
                        <NoServersPlaceholder />
                    ) : leftId ? (
                        <FileManagerPanel
                            key={leftId}
                            serverId={leftId}
                            onSelectionChange={onLeftChange}
                        />
                    ) : null}
                </div>

                <div className="shrink-0 w-20 flex flex-col items-center justify-center gap-4 border-x border-border bg-card/30 py-4">
                    <TransferArrow
                        direction="lr"
                        fileCount={leftFiles.length}
                        bytes={leftBytes}
                        activeDir={activeDir}
                        onClick={() => doTransfer('lr')}
                    />
                    <TransferArrow
                        direction="rl"
                        fileCount={rightFiles.length}
                        bytes={rightBytes}
                        activeDir={activeDir}
                        onClick={() => doTransfer('rl')}
                    />

                    {activeDir && (
                        <div className="flex flex-col items-center gap-1">
                            <Zap className="w-3.5 h-3.5 text-primary animate-pulse" />
                            <span className="text-[9px] text-primary font-medium">Live</span>
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {hasNoServers ? (
                        <NoServersPlaceholder />
                    ) : rightId ? (
                        <FileManagerPanel
                            key={rightId}
                            serverId={rightId}
                            onSelectionChange={onRightChange}
                        />
                    ) : null}
                </div>
            </div>

            <TransferQueuePanel
                queue={transfer.queue}
                open={queueOpen}
                onToggle={() => setQueueOpen((o) => !o)}
                isTransferring={!!activeDir}
                doneItems={transfer.doneItems}
                totalItems={transfer.totalItems}
                failedItems={transfer.failedItems}
                onRetry={transfer.retryFailed}
                onClear={transfer.clear}
            />
        </div>
    );
}
