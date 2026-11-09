/**
 * Streaming chat against Anthropic (official SDK) or any OpenAI-compatible
 * Chat Completions endpoint (OpenAI, vLLM, Ollama, LM Studio, proxies).
 */

import Anthropic from '@anthropic-ai/sdk';

import { AiError, checkEndpoint, type AiConfig } from './config';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface StreamRequest {
    config: AiConfig;
    system: string;
    messages: ChatMessage[];
    onText: (text: string) => void;
    signal?: AbortSignal;
}

export interface StreamResult {
    stopReason: string | null;
}

const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 16_000;
const TIMEOUT_MS = 180_000;

/** Claude models the first-party API serves; these get effort and refusal fallbacks. */
const KNOWN_CLAUDE = /^claude-(?:opus-5-5|sonnet-5-5|haiku-5-5|fable-5-1|opus-5)$/;
const FALLBACK_MODELS = new Set([
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-fable-5-1',
    'claude-opus-5',
]);

/** fetch that never follows a redirect: an endpoint can't bounce us elsewhere. */
const noRedirectFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'error' });

async function guardEndpoint(config: AiConfig) {
    // The deployment's own endpoint is the operator's choice; a user's is checked.
    if (config.baseUrl && config.source === 'own') {
        const problem = await checkEndpoint(config.baseUrl);
        if (problem) throw new AiError(problem, 400);
    }
}

// ── Anthropic ────────────────────────────────────────────────────────────────

function anthropicClient(config: AiConfig) {
    if (!config.apiKey) throw new AiError('Add an Anthropic API key to use Claude.', 400);
    // Always explicit: the SDK would otherwise fall back to ANTHROPIC_API_KEY
    // from the environment and bill a user's own requests to the deployment.
    return new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl ?? 'https://api.anthropic.com',
        maxRetries: 2,
        timeout: TIMEOUT_MS,
        fetch: noRedirectFetch,
    });
}

function anthropicError(err: unknown): AiError {
    if (err instanceof AiError) return err;
    if (err instanceof Anthropic.AuthenticationError)
        return new AiError('The Anthropic API key was rejected.', 400);
    if (err instanceof Anthropic.PermissionDeniedError)
        return new AiError('This API key may not use that model.', 400);
    if (err instanceof Anthropic.NotFoundError)
        return new AiError('That model was not found. Check the model name in Settings.', 400);
    if (err instanceof Anthropic.RateLimitError)
        return new AiError(
            'The AI provider is rate limiting requests. Try again in a moment.',
            429,
        );
    if (err instanceof Anthropic.BadRequestError)
        return new AiError(`The AI provider refused the request: ${err.message}`, 400);
    if (err instanceof Anthropic.APIConnectionError)
        return new AiError('Could not reach the AI provider.', 502);
    if (err instanceof Anthropic.APIError)
        return new AiError(`The AI provider returned an error (${err.status ?? 'unknown'}).`, 502);
    return new AiError('The AI request failed.', 502);
}

async function streamAnthropic(req: StreamRequest): Promise<StreamResult> {
    const { config } = req;
    const client = anthropicClient(config);
    const firstParty = !config.baseUrl;
    const known = firstParty && KNOWN_CLAUDE.test(config.model);
    const base = {
        model: config.model,
        max_tokens: MAX_TOKENS,
        system: req.system,
        messages: req.messages,
        // The system prompt (instructions, memory, servers) is stable across
        // turns: cache it.
        ...(firstParty && { cache_control: { type: 'ephemeral' as const } }),
        // Chat answers don't need deep reasoning; keep latency and cost down.
        ...(known && { output_config: { effort: 'medium' as const } }),
    };
    try {
        const stream =
            firstParty && FALLBACK_MODELS.has(config.model)
                ? // A declined request is retried on a suitable model in the same call.
                  client.beta.messages.stream(
                      { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
                      { signal: req.signal },
                  )
                : client.messages.stream(base, { signal: req.signal });
        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                req.onText(event.delta.text);
            }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') {
            req.onText('\n\nThe model declined to answer this request.');
        }
        return { stopReason: final.stop_reason };
    } catch (err) {
        throw anthropicError(err);
    }
}

