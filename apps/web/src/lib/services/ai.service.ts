/**
 * The AI assistant: settings, conversations, memory and the chat turn.
 *
 * Nothing reaches a provider or the stored history before `redact` has
 * removed every secret Termi knows for the user (server and saved-login
 * passwords, keys, passphrases, their AI key) and this server's own secrets,
 * plus anything that looks like a secret. Server context is names, kinds,
 * groups and tags only. Stored text is encrypted to its owner.
 */

import { prisma } from '@/lib/db';
import { decryptCredentials, openField, sealField } from '@/lib/crypto';
import {
    AiError,
    checkEndpoint,
    DEFAULT_MODEL,
    deploymentConfig,
    isProvider,
    type AiConfig,
    type AiProvider,
} from '@/lib/ai/config';
import { listModels, streamChat, type ChatMessage } from '@/lib/ai/providers';
import { redact } from '@/lib/ai/redact';
import {
    buildSystemPrompt,
    extractMemories,
    titleFrom,
    userTurn,
    type ServerBrief,
} from '@/lib/ai/prompt';

const HISTORY_TURNS = 20;
const MAX_MEMORIES = 50;

// ── Settings ─────────────────────────────────────────────────────────────────

export interface AiSettingsView {
    provider: AiProvider;
    model: string | null;
    baseUrl: string | null;
    hasKey: boolean;
    useOwn: boolean;
    memoryEnabled: boolean;
}

export async function getAiSettings(userId: string): Promise<AiSettingsView> {
    const s = await prisma.aiSettings.findUnique({ where: { userId } });
    return {
        provider: isProvider(s?.provider) ? s.provider : 'anthropic',
        model: s?.model ?? null,
        baseUrl: s?.baseUrl ?? null,
        hasKey: !!s?.apiKey,
        useOwn: s?.useOwn ?? false,
        memoryEnabled: s?.memoryEnabled ?? true,
    };
}

export interface AiSettingsInput {
    provider?: AiProvider;
    model?: string | null;
    baseUrl?: string | null;
    /** A new key; null removes it; undefined keeps the stored one. */
    apiKey?: string | null;
    useOwn?: boolean;
    memoryEnabled?: boolean;
}

export async function saveAiSettings(userId: string, input: AiSettingsInput) {
    if (input.baseUrl) {
        const problem = await checkEndpoint(input.baseUrl);
        if (problem) throw new AiError(problem, 400);
    }
    const data = {
        ...(input.provider !== undefined && { provider: input.provider }),
        ...(input.model !== undefined && { model: input.model?.trim() || null }),
        ...(input.baseUrl !== undefined && { baseUrl: input.baseUrl?.trim() || null }),
        ...(input.useOwn !== undefined && { useOwn: input.useOwn }),
        ...(input.memoryEnabled !== undefined && { memoryEnabled: input.memoryEnabled }),
        ...(input.apiKey !== undefined && {
            apiKey: input.apiKey
                ? sealField(input.apiKey.trim(), 'AiSettings', 'apiKey', userId)
                : null,
        }),
    };
    await prisma.aiSettings.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
    });
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'AI_SETTINGS_UPDATED',
            details: {
                provider: input.provider,
                useOwn: input.useOwn,
                keyChanged: input.apiKey !== undefined,
            },
        },
    });
    return getAiSettings(userId);
}

/** The provider this user's requests go to, or null when there is none. */
export async function resolveAiConfig(userId: string): Promise<AiConfig | null> {
    const s = await prisma.aiSettings.findUnique({ where: { userId } });
    if (s?.useOwn && isProvider(s.provider)) {
        const model = s.model || DEFAULT_MODEL[s.provider];
        if (!model) throw new AiError('Choose a model for your AI provider in Settings.', 400);
        return {
            provider: s.provider,
            model,
            apiKey: s.apiKey ? openField(s.apiKey, 'AiSettings', 'apiKey', userId) : null,
            baseUrl: s.baseUrl,
            source: 'own',
        };
    }
    return deploymentConfig();
}

export async function aiStatus(userId: string) {
    const deployment = deploymentConfig();
    let config: AiConfig | null = null;
    let problem: string | null = null;
    try {
        config = await resolveAiConfig(userId);
    } catch (err) {
        problem = err instanceof AiError ? err.message : 'AI settings are incomplete.';
    }
    return {
        available: !!config,
        source: config?.source ?? null,
        provider: config?.provider ?? null,
        model: config?.model ?? null,
        deploymentAvailable: !!deployment,
        problem,
    };
}

export async function modelsFor(userId: string): Promise<string[]> {
    const config = await resolveAiConfig(userId);
    if (!config) throw new AiError('No AI provider is set up.', 400);
    return listModels(config);
}

// ── Secrets and context ──────────────────────────────────────────────────────

