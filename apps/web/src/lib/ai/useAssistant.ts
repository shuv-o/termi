'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One assistant conversation in the browser: loads it, sends a message and
 * streams the reply (POST /api/ai/chat, newline-delimited JSON events).
 */

export interface AssistantMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    /** Facts the assistant saved from this reply. */
    remembered?: string[];
    streaming?: boolean;
}

export interface AiStatus {
    available: boolean;
    source: 'own' | 'deployment' | null;
    provider: 'anthropic' | 'openai' | null;
    model: string | null;
    deploymentAvailable: boolean;
    problem: string | null;
}

export function useAiStatus() {
    const [status, setStatus] = useState<AiStatus | null>(null);
    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/ai/status');
            const body = await res.json();
            if (body.success) setStatus(body.data);
        } catch {
            /* offline */
        }
    }, []);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    return { status, refresh };
}

/** Hide memory notes while a reply is still streaming in. */
export function visibleText(raw: string): string {
    return raw
        .replace(/<remember>[\s\S]*?<\/remember>/gi, '')
        .replace(/<remember>[\s\S]*$/i, '')
        .replace(/<(?:r(?:e(?:m(?:e(?:m(?:b(?:e(?:r)?)?)?)?)?)?)?)?$/i, '')
        .trimEnd();
}

/** The user's message as it was stored: the attached screen is shown as a note. */
export function displayUserText(content: string): { text: string; hadScreen: boolean } {
    const i = content.indexOf('\n\n<terminal_output>');
    return i >= 0 ? { text: content.slice(0, i), hadScreen: true } : { text: content, hadScreen: false };
}

export function useAssistant(initialId: string | null = null) {
    const [conversationId, setConversationId] = useState<string | null>(initialId);
    const [messages, setMessages] = useState<AssistantMessage[]>([]);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redacted, setRedacted] = useState(0);
    const abortRef = useRef<AbortController | null>(null);

    const load = useCallback(async (id: string | null) => {
        abortRef.current?.abort();
        setConversationId(id);
        setError(null);
        setRedacted(0);
        if (!id) {
            setMessages([]);
            return;
        }
        const res = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`);
        const body = await res.json();
        if (body.success) setMessages(body.data.conversation.messages);
        else setError(body.error ?? 'Could not open that conversation.');
    }, []);

    const stop = useCallback(() => abortRef.current?.abort(), []);

    const send = useCallback(
        async (
            message: string,
            extra: { screen?: string | null; serverId?: string | null } = {},
        ): Promise<string | null> => {
            const text = message.trim();
            if (!text || sending) return null;
            setSending(true);
            setError(null);
            const controller = new AbortController();
            abortRef.current = controller;
            const replyId = `pending-${Date.now()}`;
            setMessages((m) => [
                ...m,
                {
                    id: `${replyId}-q`,
                    role: 'user',
                    content: extra.screen ? `${text}\n\n<terminal_output>` : text,
                },
                { id: replyId, role: 'assistant', content: '', streaming: true },
            ]);
            let newId = conversationId;
            try {
                const res = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ conversationId, message: text, ...extra }),
                    signal: controller.signal,
                });
                if (!res.ok || !res.body) {
                    const body = await res.json().catch(() => null);
                    throw new Error(body?.error ?? 'The assistant could not answer.');
                }
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let nl: number;
                    while ((nl = buffer.indexOf('\n')) >= 0) {
                        const line = buffer.slice(0, nl);
                        buffer = buffer.slice(nl + 1);
                        if (!line.trim()) continue;
                        const e = JSON.parse(line);
                        if (e.type === 'start') {
                            newId = e.conversationId;
                            setConversationId(e.conversationId);
                            setRedacted(e.redacted);
                        } else if (e.type === 'delta') {
                            setMessages((m) =>
                                m.map((x) => (x.id === replyId ? { ...x, content: x.content + e.text } : x)),
                            );
                        } else if (e.type === 'done') {
                            setMessages((m) =>
                                m.map((x) =>
                                    x.id === replyId
                                        ? { id: e.messageId, role: 'assistant', content: e.text, remembered: e.remembered }
                                        : x,
                                ),
                            );
                        } else if (e.type === 'error') {
                            throw new Error(e.message);
                        }
                    }
                }
            } catch (err) {
                if ((err as Error).name !== 'AbortError') setError((err as Error).message);
            } finally {
                setMessages((m) =>
                    m
                        .map((x) => (x.id === replyId ? { ...x, streaming: false } : x))
                        .filter((x) => !(x.id === replyId && !x.content)),
                );
                setSending(false);
                abortRef.current = null;
            }
            return newId;
        },
        [conversationId, sending],
    );

    return { conversationId, messages, sending, error, redacted, send, stop, load };
}
