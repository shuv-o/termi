import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { expect, test } from '@playwright/test';
import { SSH_CONTAINER, SSH_PASSWORD, SSH_PORT, USERS } from './env';
import { signedIn, sql, state } from './helpers';

test.describe.configure({ mode: 'serial' });

/** Run a command inside the SSH test container. */
const inBox = (cmd: string) =>
    execFileSync('docker', ['exec', SSH_CONTAINER, 'sh', '-c', cmd]).toString();

/** A fresh key pair in the container, optionally with a certificate from the test CA. */
function makeKey(name: string, type: 'ed25519' | 'rsa', certify: boolean) {
    inBox(
        `cd /tmp && rm -f ${name} ${name}.pub ${name}-cert.pub && ssh-keygen -q -t ${type} -N '' -C ${name} -f ${name}` +
            (certify
                ? ` && ssh-keygen -q -s /etc/ssh/user_ca -I e2e-${name} -n root ${name}.pub`
                : ''),
    );
    return {
        privateKey: inBox(`cat /tmp/${name}`),
        publicKey: inBox(`cat /tmp/${name}.pub`).trim(),
        certificate: certify ? inBox(`cat /tmp/${name}-cert.pub`).trim() : undefined,
    };
}

async function createServer(data: Record<string, unknown>) {
    const alice = await signedIn('alice');
    const res = await alice.post('/api/servers', {
        data: { host: '127.0.0.1', port: SSH_PORT, protocol: 'SSH', username: 'root', ...data },
    });
    const body = await res.json();
    if (!body.success) throw new Error(body.error);
    return body.data.server.id as string;
}

/**
 * Open a terminal through the real gateway, type `command`, and collect the
 * output until `until` matches. `onAgentRequest` answers key-use prompts.
 */
async function runInShell(
    user: keyof typeof USERS,
    serverId: string,
    command: string,
    until: RegExp,
    onAgentRequest?: (req: { comment: string; fingerprint: string }) => boolean,
): Promise<{
    output: string;
    error?: string;
    prompts: { comment: string; fingerprint: string }[];
}> {
    const ctx = await signedIn(user);
    const tok = await (
        await ctx.post('/api/connection/token', { data: { serverId, protocol: 'ssh' } })
    ).json();
    if (!tok.success) return { output: '', error: tok.error, prompts: [] };
    const { token, gatewayUrl } = tok.data;
    return new Promise((resolve) => {
        const ws = new WebSocket(
            `${gatewayUrl}/connect?protocol=ssh&serverId=${serverId}&sessionId=${randomUUID()}`,
        );
        ws.binaryType = 'arraybuffer';
        let output = '';
        const prompts: { comment: string; fingerprint: string }[] = [];
        const finish = (error?: string) => {
            clearTimeout(timer);
            try {
                ws.send(JSON.stringify({ type: 'close-session' }));
                ws.close();
            } catch {
                /* closed */
            }
            resolve({ output, error, prompts });
        };
        const timer = setTimeout(() => finish('timeout'), 20_000);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
        ws.onmessage = (e) => {
            if (typeof e.data !== 'string') {
                output += Buffer.from(e.data as ArrayBuffer).toString();
                if (until.test(output)) finish();
                return;
            }
            const msg = JSON.parse(e.data);
            if (msg.type === 'shell-ready') ws.send(new TextEncoder().encode(command + '\n'));
            else if (msg.type === 'error') finish(msg.message);
            else if (msg.type === 'agent-request') {
                prompts.push({ comment: msg.comment, fingerprint: msg.fingerprint });
                const allow = onAgentRequest?.(msg) ?? false;
                ws.send(JSON.stringify({ type: 'agent-response', id: msg.id, allow }));
            }
        };
    });
}

test.describe('OpenSSH user certificates', () => {
    test('log in with an ed25519 certificate, in the terminal and the file browser', async () => {
        const key = makeKey('ce', 'ed25519', true);
        const id = await createServer({
            name: 'cert-ed25519',
            privateKey: key.privateKey,
            certificate: key.certificate,
        });
        const r = await runInShell('alice', id, 'echo CERT-$((40+2))', /CERT-42/);
        expect(r.error).toBeUndefined();

        const alice = await signedIn('alice');
        expect((await alice.get(`/api/servers/${id}/sftp/list?path=/`)).status()).toBe(200);

        // The same key without its certificate isn't authorized for root.
        const plain = await createServer({ name: 'cert-missing', privateKey: key.privateKey });
        const refused = await runInShell('alice', plain, 'echo NO-$((1+1))', /NO-2/);
        expect(refused.error).toMatch(/authentication/i);
    });

    test('log in with an RSA certificate (SHA-512 signature)', async () => {
        const key = makeKey('cr', 'rsa', true);
        const id = await createServer({
            name: 'cert-rsa',
            privateKey: key.privateKey,
            certificate: key.certificate,
        });
        const r = await runInShell('alice', id, 'echo RSA-$((40+2))', /RSA-42/);
        expect(r.error).toBeUndefined();
    });

    test('a certificate for another key, or a malformed one, is caught', async () => {
        const a = makeKey('ca1', 'ed25519', true);
        const b = makeKey('ca2', 'ed25519', true);
        const alice = await signedIn('alice');
        const test1 = await (
            await alice.post('/api/servers/test', {
                data: {
                    host: '127.0.0.1',
                    port: SSH_PORT,
                    protocol: 'SSH',
                    username: 'root',
                    privateKey: a.privateKey,
                    certificate: b.certificate,
                },
            })
        ).json();
        expect(test1.success).toBe(false);
        expect(test1.error).toMatch(/not issued for this private key/);

        const bad = await alice.post('/api/servers', {
            data: {
                name: 'bad-cert',
                host: '127.0.0.1',
                port: SSH_PORT,
                protocol: 'SSH',
                username: 'root',
                privateKey: a.privateKey,
                certificate: 'ssh-ed25519 AAAAnot-a-cert',
            },
        });
        expect(bad.status()).toBe(400);
    });
});

