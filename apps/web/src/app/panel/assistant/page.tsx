'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Loader2,
    MessagesSquare,
    Plus,
    SendHorizontal,
    Settings2,
    ShieldCheck,
    Sparkles,
    Square,
    Trash2,
} from 'lucide-react';

import { AiMessageView } from '@/components/ai/AiReply';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useAiStatus, useAssistant } from '@/lib/ai/useAssistant';

interface ConversationItem {
    id: string;
    title: string;
    updatedAt: string;
}

const STARTERS = [
    'Write a systemd service for a Node.js app',
    'How do I find what is filling up my disk?',
    'Harden SSH on a fresh Ubuntu server',
    'Explain this nginx error: 502 Bad Gateway',
];

function AssistantPage() {
    const params = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const { status } = useAiStatus();
    const { conversationId, messages, sending, error, redacted, send, stop, load } = useAssistant();
    const [conversations, setConversations] = useState<ConversationItem[] | null>(null);
    const [draft, setDraft] = useState(() => params.get('q') ?? '');
    const [showList, setShowList] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const refreshList = useCallback(async () => {
        const res = await fetch('/api/ai/conversations');
        const body = await res.json().catch(() => null);
        if (body?.success) setConversations(body.data.conversations);
    }, []);

    useEffect(() => {
        void refreshList();
        const c = params.get('c');
        if (c) void load(c);
        inputRef.current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [messages]);

    const open = (id: string | null) => {
        setShowList(false);
        void load(id);
        router.replace(id ? `/panel/assistant?c=${encodeURIComponent(id)}` : '/panel/assistant');
        inputRef.current?.focus();
    };

    const submit = async (text: string) => {
        if (!text.trim() || sending) return;
        setDraft('');
        const id = await send(text);
        if (id && id !== conversationId) {
            router.replace(`/panel/assistant?c=${encodeURIComponent(id)}`);
        }
        void refreshList();
    };

    const remove = async (id: string) => {
        const res = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            toast('error', 'Could not delete the conversation.');
            return;
        }
        setConversations((list) => list?.filter((c) => c.id !== id) ?? null);
        if (id === conversationId) open(null);
    };

    const notReady = status && !status.available;

    const list = (
        <nav aria-label="Conversations" className="flex min-h-0 flex-1 flex-col">
            <div className="p-3">
                <Button className="w-full" variant="outline" onClick={() => open(null)}>
                    <Plus />
                    New conversation
                </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {conversations === null ? (
                    <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading
                    </p>
                ) : conversations.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                        Your conversations will appear here.
                    </p>
                ) : (
                    <ul className="space-y-0.5">
                        {conversations.map((c) => (
                            <li key={c.id} className="group flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => open(c.id)}
                                    aria-current={c.id === conversationId ? 'page' : undefined}
                                    className={`min-w-0 flex-1 truncate rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                        c.id === conversationId
                                            ? 'bg-accent text-foreground'
                                            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                                    }`}
                                >
                                    {c.title || 'Untitled'}
                                </button>
                                <IconButton
                                    size="sm"
                                    label={`Delete “${c.title}”`}
                                    icon={Trash2}
                                    className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                                    onClick={() => void remove(c.id)}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </nav>
    );

    return (
        <div className="relative flex h-[calc(100dvh-3.5rem)] min-h-0 lg:h-[calc(100vh-var(--shell-top,0px))]">
            <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card md:flex">
                {list}
            </aside>
            {showList && (
                <div className="absolute inset-0 z-30 flex flex-col bg-card md:hidden">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <p className="text-sm font-medium">Conversations</p>
                        <Button size="sm" variant="ghost" onClick={() => setShowList(false)}>
                            Done
                        </Button>
                    </div>
                    {list}
                </div>
            )}

            <section className="relative flex min-w-0 flex-1 flex-col">
                <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                    <IconButton
                        label="Conversations"
                        icon={MessagesSquare}
                        className="md:hidden"
                        onClick={() => setShowList(true)}
                    />
                    <Sparkles className="hidden h-5 w-5 text-primary md:block" />
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base font-semibold">Assistant</h1>
                        {status?.available && (
                            <p className="data truncate text-xs text-muted-foreground">
                                {status.model}
                                {status.source === 'own' ? ' · your key' : ''}
                            </p>
                        )}
                    </div>
                    <IconButton
                        label="AI settings"
                        icon={Settings2}
                        href="/panel/settings?section=ai"
                    />
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
                        {notReady ? (
                            <div className="space-y-3 rounded-xl border border-border bg-card p-6">
                                <p className="font-medium">Set up the assistant</p>
                                <p className="text-sm text-muted-foreground">
                                    {status.problem ??
                                        'Use your own Anthropic or OpenAI key, or any OpenAI-compatible endpoint such as vLLM or Ollama. The person who runs this Termi can also set one up for everyone.'}
                                </p>
                                <Button asChild>
                                    <Link href="/panel/settings?section=ai">Open AI settings</Link>
                                </Button>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="space-y-5 pt-6">
                                <div>
                                    <p className="text-2xl font-semibold tracking-[-0.02em]">
                                        What are you working on?
                                    </p>
                                    <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
                                        Ask about your servers, errors, configs or commands. It
                                        knows your servers by name, never their addresses or
                                        passwords, and remembers what you tell it about your setup.
                                    </p>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {STARTERS.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => void submit(s)}
                                            className="rounded-lg border border-border px-3.5 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((m) => <AiMessageView key={m.id} message={m} />)
                        )}
                        {error && <p className="text-sm text-danger">{error}</p>}
                        <div ref={endRef} />
                    </div>
                </div>

                {!notReady && (
                    <form
                        className="border-t border-border px-4 py-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void submit(draft);
                        }}
                    >
                        <div className="mx-auto w-full max-w-3xl space-y-2">
                            <div className="flex items-end gap-2">
                                <Textarea
                                    ref={inputRef}
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            void submit(draft);
                                        }
                                    }}
                                    rows={2}
                                    placeholder="Message the assistant (Shift+Enter for a new line)"
                                    aria-label="Message the assistant"
                                    className="min-h-[52px] resize-none"
                                />
                                {sending ? (
                                    <Button type="button" variant="outline" onClick={stop}>
                                        <Square />
                                        Stop
                                    </Button>
                                ) : (
                                    <Button type="submit" disabled={!draft.trim()}>
                                        <SendHorizontal />
                                        Send
                                    </Button>
                                )}
                            </div>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                                {redacted > 0
                                    ? `${redacted} secret${redacted === 1 ? '' : 's'} removed before sending.`
                                    : 'Passwords, keys and tokens are removed before anything is sent or saved.'}
                            </p>
                        </div>
                    </form>
                )}
            </section>
        </div>
    );
}

export default function AssistantPageRoute() {
    return (
        <Suspense>
            <AssistantPage />
        </Suspense>
    );
}
