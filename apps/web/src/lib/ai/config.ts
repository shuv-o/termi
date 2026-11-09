/**
 * Which AI provider, model, key and endpoint a request uses.
 *
 * The deployment can offer an assistant to everyone through AI_* environment
 * variables; each user can also bring their own (Settings → AI assistant).
 * A user's own settings win. The deployment key never leaves the server.
 */

import { validateHost } from '@/lib/security/ssrf';

export type AiProvider = 'anthropic' | 'openai';
export const AI_PROVIDERS: AiProvider[] = ['anthropic', 'openai'];

export interface AiConfig {
    provider: AiProvider;
    model: string;
    apiKey: string | null;
    /** A custom endpoint (vLLM, Ollama, a proxy); null = the provider's own API. */
    baseUrl: string | null;
    source: 'own' | 'deployment';
}

/** Used when no model is chosen. OpenAI-compatible servers need one named. */
export const DEFAULT_MODEL: Record<AiProvider, string | null> = {
    anthropic: 'claude-opus-5-5',
    openai: null,
};

/** Offered in the model picker; any other model name works too. */
export const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
    anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
    openai: [],
};

export const PROVIDER_LABEL: Record<AiProvider, string> = {
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI or OpenAI-compatible',
};

const env = (name: string) => process.env[name]?.trim() || null;

export function isProvider(value: unknown): value is AiProvider {
    return typeof value === 'string' && (AI_PROVIDERS as string[]).includes(value);
}

/** The deployment's assistant, or null when none is configured. */
export function deploymentConfig(): AiConfig | null {
    const explicit = env('AI_PROVIDER');
    const provider: AiProvider | null = isProvider(explicit)
        ? explicit
        : env('ANTHROPIC_API_KEY')
          ? 'anthropic'
          : env('OPENAI_API_KEY')
            ? 'openai'
            : null;
    if (!provider) return null;

    const apiKey =
        env('AI_API_KEY') ??
        (provider === 'anthropic' ? env('ANTHROPIC_API_KEY') : env('OPENAI_API_KEY'));
    const baseUrl = env('AI_BASE_URL');
    const model = env('AI_MODEL') ?? DEFAULT_MODEL[provider];
    // A local OpenAI-compatible server may need no key; everything else does.
    if (!model || (!apiKey && !(provider === 'openai' && baseUrl))) return null;
    return { provider, model, apiKey, baseUrl, source: 'deployment' };
}

/**
 * A user-supplied endpoint must be http(s), carry no credentials, and point
 * somewhere Termi may dial — the same rule as any server host. Checked when
 * saved and again before every request (DNS can change in between).
 */
export async function checkEndpoint(baseUrl: string): Promise<string | null> {
    let url: URL;
    try {
        url = new URL(baseUrl);
    } catch {
        return 'Enter a full URL, such as https://api.example.com/v1';
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return 'The endpoint must start with https:// or http://';
    }
    if (url.username || url.password) {
        return 'Put the API key in its own field, not in the URL';
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const result = await validateHost(host, process.env.ALLOW_PRIVATE_NETWORKS === 'true');
    return result.valid ? null : (result.error ?? 'This endpoint is not allowed');
}

/** Thrown with a message that can be shown to the user as is. */
export class AiError extends Error {
    constructor(
        message: string,
        public status = 502,
    ) {
        super(message);
    }
}
