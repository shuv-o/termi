/**
 * The AI assistant never sends or stores a secret, never hands out an API
 * key, and keeps each person's conversations and memory to themselves.
 *
 * A fake OpenAI-compatible provider, started here, records every request
 * Termi makes to it, so the tests check exactly what would leave the server.
 */
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { expect, test } from '@playwright/test';
import { SSH_PASSWORD } from './env';
import { signedIn } from './helpers';

test.describe.configure({ mode: 'serial' });

let provider: Server;
let endpoint = '';
const received: string[] = [];
let nextReply = 'Use `df -h` to see disk usage.';

test.beforeAll(async () => {
    provider = createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            if (req.url?.endsWith('/models')) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ data: [{ id: 'fake-model' }] }));
                return;
            }
            received.push(body);
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            for (const piece of nextReply.match(/.{1,12}/gs) ?? []) {
                res.write(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
                );
            }
            res.write('data: [DONE]\n\n');
            res.end();
        });
    });
    await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
    endpoint = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;

    const alice = await signedIn('alice');
    const res = await alice.put('/api/ai/settings', {
        data: {
            useOwn: true,
            provider: 'openai',
            model: 'fake-model',
            baseUrl: endpoint,
            apiKey: 'sk-test-alice-key-1234567890',
            memoryEnabled: true,
        },
    });
    expect(res.status()).toBe(200);
});

test.afterAll(async () => {
    const alice = await signedIn('alice');
    await alice.delete('/api/ai/conversations');
    await alice.delete('/api/ai/memory');
    await alice.put('/api/ai/settings', { data: { useOwn: false, apiKey: null } });
    const bob = await signedIn('bob');
    await bob.put('/api/ai/settings', { data: { useOwn: false, baseUrl: null } });
    provider?.close();
});

/** Send one chat turn and return the streamed events. */
async function chat(data: Record<string, unknown>) {
    const alice = await signedIn('alice');
    const res = await alice.post('/api/ai/chat', { data });
    expect(res.status()).toBe(200);
    return (await res.text())
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
}

test('the saved API key is never returned', async () => {
    const alice = await signedIn('alice');
    const text = await (await alice.get('/api/ai/settings')).text();
    expect(text).toContain('"hasKey":true');
    expect(text).not.toContain('sk-test-alice-key');
    const status = await (await alice.get('/api/ai/status')).text();
    expect(status).not.toContain('sk-test-alice-key');
});

test('secrets in a message or the terminal never reach the provider or the history', async () => {
    received.length = 0;
    nextReply = 'Rotate those credentials. <remember>web-01 runs Debian 12</remember>';
    const events = await chat({
        message: `my server password is ${SSH_PASSWORD}, why does login fail?`,
        screen: [
            'DB_PASSWORD=hunter2hunter2',
            '-----BEGIN OPENSSH PRIVATE KEY-----',
            'b3BlbnNzaC1rZXktdjEAAAAABG5vbmU',
            '-----END OPENSSH PRIVATE KEY-----',
            'Permission denied (publickey).',
        ].join('\n'),
    });

    const start = events.find((e) => e.type === 'start');
    expect(start.redacted).toBeGreaterThanOrEqual(3);
    const done = events.find((e) => e.type === 'done');
    expect(done.text).toBe('Rotate those credentials.');
    expect(done.remembered).toEqual(['web-01 runs Debian 12']);

    expect(received).toHaveLength(1);
    const sent = received[0];
    for (const secret of [
        SSH_PASSWORD,
        'hunter2hunter2',
        'b3BlbnNzaC1rZXktdjEAAAAABG5vbmU',
        'sk-test-alice-key',
    ]) {
        expect(sent).not.toContain(secret);
    }
    // The question and the non-secret output still get through.
    expect(sent).toContain('why does login fail?');
    expect(sent).toContain('Permission denied (publickey).');
    // Servers by name only: the seeded server's address never appears.
    expect(sent).toContain('ssh-box');
    expect(sent).not.toContain('127.0.0.1');

    // Stored history is redacted too.
    const alice = await signedIn('alice');
    const conv = await (await alice.get(`/api/ai/conversations/${start.conversationId}`)).text();
    expect(conv).not.toContain(SSH_PASSWORD);
    expect(conv).not.toContain('hunter2hunter2');
});

test('memory carries over, and a "fact" holding a secret is never kept', async () => {
    received.length = 0;
    nextReply = `Noted. <remember>the root password is ${SSH_PASSWORD}</remember>`;
    const events = await chat({ message: 'what do you remember?' });
    expect(events.find((e) => e.type === 'done').remembered).toEqual([]);
    // The memory saved in the previous test is in this request's instructions.
    expect(received[0]).toContain('web-01 runs Debian 12');

    const alice = await signedIn('alice');
    const memory = await (await alice.get('/api/ai/memory')).text();
    expect(memory).toContain('web-01 runs Debian 12');
    expect(memory).not.toContain(SSH_PASSWORD);
});

test("nobody can read or delete another person's conversations or memory", async () => {
    const alice = await signedIn('alice');
    const bob = await signedIn('bob');
    const { conversations } = (await (await alice.get('/api/ai/conversations')).json()).data;
    const { memories } = (await (await alice.get('/api/ai/memory')).json()).data;
    expect(conversations.length).toBeGreaterThan(0);

    expect((await bob.get(`/api/ai/conversations/${conversations[0].id}`)).status()).toBe(404);
    expect((await bob.delete(`/api/ai/conversations/${conversations[0].id}`)).status()).toBe(404);
    expect((await bob.delete(`/api/ai/memory/${memories[0].id}`)).status()).toBe(404);
    // Continuing someone else's conversation is refused before anything is
    // sent, even with a working provider of his own.
    await bob.put('/api/ai/settings', {
        data: { useOwn: true, provider: 'openai', model: 'fake-model', baseUrl: endpoint },
    });
    received.length = 0;
    const res = await bob.post('/api/ai/chat', {
        data: { conversationId: conversations[0].id, message: 'hi' },
    });
    expect(await res.text()).toContain('Conversation not found');
    expect(received).toHaveLength(0);
    // Their own list doesn't show it.
    expect(await (await bob.get('/api/ai/conversations')).text()).not.toContain(
        conversations[0].id,
    );
});

test('a custom endpoint is checked like any host Termi dials', async () => {
    const bob = await signedIn('bob');
    for (const baseUrl of [
        'http://169.254.169.254/v1',
        'file:///etc/passwd',
        'http://user:pw@example.com/v1',
    ]) {
        const res = await bob.put('/api/ai/settings', {
            data: { useOwn: true, provider: 'openai', baseUrl },
        });
        expect(res.status(), baseUrl).toBe(400);
    }
});

test('the AI API refuses anyone signed out', async ({ request }) => {
    for (const [method, path] of [
        ['get', '/api/ai/status'],
        ['get', '/api/ai/settings'],
        ['get', '/api/ai/conversations'],
        ['get', '/api/ai/memory'],
        ['post', '/api/ai/chat'],
    ] as const) {
        const res = await request[method](
            path,
            method === 'post' ? { data: { message: 'hi' } } : undefined,
        );
        expect(res.status(), path).toBe(401);
    }
});
