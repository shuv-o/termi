'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, SendHorizontal, ShieldCheck, Sparkles, Square, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/textarea';
import { useAiStatus, useAssistant } from '@/lib/ai/useAssistant';
import { AiMessageView } from './AiReply';

/**
 * Ask AI, docked beside a terminal. The recent output can be attached (on by
 * default); the server removes secrets before anything leaves Termi. A
 * suggested command is pasted into the terminal without running it.
 */

const QUICK = ['Explain this output', 'Why did the last command fail?', 'How do I fix this?'];

export default function AskAiPanel({
    serverId,
    serverName,
    readScreen,
    onInsert,
    onClose,
}: {
    serverId: string;
    serverName: string;
    readScreen: () => string;
    onInsert: (text: string) => void;
    onClose: () => void;
}) {
    const { status } = useAiStatus();
    const { conversationId, messages, sending, error, redacted, send, stop } = useAssistant();
    const [draft, setDraft] = useState('');
    const [withScreen, setWithScreen] = useState(true);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [messages]);

    const ask = (text: string) => {
        if (!text.trim()) return;
        setDraft('');
        void send(text, { screen: withScreen ? readScreen() : null, serverId });
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-card">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    Ask AI about {serverName}
                </p>
                {conversationId && (
                    <IconButton
                        size="sm"
                        label="Open in Assistant"
                        icon={ExternalLink}
                        href={`/panel/assistant?c=${encodeURIComponent(conversationId)}`}
                    />
                )}
                <IconButton size="sm" label="Close" icon={X} onClick={onClose} />
            </div>

            {status && !status.available ? (
                <div className="space-y-3 p-4 text-sm">
                    <p className="font-medium">The assistant isn&apos;t set up yet</p>
                    <p className="text-muted-foreground">
                        {status.problem ??
                            'Add your own Anthropic or OpenAI key (or a compatible endpoint) in Settings, or ask the person who runs this Termi to set one up for everyone.'}
                    </p>
                    <Button size="sm" asChild>
                        <Link href="/panel/settings?section=ai">Set up the assistant</Link>
                    </Button>
                </div>
            ) : (
                <>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
                        {messages.length === 0 && (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Ask about what&apos;s on screen, or describe what you want to do
                                    and get the command for it.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {QUICK.map((q) => (
                                        <button
                                            key={q}
                                            type="button"
                                            onClick={() => ask(q)}
                                            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {messages.map((m) => (
                            <AiMessageView key={m.id} message={m} onInsert={onInsert} />
                        ))}
                        {error && <p className="text-sm text-danger">{error}</p>}
                        <div ref={endRef} />
                    </div>

                    <form
                        className="space-y-2 border-t border-border p-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            ask(draft);
                        }}
                    >
                        <Textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    ask(draft);
                                }
                            }}
                            rows={2}
                            placeholder="Ask, or describe a command you need"
                            aria-label="Message the assistant"
                            className="resize-none text-sm"
                        />
                        <div className="flex items-center gap-2">
                            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={withScreen}
                                    onCheckedChange={(v) => setWithScreen(v === true)}
                                />
                                Include terminal output
                            </label>
                            {sending ? (
                                <Button type="button" size="sm" variant="outline" onClick={stop}>
                                    <Square />
                                    Stop
                                </Button>
                            ) : (
                                <Button type="submit" size="sm" disabled={!draft.trim()}>
                                    <SendHorizontal />
                                    Send
                                </Button>
                            )}
                        </div>
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                            {redacted > 0
                                ? `${redacted} secret${redacted === 1 ? '' : 's'} removed before sending.`
                                : 'Passwords and keys are removed before anything is sent.'}
                        </p>
                    </form>
                </>
            )}
        </div>
    );
}