const SERVER_SECRET_ENV = [
    'SESSION_SECRET',
    'ENCRYPTION_KEY',
    'ENCRYPTION_KEY_PREVIOUS',
    'GATEWAY_JWT_SECRET',
    'DB_PASSWORD',
    'SMTP_PASS',
    'GOOGLE_CLIENT_SECRET',
    'OIDC_CLIENT_SECRET',
    'VAPID_PRIVATE_KEY',
    'AI_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'STATS_TOKEN',
];

/** Every secret Termi holds for this user, plus this server's own. */
export async function knownSecrets(userId: string): Promise<string[]> {
    const out: string[] = [];
    const add = (v: string | null | undefined) => {
        if (!v) return;
        out.push(v);
        // Keys are often shown line by line; catch their lines too.
        if (v.includes('\n')) out.push(...v.split('\n').filter((l) => l.trim().length >= 16));
    };

    const [servers, logins, settings] = await Promise.all([
        prisma.server.findMany({
            where: { userId },
            select: {
                host: true,
                username: true,
                password: true,
                privateKey: true,
                passphrase: true,
                notes: true,
            },
        }),
        prisma.keychainCredential.findMany({
            where: { userId },
            select: { password: true, privateKey: true, passphrase: true },
        }),
        prisma.aiSettings.findUnique({ where: { userId }, select: { apiKey: true } }),
    ]);

    for (const s of servers) {
        try {
            const c = decryptCredentials(
                {
                    host: s.host,
                    username: s.username,
                    password: s.password || undefined,
                    privateKey: s.privateKey || undefined,
                    passphrase: s.passphrase || undefined,
                    notes: undefined,
                },
                userId,
            );
            add(c.password);
            add(c.privateKey);
            add(c.passphrase);
        } catch {
            /* unreadable values can't leak either */
        }
    }
    for (const l of logins) {
        for (const field of ['password', 'privateKey', 'passphrase'] as const) {
            const v = l[field];
            if (!v) continue;
            try {
                add(openField(v, 'KeychainCredential', field, userId));
            } catch {
                /* skip */
            }
        }
    }
    if (settings?.apiKey) {
        try {
            add(openField(settings.apiKey, 'AiSettings', 'apiKey', userId));
        } catch {
            /* skip */
        }
    }
    for (const name of SERVER_SECRET_ENV) {
        for (const v of (process.env[name] ?? '').split(',')) add(v.trim());
    }
    return out;
}

/** Names, kinds, groups and tags of the servers the user can open. Nothing else. */
async function serverBriefs(userId: string): Promise<ServerBrief[]> {
    const brief = {
        name: true,
        protocol: true,
        tags: true,
        group: { select: { name: true } },
    } as const;
    const [owned, shared, team] = await Promise.all([
        prisma.server.findMany({
            where: { userId },
            select: brief,
            orderBy: { name: 'asc' },
            take: 100,
        }),
        prisma.serverShare.findMany({
            where: { sharedWithId: userId },
            select: { server: { select: brief } },
            take: 50,
        }),
        prisma.teamServer.findMany({
            where: { team: { members: { some: { userId } } }, server: { userId: { not: userId } } },
            select: { server: { select: brief } },
            take: 50,
        }),
    ]);
    const map = (s: (typeof owned)[number], sharedWith = false): ServerBrief => ({
        name: s.name,
        protocol: s.protocol,
        group: s.group?.name ?? null,
        tags: s.tags,
        shared: sharedWith,
    });
    const seen = new Set<string>();
    return [
        ...owned.map((s) => map(s)),
        ...shared.map((x) => map(x.server, true)),
        ...team.map((x) => map(x.server, true)),
    ].filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
}

// ── Conversations ────────────────────────────────────────────────────────────

const open = (
    v: string,
    model: 'AiConversation' | 'AiMessage' | 'AiMemory',
    field: string,
    userId: string,
) => {
    try {
        return openField(v, model, field, userId);
    } catch {
        return '';
    }
};

export async function listConversations(userId: string) {
    const rows = await prisma.aiConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: { id: true, title: true, updatedAt: true },
    });
    return rows.map((r) => ({
        id: r.id,
        title: open(r.title, 'AiConversation', 'title', userId),
        updatedAt: r.updatedAt,
    }));
}

export async function getConversation(userId: string, id: string) {
    const conv = await prisma.aiConversation.findFirst({
        where: { id, userId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) return null;
    return {
        id: conv.id,
        title: open(conv.title, 'AiConversation', 'title', userId),
        messages: conv.messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: open(m.content, 'AiMessage', 'content', userId),
            createdAt: m.createdAt,
        })),
    };
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.aiConversation.deleteMany({ where: { id, userId } });
    return count > 0;
}

export async function deleteAllConversations(userId: string): Promise<number> {
    const { count } = await prisma.aiConversation.deleteMany({ where: { userId } });
    return count;
}

// ── Memory ───────────────────────────────────────────────────────────────────

export async function listMemories(userId: string) {
    const rows = await prisma.aiMemory.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
        id: m.id,
        content: open(m.content, 'AiMemory', 'content', userId),
        createdAt: m.createdAt,
    }));
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.aiMemory.deleteMany({ where: { id, userId } });
    return count > 0;
}

