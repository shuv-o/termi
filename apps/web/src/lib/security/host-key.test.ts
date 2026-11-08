import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'net';
import { Client, Server, utils } from 'ssh2';
import {
    HOST_KEY_MISMATCH,
    applyHostKeyCheck,
    fingerprintOf,
    keyTypeOf,
    type HostKeyPin,
    type PinFirstKey,
} from './host-key';

// A real SSH server with a fresh ed25519 host key.
const hostKey = utils.generateKeyPairSync('ed25519');
const parsed = utils.parseKey(hostKey.public);
if (parsed instanceof Error) throw parsed;
const blob = parsed.getPublicSSH();
const fp = fingerprintOf(blob);
const OTHER = 'SHA256:' + 'A'.repeat(43);

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

function attempt(pin: HostKeyPin, pinFirst: PinFirstKey, onMismatch = vi.fn()) {
    return new Promise<{ ok: boolean; err?: Error & { code?: unknown } }>((resolve) => {
        const client = new Client();
        const cc = { host: '127.0.0.1', port, username: 'u', password: 'p' };
        applyHostKeyCheck(client, cc, pin, 'box', pinFirst, onMismatch);
        client.once('ready', () => {
            client.end();
            resolve({ ok: true });
        });
        client.once('error', (err) => resolve({ ok: false, err }));
        client.connect(cc);
    });
}

describe('host key pinning', () => {
    it('reads the key type and an OpenSSH-style fingerprint', () => {
        expect(keyTypeOf(blob)).toBe('ssh-ed25519');
        expect(fp).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
        expect(keyTypeOf(Buffer.alloc(2))).toBe('unknown');
    });

    it('pins the first key seen, then keeps using it', async () => {
        const pinFirst = vi.fn(async (_id: string, f: string) => f);
        const pin: HostKeyPin = { serverId: 's1', fingerprint: null };
        expect((await attempt(pin, pinFirst)).ok).toBe(true);
        expect(pinFirst).toHaveBeenCalledWith('s1', fp, 'ssh-ed25519');
        expect(pin.fingerprint).toBe(fp);
    });

    it('accepts the pinned key without writing anything', async () => {
        const pinFirst = vi.fn();
        expect((await attempt({ serverId: 's1', fingerprint: fp }, pinFirst)).ok).toBe(true);
        expect(pinFirst).not.toHaveBeenCalled();
    });

    it('refuses a changed key, says why, and reports it', async () => {
        const onMismatch = vi.fn();
        const r = await attempt({ serverId: 's1', fingerprint: OTHER }, vi.fn(), onMismatch);
        expect(r.ok).toBe(false);
        expect(r.err?.code).toBe(HOST_KEY_MISMATCH);
        expect(r.err?.message).toContain(`expected ${OTHER}, got ${fp}`);
        expect(onMismatch).toHaveBeenCalledOnce();
    });

    it('refuses when another connection pinned a different key first', async () => {
        const r = await attempt({ serverId: 's1', fingerprint: null }, async () => OTHER);
        expect(r.ok).toBe(false);
        expect(r.err?.code).toBe(HOST_KEY_MISMATCH);
    });

    it('fails closed when the pin cannot be stored', async () => {
        const r = await attempt({ serverId: 's1', fingerprint: null }, async () => {
            throw new Error('db down');
        });
        expect(r.ok).toBe(false);
        expect(r.err?.message).toMatch(/Could not record the host key of box: db down/);
    });
});
