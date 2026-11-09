/**
 * POST /api/ai/chat — one turn with the assistant, streamed as newline-
 * delimited JSON events (see ChatEvent in ai.service.ts).
 *
 * Secrets are removed from the message and any terminal text before they
 * reach the provider or the stored history.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { errorResponse, unauthorizedResponse, validateBody } from '@/lib/api';
import { AiError } from '@/lib/ai/config';
import { aiChatRateLimit } from '@/lib/security/rate-limit';
import { chat, type ChatEvent } from '@/lib/services/ai.service';

const schema = z.object({
    conversationId: z.string().min(1).max(64).nullable().optional(),
    message: z.string().trim().min(1, 'Type a message').max(8000, 'That message is too long'),
    screen: z.string().max(50_000).nullable().optional(),
    serverId: z.string().min(1).max(64).nullable().optional(),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    if (!(await aiChatRateLimit(user.id)).allowed) {
        return errorResponse('You are sending messages too quickly. Wait a few minutes.', 429);
    }
    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const emit = (e: ChatEvent) => {
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
                } catch {
                    /* client went away */
                }
            };
            try {
                await chat(user.id, validation.data, emit, request.signal);
            } catch (err) {
                if ((err as Error)?.name !== 'AbortError') {
                    console.error('AI chat error:', err instanceof AiError ? err.message : err);
                    emit({
                        type: 'error',
                        message:
                            err instanceof AiError
                                ? err.message
                                : 'The assistant could not answer. Try again.',
                    });
                }
            } finally {
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            }
        },
    });
    return new Response(stream, {
        headers: {
            'content-type': 'application/x-ndjson; charset=utf-8',
            'cache-control': 'no-store',
            'x-accel-buffering': 'no',
        },
    });
}
