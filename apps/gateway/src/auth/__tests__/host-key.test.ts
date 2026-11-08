import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { AddressInfo } from 'net';
import { Client, Server, utils } from 'ssh2';
import { connectSSH } from '../../handlers/jump.js';
import { HOST_KEY_MISMATCH, fingerprintOf } from '../host-key.js';

// A real SSH server with a fresh ed25519 host key: the check runs against an
// actual handshake, not a mock.
const hostKey = utils.generateKeyPairSync('ed25519');
const publicBlob = utils.parseKey(hostKey.public);
if (publicBlob instanceof Error) throw publicBlob;
const expected =
    'SHA256:' +
    createHash('sha256').update(publicBlob.getPublicSSH()).digest('base64').replace(/=+$/, '');

let server: Server;
let port: number;

beforeAll(async () => {
    server = new Server({ hostKeys: [hostKey.private] }, (conn) => {
        conn.on('authentication', (ctx) => ctx.accept());
        conn.on('ready', () => conn.end());
        conn.on('error', () => {});
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

type Jump = Parameters<typeof connectSSH>[2];

function attempt(
    pin: string | null,
    jump: Jump = null,
): Promise<{ ok: true } | { ok: false; err: Error & { code?: unknown } }> {
    return new Promise((resolve) => {
        const client = new Client();
        client.once('ready', () => {
            client.end();
            resolve({ ok: true });
        });
        client.once('error', (err) => resolve({ ok: false, err }));
        connectSSH(client, { host: '127.0.0.1', port, username: 'u', password: 'p' }, jump, pin);
    });
}

describe('gateway host key verification', () => {
    it('formats fingerprints like OpenSSH', () => {
        expect(fingerprintOf(publicBlob.getPublicSSH())).toBe(expected);
        expect(expected).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    });

    it('connects when the server presents the pinned key', async () => {
        expect(await attempt(expected)).toEqual({ ok: true });
    });

    it('refuses a different key and says why', async () => {
        const other = 'SHA256:' + 'A'.repeat(43);
        const r = await attempt(other);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.err.code).toBe(HOST_KEY_MISMATCH);
        expect(r.err.message).toContain(`expected ${other}, got ${expected}`);
    });

    it('refuses to connect without a pin instead of trusting blindly', async () => {
        const r = await attempt(null);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.err.message).toMatch(/no recorded host key/);
    });

    it('verifies the jump host against its own pin', async () => {
        const r = await attempt(expected, {
            host: '127.0.0.1',
            port,
            username: 'u',
            password: 'p',
            hostKey: 'SHA256:' + 'B'.repeat(43),
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.err.code).toBe(HOST_KEY_MISMATCH);
        expect(r.err.message).toMatch(/^jump host 127\.0\.0\.1: The host key of jump host/);
    });
});
