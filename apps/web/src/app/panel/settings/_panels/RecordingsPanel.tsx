'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Play, ScreenShare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCachedFetch } from '@/lib/hooks/useCachedFetch';
import { formatBytes, formatRelativeTime } from '@/lib/format';
import { SettingsSection } from '../_components/SettingsSection';

const RecordingPlayer = dynamic(() => import('@/components/terminal/RecordingPlayer'), {
    ssr: false,
    loading: () => (
        <div className="h-80 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    ),
});

interface RecordingSummary {
    id: string;
    serverId: string | null;
    serverName: string;
    durationSec: number;
    sizeBytes: number;
    createdAt: string;
}

function formatDuration(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s`;
}

function RecordingRow({
    recording,
    onPlay,
    onDelete,
    deleting,
}: {
    recording: RecordingSummary;
    onPlay: () => void;
    onDelete: () => void;
    deleting: boolean;
}) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 border border-border/50">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{recording.serverName}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatRelativeTime(recording.createdAt)} ·{' '}
                    {formatDuration(recording.durationSec)} · {formatBytes(recording.sizeBytes)}
                </p>
            </div>
            <Button variant="secondary" size="sm" onClick={onPlay} className="gap-1.5 shrink-0">
                <Play className="w-3.5 h-3.5" /> Play
            </Button>
            <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={deleting}
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                title="Delete recording"
            >
                {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Trash2 className="w-4 h-4" />
                )}
            </Button>
        </div>
    );
}

export function RecordingsPanel() {
    const { data, mutate } = useCachedFetch<{ recordings: RecordingSummary[] }>(
        '/api/recordings',
    );
    const recordings = data?.recordings ?? [];

    const [playingId, setPlayingId] = useState<string | null>(null);
    const [playingContent, setPlayingContent] = useState<string | null>(null);
    const [loadingPlay, setLoadingPlay] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const play = async (id: string) => {
        setPlayingId(id);
        setLoadingPlay(true);
        try {
            const res = await fetch(`/api/recordings/${id}`);
            const json = await res.json();
            setPlayingContent(json.success ? json.data.recording.content : null);
        } finally {
            setLoadingPlay(false);
        }
    };

    const remove = async (id: string) => {
        setDeletingId(id);
        try {
            await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
            mutate((prev) => ({
                recordings: (prev?.recordings ?? []).filter((r) => r.id !== id),
            }));
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Card className="border-border p-6 transition-all duration-200 hover:border-border/80">
            <SettingsSection
                title="Recordings"
                description="Asciinema-style captures of terminal sessions you recorded, for audit or handoff."
                icon={ScreenShare}
                iconBg="bg-cyan-500/15 text-cyan-400"
            >
                {recordings.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        No recordings yet — use the record button in a terminal session&apos;s
                        toolbar to capture one.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {recordings.map((r) => (
                            <RecordingRow
                                key={r.id}
                                recording={r}
                                onPlay={() => play(r.id)}
                                onDelete={() => remove(r.id)}
                                deleting={deletingId === r.id}
                            />
                        ))}
                    </div>
                )}
            </SettingsSection>

            <Dialog open={playingId !== null} onOpenChange={(v) => !v && setPlayingId(null)}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {recordings.find((r) => r.id === playingId)?.serverName ?? 'Recording'}
                        </DialogTitle>
                    </DialogHeader>
                    {loadingPlay || playingContent === null ? (
                        <div className="h-80 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <RecordingPlayer content={playingContent} />
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
