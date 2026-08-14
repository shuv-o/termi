'use client';

/**
 * Replays an asciicast v2 recording in a fresh, read-only xterm.js instance.
 * No new dependency: asciicast v2 is plain newline-delimited JSON, so a small
 * custom scheduler (setTimeout per event, using the recorded timestamp deltas)
 * is enough — the same terminal library used for live sessions handles the
 * actual rendering.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

import '@xterm/xterm/css/xterm.css';

interface CastEvent {
    t: number; // seconds from recording start
    data: string;
}

function parseCast(content: string): CastEvent[] {
    const events: CastEvent[] = [];
    for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
            const parsed = JSON.parse(line);
            // First line is the asciicast header object, not an event array.
            if (Array.isArray(parsed) && parsed[1] === 'o') {
                events.push({ t: parsed[0], data: parsed[2] });
            }
        } catch {
            /* skip malformed line */
        }
    }
    return events;
}

export default function RecordingPlayer({ content }: { content: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const eventsRef = useRef<CastEvent[]>([]);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cursorRef = useRef(0); // next event index to play
    const elapsedAtPauseRef = useRef(0); // seconds of recording time already played
    const playStartedAtRef = useRef(0); // wall-clock ms when the current play run began

    const [playing, setPlaying] = useState(false);
    const [finished, setFinished] = useState(false);
    const [durationSec, setDurationSec] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;
        const terminal = new Terminal({
            disableStdin: true,
            cursorBlink: false,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            lineHeight: 1.2,
            theme: { background: '#0d1117', foreground: '#c9d1d9' },
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(containerRef.current);
        fit.fit();
        terminalRef.current = terminal;
        const events = parseCast(content);
        eventsRef.current = events;
        setDurationSec(events.at(-1)?.t ?? 0);

        const handleResize = () => fit.fit();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (timerRef.current) clearTimeout(timerRef.current);
            terminal.dispose();
        };
    }, [content]);

    const scheduleNext = useCallback(() => {
        const events = eventsRef.current;
        const terminal = terminalRef.current;
        if (!terminal || cursorRef.current >= events.length) {
            setPlaying(false);
            setFinished(true);
            return;
        }

        const event = events[cursorRef.current];
        const delayMs = Math.max(0, event.t * 1000 - (Date.now() - playStartedAtRef.current));

        timerRef.current = setTimeout(() => {
            terminal.write(event.data);
            cursorRef.current += 1;
            scheduleNext();
        }, delayMs);
    }, []);

    const play = () => {
        if (cursorRef.current >= eventsRef.current.length) return;
        setFinished(false);
        setPlaying(true);
        // playStartedAt is offset so `event.t * 1000 - elapsed` yields the right
        // delay even when resuming partway through.
        playStartedAtRef.current = Date.now() - elapsedAtPauseRef.current * 1000;
        scheduleNext();
    };

    const pause = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        elapsedAtPauseRef.current = (Date.now() - playStartedAtRef.current) / 1000;
        setPlaying(false);
    };

    const restart = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        terminalRef.current?.reset();
        cursorRef.current = 0;
        elapsedAtPauseRef.current = 0;
        setFinished(false);
        play();
    };

    return (
        <div className="space-y-2">
            <div ref={containerRef} className="h-80 rounded-lg overflow-hidden" />
            <div className="flex items-center gap-2">
                {finished ? (
                    <Button size="sm" variant="secondary" onClick={restart} className="gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" /> Replay
                    </Button>
                ) : playing ? (
                    <Button size="sm" variant="secondary" onClick={pause} className="gap-1.5">
                        <Pause className="w-3.5 h-3.5" /> Pause
                    </Button>
                ) : (
                    <Button size="sm" variant="secondary" onClick={play} className="gap-1.5">
                        <Play className="w-3.5 h-3.5" /> Play
                    </Button>
                )}
                <span className="text-xs text-muted-foreground">
                    {durationSec ? `${Math.round(durationSec)}s recording` : ''}
                </span>
            </div>
        </div>
    );
}
