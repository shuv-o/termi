'use client';

import { useState } from 'react';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Globe,
    Key,
    Loader2,
    Lock,
    Plus,
    Tag,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    protoColors,
    protocols,
    type Group,
    type ServerFormValues,
    type TestStatus,
} from './types';

const CARD_CLASS = 'border-border hover:border-border/80 transition-all duration-200';
const SECTION_LABEL = 'text-[11px] font-semibold text-muted-foreground uppercase tracking-wider';

/** Collapsible description / tags / notes block. */
export function AdvancedCard({
    form,
    update,
}: {
    form: ServerFormValues;
    update: (fields: Partial<ServerFormValues>) => void;
}) {
    const [open, setOpen] = useState(false);
    const [tagInput, setTagInput] = useState('');

    const addTag = () => {
        const tag = tagInput.trim();
        if (tag && !form.tags.includes(tag)) {
            update({ tags: [...form.tags, tag] });
            setTagInput('');
        }
    };

    return (
        <Card className={`overflow-visible ${CARD_CLASS}`}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between rounded-xl p-4 transition-colors hover:bg-accent/30"
            >
                <span className={SECTION_LABEL}>Advanced</span>
                {open ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
            </button>

            {open && (
                <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Description</Label>
                        <Input
                            type="text"
                            value={form.description}
                            onChange={(e) => update({ description: e.target.value })}
                            className="h-9 bg-secondary text-sm"
                            placeholder="Production web server"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">Tags</Label>
                        <div className="flex gap-2">
                            <Input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTag();
                                    }
                                }}
                                className="h-9 flex-1 bg-secondary text-sm"
                                placeholder="production, linux, aws…"
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={addTag}
                                className="px-3"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        {form.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {form.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                                    >
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                update({
                                                    tags: form.tags.filter((t) => t !== tag),
                                                })
                                            }
                                            className="text-muted-foreground transition-colors hover:text-destructive"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">Notes</Label>
                        <Textarea
                            value={form.notes}
                            onChange={(e) => update({ notes: e.target.value })}
                            className="min-h-[96px] resize-none bg-secondary text-sm"
                            placeholder="Additional notes…"
                        />
                    </div>
                </div>
            )}
        </Card>
    );
}

/** Live card-style preview of what the saved server will look like. */
export function PreviewCard({
    form,
    groups,
    untitledLabel,
}: {
    form: ServerFormValues;
    groups: Group[];
    untitledLabel: string;
}) {
    const proto = protocols.find((p) => p.value === form.protocol)!;
    const ProtoIcon = proto.icon;
    const colors = protoColors[form.protocol];
    const selectedGroup = groups.find((g) => g.id === form.groupId);

    return (
        <Card className={CARD_CLASS}>
            <CardContent className="p-4">
                <p className={`${SECTION_LABEL} mb-3`}>Preview</p>
                <div className="bg-background/60 rounded-lg p-3.5 border border-border/60">
                    <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg border shrink-0 ${colors.pill}`}>
                            <ProtoIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">
                                {form.name || (
                                    <span className="text-muted-foreground font-normal italic">
                                        {untitledLabel}
                                    </span>
                                )}
                            </p>
                            {form.description && (
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                    {form.description}
                                </p>
                            )}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.badge}`}
                                >
                                    {form.protocol}
                                </span>
                                {selectedGroup && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
                                        {selectedGroup.name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {(form.host || form.username) && (
                        <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                            {form.host && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Globe className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                    <span className="font-mono truncate text-foreground/80">
                                        {form.host}:{form.port}
                                    </span>
                                </div>
                            )}
                            {form.username && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {form.authMethod === 'key' ? (
                                        <Key className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                    ) : (
                                        <Lock className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                    )}
                                    <span className="font-mono truncate text-foreground/80">
                                        {form.username}
                                    </span>
                                    <span className="text-muted-foreground/40 text-[10px]">
                                        ({form.authMethod === 'key' ? 'key' : 'password'})
                                    </span>
                                </div>
                            )}
                            {form.tags.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <Tag className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                    {form.tags.map((t) => (
                                        <span
                                            key={t}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground"
                                        >
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

/** "Test connection" button plus its success/failure result. */
export function TestConnectionCard({
    isSSHProto,
    canTest,
    testStatus,
    testResult,
    onTest,
    disabledHint,
}: {
    isSSHProto: boolean;
    canTest: boolean;
    testStatus: TestStatus;
    testResult: { latency?: number; error?: string } | null;
    onTest: () => void;
    disabledHint: string;
}) {
    return (
        <Card className={CARD_CLASS}>
            <CardContent className="p-4">
                <p className={`${SECTION_LABEL} mb-3`}>
                    {isSSHProto ? 'Authentication Test' : 'Connectivity'}
                </p>

                <button
                    type="button"
                    onClick={onTest}
                    disabled={!canTest || testStatus === 'testing'}
                    className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-sm font-medium transition-all duration-200 ${
                        !canTest
                            ? 'border-border text-muted-foreground/40 cursor-not-allowed bg-transparent'
                            : testStatus === 'success'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
                              : testStatus === 'failed'
                                ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/15'
                                : 'border-primary/30 bg-primary/8 text-primary hover:bg-primary/15'
                    }`}
                >
                    {testStatus === 'testing' ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…
                        </>
                    ) : testStatus === 'success' ? (
                        <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Test Again
                        </>
                    ) : testStatus === 'failed' ? (
                        <>
                            <AlertCircle className="w-3.5 h-3.5" /> Retry
                        </>
                    ) : (
                        <>
                            <Activity className="w-3.5 h-3.5" />{' '}
                            {isSSHProto ? 'Test Authentication' : 'Test Connection'}
                        </>
                    )}
                </button>

                {!canTest && (
                    <p className="text-[11px] text-muted-foreground/40 mt-2 text-center">
                        {isSSHProto ? disabledHint : 'Enter host & port first'}
                    </p>
                )}

                {testStatus === 'success' && testResult?.latency !== undefined && (
                    <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                            <p className="text-xs font-medium text-emerald-400">
                                {isSSHProto ? 'Authentication successful' : 'Port reachable'}
                            </p>
                            <p className="text-[11px] text-emerald-500/60">
                                Latency: {testResult.latency}ms
                            </p>
                        </div>
                    </div>
                )}

                {testStatus === 'failed' && testResult?.error && (
                    <div className="mt-3 flex items-start gap-2.5 p-2.5 rounded-lg bg-destructive/8 border border-destructive/20">
                        <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-medium text-destructive">
                                {isSSHProto ? 'Authentication failed' : 'Unreachable'}
                            </p>
                            <p className="text-[11px] text-destructive/60 break-words">
                                {testResult.error}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
