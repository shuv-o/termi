'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fillSnippet, snippetVariables, type SnippetVariable } from '@/lib/snippets/variables';

interface RunnableSnippet {
    id: string;
    label: string;
    command: string;
}

const valuesKey = (id: string) => `termi-snippet-vars:${id}`;

function lastValues(id: string): Record<string, string> {
    try {
        return JSON.parse(localStorage.getItem(valuesKey(id)) ?? '{}');
    } catch {
        return {};
    }
}

/**
 * Runs snippets, asking for their `{{variables}}` first. `run(snippet,
 * deliver)` calls `deliver(command)` straight away for a plain snippet, or
 * after the user fills in the values; the last values are remembered per
 * snippet in this browser. Render `dialog` somewhere in the tree.
 */
export function useSnippetRunner() {
    const [pending, setPending] = useState<{
        snippet: RunnableSnippet;
        variables: SnippetVariable[];
        deliver: (command: string) => void;
    } | null>(null);

    const run = useCallback((snippet: RunnableSnippet, deliver: (command: string) => void) => {
        const variables = snippetVariables(snippet.command);
        if (variables.length === 0) deliver(snippet.command);
        else setPending({ snippet, variables, deliver });
    }, []);

    const dialog = pending ? (
        <VariablesDialog
            key={pending.snippet.id}
            snippet={pending.snippet}
            variables={pending.variables}
            onCancel={() => setPending(null)}
            onSubmit={(values) => {
                try {
                    localStorage.setItem(valuesKey(pending.snippet.id), JSON.stringify(values));
                } catch {
                    /* not remembered */
                }
                setPending(null);
                pending.deliver(fillSnippet(pending.snippet.command, values));
            }}
        />
    ) : null;

    return { run, dialog };
}

function VariablesDialog({
    snippet,
    variables,
    onCancel,
    onSubmit,
}: {
    snippet: RunnableSnippet;
    variables: SnippetVariable[];
    onCancel: () => void;
    onSubmit: (values: Record<string, string>) => void;
}) {
    const [values, setValues] = useState<Record<string, string>>(() => {
        const last = lastValues(snippet.id);
        return Object.fromEntries(variables.map((v) => [v.name, last[v.name] ?? v.defaultValue]));
    });
    const preview = fillSnippet(snippet.command, values);

    return (
        <Dialog open onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{snippet.label}</DialogTitle>
                </DialogHeader>
                <form
                    className="space-y-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSubmit(values);
                    }}
                >
                    {variables.map((v, i) => (
                        <div key={v.name} className="space-y-1">
                            <Label htmlFor={`snippet-var-${v.name}`}>{v.name}</Label>
                            <Input
                                id={`snippet-var-${v.name}`}
                                value={values[v.name] ?? ''}
                                onChange={(e) =>
                                    setValues((cur) => ({ ...cur, [v.name]: e.target.value }))
                                }
                                placeholder={v.defaultValue || undefined}
                                autoFocus={i === 0}
                                spellCheck={false}
                                className="font-mono text-sm"
                            />
                        </div>
                    ))}
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-secondary/50 p-2 font-mono text-xs">
                        {preview}
                    </pre>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit">Use command</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