test.describe('agent forwarding', () => {
    let serverId: string;
    let keychainId: string;
    // From inside the session, ssh to a host that only accepts the forwarded key.
    const HOP =
        "ssh-add -l; ssh -o StrictHostKeyChecking=no -o BatchMode=yes root@127.0.0.1 'echo AGENT-$((40+2))'; echo END-$((1+1))";

    test.beforeAll(async () => {
        const fwd = makeKey('fwd', 'ed25519', false);
        inBox(
            `grep -qF '${fwd.publicKey}' /root/.ssh/authorized_keys 2>/dev/null || echo '${fwd.publicKey}' >> /root/.ssh/authorized_keys`,
        );
        const alice = await signedIn('alice');
        const kc = await (
            await alice.post('/api/keychain', {
                data: { label: 'forward-key', username: 'root', privateKey: fwd.privateKey },
            })
        ).json();
        keychainId = kc.data.entry.id;
        serverId = await createServer({
            name: 'agent-box',
            password: SSH_PASSWORD,
            agentForwarding: 'on',
            agentKeychainIds: [keychainId],
        });
    });

    test('the server can use the forwarded key without having it', async () => {
        const r = await runInShell('alice', serverId, HOP, /END-2/);
        expect(r.error).toBeUndefined();
        expect(r.output).toContain('forward-key');
        expect(r.output).toContain('AGENT-42');
        // The key never lands on the server.
        expect(
            inBox('grep -rl "OPENSSH PRIVATE KEY" /root /tmp/fwd-never 2>/dev/null || true').trim(),
        ).toBe('');
    });

    test('"ask each time" waits for the user, and a denial refuses the key', async () => {
        const alice = await signedIn('alice');
        await alice.patch(`/api/servers/${serverId}`, { data: { agentForwarding: 'confirm' } });

        const allowed = await runInShell('alice', serverId, HOP, /END-2/, () => true);
        expect(allowed.prompts.length).toBeGreaterThan(0);
        expect(allowed.prompts[0].comment).toBe('forward-key');
        expect(allowed.prompts[0].fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
        expect(allowed.output).toContain('AGENT-42');

        const denied = await runInShell('alice', serverId, HOP, /END-2/, () => false);
        expect(denied.prompts.length).toBeGreaterThan(0);
        expect(denied.output).not.toContain('AGENT-42');
        expect(denied.output).toMatch(/Permission denied/);
    });

    test('a user the server is shared with gets no agent, not even its login key', async () => {
        // This server logs in with a key, which forwarding would include.
        const fwd = inBox('cat /tmp/fwd');
        const own = await createServer({
            name: 'agent-own-key',
            privateKey: fwd,
            agentForwarding: 'on',
        });
        const owner = await runInShell('alice', own, HOP, /END-2/);
        expect(owner.output).toContain('agent-own-key login key');

        const { aliceId, bobId } = state();
        sql(
            `insert into "ServerShare" (id, "serverId", "ownerId", "sharedWithId", permissions) values ('share-agent-e2e', '${own}', '${aliceId}', '${bobId}', 'connect') on conflict do nothing`,
        );
        const r = await runInShell('bob', own, HOP, /END-2/);
        expect(r.error).toBeUndefined();
        expect(r.output).not.toContain('login key');
        expect(r.output).not.toContain('AGENT-42');
        expect(r.output).toMatch(
            /Could not open a connection to your authentication agent|Error connecting to agent/,
        );
    });

    test('only your own keychain keys can be forwarded', async () => {
        const bob = await signedIn('bob');
        const res = await bob.post('/api/servers', {
            data: {
                name: 'steal-agent',
                host: '127.0.0.1',
                port: SSH_PORT,
                protocol: 'SSH',
                username: 'root',
                password: SSH_PASSWORD,
                agentForwarding: 'on',
                agentKeychainIds: [keychainId],
            },
        });
        expect(res.status()).toBe(400);
    });
});
