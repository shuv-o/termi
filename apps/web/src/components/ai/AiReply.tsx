'use client';

import { Fragment } from 'react';
import { Brain, ClipboardPaste, Terminal } from 'lucide-react';

import { CopyTextButton } from '@/components/common/CopyButton';
import { Button } from '@/components/ui/button';
import { displayUserText, visibleText, type AssistantMessage } from '@/lib/ai/useAssistant';

/**
 * One message in an assistant conversation. Replies are rendered from a small
 * subset of Markdown (paragraphs, lists, `code` and fenced blocks) as React
 * text, never as HTML. Code blocks can be copied, or pasted into the terminal
 * without running (`onInsert`).
 */

const FENCE = /```([\w+-]*)\n([\s\S]*?)(?:```|$)/g;

function inline(text: string, key: string) {
    const out: React.ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of text.matchAll(/`([^`\n]+)`|\*\*([^*\n]+)\*\*/g)) {
        if (m.index! > last) out.push(text.slice(last, m.index));
        out.push(
            m[1] !== undefined ? (
                <code
                    key={`${key}-${i++}`}
                    className="data rounded bg-secondary px-1 py-0.5 text-[0.92em]"
                >
                    {m[1]}
                </code>
            ) : (
                <strong key={`${key}-${i++}`}>{m[2]}</strong>
            ),
        );
        last = m.index! + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

function prose(text: string, key: string) {
    return text
        .split(/\n{2,}/)
        .filter((b) => b.trim())
        .map((block, b) => {
            const lines = block.split('\n');
            if (lines.every((l) => /^\s*(?:[-*]|\d+\.)\s+/.test(l))) {
                const ordered = /^\s*\d+\./.test(lines[0]);
                const items = lines.map((l, j) => (
                    <li key={j}>
                        {inline(l.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''), `${key}-${b}-${j}`)}
                    </li>
                ));
                return ordered ? (
                    <ol key={b} className="ml-5 list-decimal space-y-1">
                        {items}
                    </ol>
                ) : (
                    <ul key={b} className="ml-5 list-disc space-y-1">
                        {items}
                    </ul>
                );
            }
            const heading = /^#{1,4}\s+(.*)$/.exec(block);
            if (heading) {
                return (
                    <p key={b} className="font-semibold">
                        {inline(heading[1], `${key}-${b}`)}
                    </p>
                );
            }
            return (
                <p key={b} className="whitespace-pre-wrap">
                    {inline(block, `${key}-${b}`)}
                </p>
            );
        });
}

export function AiReplyText({
    text,
    onInsert,
}: {
    text: string;
    onInsert?: (code: string) => void;
}) {
    const parts: React.ReactNode[] = [];
    let last = 0;
    let n = 0;
    for (const m of text.matchAll(FENCE)) {
        if (m.index! > last)
            parts.push(
                <Fragment key={`p${n}`}>{prose(text.slice(last, m.index), `p${n}`)}</Fragment>,
            );
        const lang = m[1] || 'text';
        const code = m[2].replace(/\n$/, '');
        parts.push(
            <div
                key={`c${n}`}
                className="overflow-hidden rounded-lg border border-border bg-[var(--terminal-bg)]"
            >
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
                    <span className="data text-[11px] text-muted-foreground">{lang}</span>
                    <div className="flex items-center gap-1">
                        {onInsert && !code.includes('\n') && (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => onInsert(code)}
                            >
                                <ClipboardPaste />
                                Paste into terminal
                            </Button>
                        )}
                        <CopyTextButton text={code} label="Copy" />
                    </div>
                </div>
                <pre className="data overflow-x-auto p-3 text-[12.5px] leading-relaxed">{code}</pre>
            </div>,
        );
        last = m.index! + m[0].length;
        n++;
    }
    if (last < text.length)
        parts.push(<Fragment key="tail">{prose(text.slice(last), 'tail')}</Fragment>);
    return <div className="space-y-3 text-sm leading-relaxed">{parts}</div>;
}

export function AiMessageView({
    message,
    onInsert,
}: {
    message: AssistantMessage;
    onInsert?: (code: string) => void;
}) {
    if (message.role === 'user') {
        const { text, hadScreen } = displayUserText(message.content);
        return (
            <div className="ml-auto max-w-[85%] rounded-xl bg-accent px-3.5 py-2.5 text-sm">
                <p className="whitespace-pre-wrap">{text}</p>
                {hadScreen && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Terminal className="h-3.5 w-3.5" />
                        Terminal output attached
                    </p>
                )}
            </div>
        );
    }
    const text = visibleText(message.content);
    return (
        <div className="min-w-0">
            {text ? (
                <AiReplyText text={text} onInsert={onInsert} />
            ) : (
                <p className="text-sm text-muted-foreground">
                    Thinking
                    <span aria-hidden className="cursor-block cursor-waiting" />
                </p>
            )}
            {message.remembered && message.remembered.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Brain className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>Remembered: {message.remembered.join('; ')}</span>
                </p>
            )}
        </div>
    );
}
