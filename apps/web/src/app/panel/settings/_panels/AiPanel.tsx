'use client';

import { useCallback, useEffect, useState } from 'react';
import { Brain, Check, Loader2, Sparkles, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { IconButton } from '@/components/ui/icon-button';
import { useToast } from '@/components/ui/toast';
import { useAiStatus } from '@/lib/ai/useAssistant';
import { SettingsSection } from '../_components/SettingsSection';

type Provider = 'anthropic' | 'openai';

interface Settings {
    provider: Provider;
    model: string | null;
    baseUrl: string | null;
    hasKey: boolean;
    useOwn: boolean;
    memoryEnabled: boolean;
}

interface Memory {
    id: string;
    content: string;
}

const ENDPOINT_HINT: Record<Provider, string> = {
    anthropic: 'https://api.anthropic.com (leave empty)',
    openai: 'https://api.openai.com/v1, or http://your-vllm:8000/v1',
};

/** Settings → AI assistant: where it runs, its model and key, and its memory. */
export function AiPanel() {
    const { toast } = useToast();
    const { status, refresh: refreshStatus } = useAiStatus();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [suggestions, setSuggestions] = useState<Record<Provider, string[]>>({
        anthropic: [],
        openai: [],
    });
    const [defaults, setDefaults] = useState<Record<Provider, string | null>>({
        anthropic: null,
        openai: null,
    });
    const [form, setForm] = useState({
        provider: 'anthropic' as Provider,
        model: '',
        baseUrl: '',
        apiKey: '',
    });
    const [saving, setSaving] = useState(false);
    const [models, setModels] = useState<string[] | null>(null);
    const [loadingModels, setLoadingModels] = useState(false);
    const [memories, setMemories] = useState<Memory[] | null>(null);

    const apply = useCallback(
        (data: {
            settings: Settings;
            suggestions: Record<Provider, string[]>;
            defaults: Record<Provider, string | null>;
        }) => {
            setSettings(data.settings);
            setSuggestions(data.suggestions);
            setDefaults(data.defaults);
            setForm({
                provider: data.settings.provider,
                model: data.settings.model ?? '',
                baseUrl: data.settings.baseUrl ?? '',
                apiKey: '',
            });
        },
        [],
    );

    const loadMemories = useCallback(async () => {
        const res = await fetch('/api/ai/memory');
        const body = await res.json().catch(() => null);
        if (body?.success) setMemories(body.data.memories);
    }, []);

    useEffect(() => {
        void (async () => {
            const res = await fetch('/api/ai/settings');
            const body = await res.json().catch(() => null);
            if (body?.success) apply(body.data);
        })();
        void loadMemories();
    }, [apply, loadMemories]);

    const save = async (patch: Record<string, unknown>, message = 'AI settings saved.') => {
        setSaving(true);
        try {
            const res = await fetch('/api/ai/settings', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(patch),
            });
            const body = await res.json().catch(() => null);
            if (!body?.success) {
                toast('error', body?.error ?? 'Could not save the AI settings.');
                return false;
            }
            apply(body.data);
            void refreshStatus();
            toast('success', message);
            return true;
        } finally {
            setSaving(false);
        }
    };

    const saveProvider = () =>
        save({
            useOwn: true,
            provider: form.provider,
            model: form.model.trim() || null,
            baseUrl: form.baseUrl.trim() || null,
            ...(form.apiKey.trim() && { apiKey: form.apiKey.trim() }),
        });

    const loadModels = async () => {
        setLoadingModels(true);
        try {
            const res = await fetch('/api/ai/models');
            const body = await res.json().catch(() => null);
            if (body?.success) {
                setModels(body.data.models);
                if (!body.data.models.length) toast('info', 'The provider listed no models.');
            } else {
                toast('error', body?.error ?? 'Could not load models.');
            }
        } finally {
            setLoadingModels(false);
        }
    };

    const forget = async (id: string | null) => {
        const res = await fetch(
            id ? `/api/ai/memory/${encodeURIComponent(id)}` : '/api/ai/memory',
            {
                method: 'DELETE',
            },
        );
        if (res.ok) {
            setMemories((m) => (id ? (m ?? []).filter((x) => x.id !== id) : []));
            if (!id) toast('success', 'The assistant forgot everything it remembered.');
        }
    };

    const clearConversations = async () => {
        if (!window.confirm('Delete every assistant conversation? This cannot be undone.')) return;
        const res = await fetch('/api/ai/conversations', { method: 'DELETE' });
        const body = await res.json().catch(() => null);
        if (body?.success)
            toast(
                'success',
                `Deleted ${body.data.deleted} conversation${body.data.deleted === 1 ? '' : 's'}.`,
            );
    };

    if (!settings) {
        return (
            <SettingsSection
                title="AI assistant"
                icon={Sparkles}
                iconBg="bg-primary/10 text-primary"
            >
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading
                </p>
            </SettingsSection>
        );
    }

    const modelOptions = [...new Set([...(models ?? []), ...suggestions[form.provider]])];
    const defaultModel = defaults[form.provider];

    return (
        <div className="space-y-6">
            <SettingsSection
                title="AI assistant"
                description="Ask about your servers, errors and commands, in the Assistant page or beside any terminal."
                icon={Sparkles}
                iconBg="bg-primary/10 text-primary"
            >
                <div className="space-y-5">
                    <p className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                        {status?.available ? (
                            <>
                                In use: <span className="data">{status.model}</span>{' '}
                                <span className="text-muted-foreground">
                                    (
                                    {status.source === 'own'
                                        ? 'your own settings'
                                        : 'provided by this Termi'}
                                    )
                                </span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">
                                {status?.problem ?? 'Not set up. Choose a provider below.'}
                            </span>
                        )}
                    </p>

                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Which AI to use</legend>
                        <label className="flex items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary/60">
                            <input
                                type="radio"
                                name="ai-source"
                                className="mt-1 accent-[var(--primary)]"
                                checked={!settings.useOwn}
                                disabled={!status?.deploymentAvailable}
                                onChange={() => void save({ useOwn: false })}
                            />
                            <span>
                                <span className="block text-sm">The one this Termi provides</span>
                                <span className="block text-xs text-muted-foreground">
                                    {status?.deploymentAvailable
                                        ? 'Set up by whoever runs this Termi; nothing to configure.'
                                        : 'This Termi has none set up.'}
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary/60">
                            <input
                                type="radio"
                                name="ai-source"
                                className="mt-1 accent-[var(--primary)]"
                                checked={settings.useOwn}
                                onChange={() => setSettings({ ...settings, useOwn: true })}
                            />
                            <span>
                                <span className="block text-sm">My own provider</span>
                                <span className="block text-xs text-muted-foreground">
                                    Anthropic, OpenAI, or any OpenAI-compatible server such as vLLM,
                                    Ollama or LM Studio. Billed to your own key.
                                </span>
                            </span>
                        </label>
                    </fieldset>

                    {settings.useOwn && (
                        <form
                            className="space-y-4 border-t border-border/60 pt-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void saveProvider();
                            }}
                        >
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="ai-provider">Provider</Label>
                                    <Select
                                        value={form.provider}
                                        onValueChange={(v) => {
                                            setForm({
                                                ...form,
                                                provider: v as Provider,
                                                model: '',
                                            });
                                            setModels(null);
                                        }}
                                    >
                                        <SelectTrigger id="ai-provider">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="anthropic">
                                                Anthropic (Claude)
                                            </SelectItem>
                                            <SelectItem value="openai">
                                                OpenAI or OpenAI-compatible
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="ai-model">Model</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="ai-model"
                                            list="ai-model-options"
                                            value={form.model}
                                            onChange={(e) =>
                                                setForm({ ...form, model: e.target.value })
                                            }
                                            placeholder={
                                                defaultModel ??
                                                'The model name, e.g. from List models'
                                            }
                                            className="data"
                                            autoComplete="off"
                                        />
                                        <datalist id="ai-model-options">
                                            {modelOptions.map((m) => (
                                                <option key={m} value={m} />
                                            ))}
                                        </datalist>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={loadingModels || !settings.useOwn}
                                            onClick={() => void loadModels()}
                                        >
                                            {loadingModels ? (
                                                <Loader2 className="animate-spin" />
                                            ) : null}
                                            List models
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Any model name works.{' '}
                                        {defaultModel ? `Empty uses ${defaultModel}. ` : ''}
                                        &ldquo;List models&rdquo; asks the saved provider.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="ai-endpoint">Endpoint (optional)</Label>
                                <Input
                                    id="ai-endpoint"
                                    value={form.baseUrl}
                                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                                    placeholder={ENDPOINT_HINT[form.provider]}
                                    className="data"
                                    autoComplete="off"
                                />
                                <p className="text-xs text-muted-foreground">
                                    For your own server, a proxy or a gateway. Private network
                                    addresses work only if this Termi allows them.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="ai-key">API key</Label>
                                {settings.hasKey && !form.apiKey ? (
                                    <div className="flex items-center gap-2">
                                        <p className="flex flex-1 items-center gap-1.5 text-sm text-muted-foreground">
                                            <Check className="h-4 w-4 text-success" /> Saved,
                                            encrypted. It is never shown again.
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setForm({ ...form, apiKey: ' ' })}
                                        >
                                            Replace
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                void save({ apiKey: null }, 'API key removed.')
                                            }
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                ) : (
                                    <Input
                                        id="ai-key"
                                        type="password"
                                        value={form.apiKey.trim() ? form.apiKey : ''}
                                        onChange={(e) =>
                                            setForm({ ...form, apiKey: e.target.value })
                                        }
                                        placeholder={
                                            form.provider === 'anthropic'
                                                ? 'sk-ant-…'
                                                : 'sk-…, or empty for a server that needs none'
                                        }
                                        autoComplete="off"
                                    />
                                )}
                            </div>

                            <Button type="submit" disabled={saving}>
                                {saving && <Loader2 className="animate-spin" />}
                                Save and use my provider
                            </Button>
                        </form>
                    )}
                </div>
            </SettingsSection>

            <SettingsSection
                title="Memory and history"
                description="The assistant keeps your conversations, and short notes about your setup, so you don't have to repeat yourself. Both are encrypted, and secrets are removed before anything is saved."
                icon={Brain}
                iconBg="bg-primary/10 text-primary"
            >
                <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <label htmlFor="ai-memory" className="text-sm font-medium">
                                Remember things about my setup
                            </label>
                            <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                                Facts like &ldquo;db-primary runs PostgreSQL 16&rdquo; carry over to
                                new conversations.
                            </p>
                        </div>
                        <Switch
                            id="ai-memory"
                            checked={settings.memoryEnabled}
                            onCheckedChange={(v) =>
                                void save(
                                    { memoryEnabled: v },
                                    v ? 'Memory turned on.' : 'Memory turned off.',
                                )
                            }
                        />
                    </div>

                    <div className="border-t border-border/60 pt-4">
                        <p className="text-sm font-medium">What it remembers</p>
                        {memories === null ? (
                            <p className="mt-2 text-xs text-muted-foreground">Loading</p>
                        ) : memories.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">Nothing yet.</p>
                        ) : (
                            <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border">
                                {memories.map((m) => (
                                    <li
                                        key={m.id}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm"
                                    >
                                        <span className="min-w-0 flex-1">{m.content}</span>
                                        <IconButton
                                            size="sm"
                                            label="Forget this"
                                            icon={Trash2}
                                            onClick={() => void forget(m.id)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={!memories?.length}
                            onClick={() => void forget(null)}
                        >
                            Forget everything
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void clearConversations()}
                        >
                            Delete all conversations
                        </Button>
                    </div>
                </div>
            </SettingsSection>
        </div>
    );
}