export async function clearMemories(userId: string): Promise<number> {
    const { count } = await prisma.aiMemory.deleteMany({ where: { userId } });
    return count;
}

async function remember(userId: string, facts: string[], secrets: string[]): Promise<string[]> {
    const saved: string[] = [];
    const existing = new Set((await listMemories(userId)).map((m) => m.content.toLowerCase()));
    for (const fact of facts) {
        const clean = redact(fact, secrets);
        // A fact that needed redaction was about a secret: don't keep it at all.
        if (clean.count > 0 || existing.has(clean.text.toLowerCase())) continue;
        await prisma.aiMemory.create({
            data: { userId, content: sealField(clean.text, 'AiMemory', 'content', userId) },
        });
        saved.push(clean.text);
    }
    // Keep the newest MAX_MEMORIES.
    const extra = await prisma.aiMemory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: MAX_MEMORIES,
        select: { id: true },
    });
    if (extra.length)
        await prisma.aiMemory.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
    return saved;
}

// ── A chat turn ──────────────────────────────────────────────────────────────

export interface ChatInput {
    conversationId?: string | null;
    message: string;
    /** Terminal text the user chose to include (Ask AI in a terminal). */
    screen?: string | null;
    /** The server the terminal is connected to, if any. */
    serverId?: string | null;
}

export type ChatEvent =
    | { type: 'start'; conversationId: string; redacted: number }
    | { type: 'delta'; text: string }
    | { type: 'done'; messageId: string; text: string; remembered: string[] }
    | { type: 'error'; message: string };

export async function chat(
    userId: string,
    input: ChatInput,
    emit: (e: ChatEvent) => void,
    signal?: AbortSignal,
): Promise<void> {
    const config = await resolveAiConfig(userId);
    if (!config)
        throw new AiError('No AI provider is set up. Add one in Settings → AI assistant.', 400);

    const [secrets, settings] = await Promise.all([knownSecrets(userId), getAiSettings(userId)]);
    const msg = redact(input.message, secrets);
    const screen = input.screen ? redact(input.screen, secrets) : null;
    const redactedCount = msg.count + (screen?.count ?? 0);

    // The conversation: continue the user's own, or start one.
    let conversationId = input.conversationId ?? null;
    if (conversationId) {
        const owned = await prisma.aiConversation.findFirst({
            where: { id: conversationId, userId },
            select: { id: true },
        });
        if (!owned) throw new AiError('Conversation not found.', 404);
    } else {
        const created = await prisma.aiConversation.create({
            data: {
                userId,
                title: sealField(titleFrom(msg.text), 'AiConversation', 'title', userId),
            },
        });
        conversationId = created.id;
    }
    emit({ type: 'start', conversationId, redacted: redactedCount });

    const history = await prisma.aiMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_TURNS,
    });
    const messages: ChatMessage[] = history
        .reverse()
        .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: open(m.content, 'AiMessage', 'content', userId),
        }))
        .filter((m) => m.content);

    let activeServer: string | null = null;
    if (input.serverId) {
        const s = await prisma.server.findFirst({
            where: {
                id: input.serverId,
                OR: [
                    { userId },
                    { shares: { some: { sharedWithId: userId } } },
                    { teams: { some: { team: { members: { some: { userId } } } } } },
                ],
            },
            select: { name: true },
        });
        activeServer = s?.name ?? null;
    }

    const [servers, memories] = await Promise.all([
        serverBriefs(userId),
        settings.memoryEnabled ? listMemories(userId) : Promise.resolve([]),
    ]);
    // Names and memories are user-written too: redact them like everything else.
    const system = redact(
        buildSystemPrompt({
            memories: memories.map((m) => m.content),
            memoryEnabled: settings.memoryEnabled,
            servers,
            activeServer,
        }),
        secrets,
    ).text;

    const turn = userTurn(msg.text, screen?.text);
    messages.push({ role: 'user', content: turn });
    await prisma.aiMessage.create({
        data: {
            conversationId,
            userId,
            role: 'user',
            content: sealField(turn, 'AiMessage', 'content', userId),
        },
    });

    let reply = '';
    await streamChat({
        config,
        system,
        messages,
        signal,
        onText: (t) => {
            reply += t;
            emit({ type: 'delta', text: t });
        },
    });

    const { text, memories: facts } = extractMemories(reply);
    // The model never saw a secret, but its reply is redacted too before storing.
    const stored = redact(text, secrets).text;
    const saved = await prisma.aiMessage.create({
        data: {
            conversationId,
            userId,
            role: 'assistant',
            content: sealField(stored, 'AiMessage', 'content', userId),
        },
    });
    await prisma.aiConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
    });
    const remembered =
        settings.memoryEnabled && facts.length ? await remember(userId, facts, secrets) : [];
    emit({ type: 'done', messageId: saved.id, text: stored, remembered });
}