async function anthropicModels(config: AiConfig): Promise<string[]> {
    const client = anthropicClient(config);
    try {
        const ids: string[] = [];
        for await (const m of client.models.list()) {
            ids.push(m.id);
            if (ids.length >= 200) break;
        }
        return ids;
    } catch (err) {
        throw anthropicError(err);
    }
}

// ── OpenAI-compatible ────────────────────────────────────────────────────────

const openaiBase = (config: AiConfig) =>
    (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');

function openaiHeaders(config: AiConfig): Record<string, string> {
    return {
        'content-type': 'application/json',
        ...(config.apiKey && { authorization: `Bearer ${config.apiKey}` }),
    };
}

async function openaiFailure(res: Response): Promise<AiError> {
    let detail = '';
    try {
        const body = (await res.json()) as { error?: { message?: string } | string };
        detail = typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
    } catch {
        /* not JSON */
    }
    if (res.status === 401) return new AiError('The API key was rejected.', 400);
    if (res.status === 404)
        return new AiError('That model or endpoint was not found. Check Settings.', 400);
    if (res.status === 429)
        return new AiError(
            'The AI provider is rate limiting requests. Try again in a moment.',
            429,
        );
    return new AiError(
        `The AI provider returned an error (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}.`,
        res.status >= 500 ? 502 : 400,
    );
}

async function streamOpenAI(req: StreamRequest): Promise<StreamResult> {
    const { config } = req;
    if (!config.apiKey && !config.baseUrl)
        throw new AiError('Add an OpenAI API key, or the URL of your own endpoint.', 400);
    let res: Response;
    try {
        res = await noRedirectFetch(`${openaiBase(config)}/chat/completions`, {
            method: 'POST',
            headers: openaiHeaders(config),
            body: JSON.stringify({
                model: config.model,
                stream: true,
                ...(process.env.AI_MAX_TOKENS && { max_tokens: MAX_TOKENS }),
                messages: [{ role: 'system', content: req.system }, ...req.messages],
            }),
            signal: req.signal ?? AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        throw new AiError('Could not reach the AI endpoint.', 502);
    }
    if (!res.ok || !res.body) throw await openaiFailure(res);

    let stopReason: string | null = null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') return { stopReason };
            try {
                const chunk = JSON.parse(data) as {
                    choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
                };
                const choice = chunk.choices?.[0];
                if (choice?.delta?.content) req.onText(choice.delta.content);
                if (choice?.finish_reason) stopReason = choice.finish_reason;
            } catch {
                /* keep-alive or partial line */
            }
        }
    }
    return { stopReason };
}

async function openaiModels(config: AiConfig): Promise<string[]> {
    let res: Response;
    try {
        res = await noRedirectFetch(`${openaiBase(config)}/models`, {
            headers: openaiHeaders(config),
            signal: AbortSignal.timeout(20_000),
        });
    } catch {
        throw new AiError('Could not reach the AI endpoint.', 502);
    }
    if (!res.ok) throw await openaiFailure(res);
    const body = (await res.json()) as { data?: { id?: string }[] };
    return (body.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => !!id)
        .sort();
}

// ── Public ───────────────────────────────────────────────────────────────────

export async function streamChat(req: StreamRequest): Promise<StreamResult> {
    await guardEndpoint(req.config);
    return req.config.provider === 'anthropic' ? streamAnthropic(req) : streamOpenAI(req);
}

export async function listModels(config: AiConfig): Promise<string[]> {
    await guardEndpoint(config);
    return config.provider === 'anthropic' ? anthropicModels(config) : openaiModels(config);
}
