import { describe, it, expect, vi, beforeEach } from 'vitest';

// A minimal stand-in for ssh2's Client: records connect/forwardOut calls and
// lets each test drive the bastion's events. Hoisted so vi.mock can see it.
const { FakeClient } = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventEmitter } = require('events') as typeof import('events');
    class FakeClient extends EventEmitter {
        static instances: FakeClient[] = [];
        connect = vi.fn();
        end = vi.fn();
        forwardOut = vi.fn();
        constructor() {
            super();
            FakeClient.instances.push(this);
        }
    }
    return { FakeClient };
});

vi.mock('ssh2', () => ({ Client: FakeClient }));
// Reaches into the real ssh2's protocol internals; not needed for routing.
vi.mock('@/lib/security/ssh-cert', () => ({ certifiedKey: vi.fn() }));

import { connectSSH } from './ssh-jump';
import type { Client } from 'ssh2';

const jump = {
    host: 'bastion.example.com',
    port: 2222,
    username: 'jump',
    password: 'pw',
    hostKey: { serverId: 'b1', fingerprint: 'SHA256:bastion' },
};
const target = { host: '10.0.2.4', port: 22, username: 'deploy', readyTimeout: 5000 };

beforeEach(() => {
    FakeClient.instances = [];
});

describe('connectSSH', () => {
    it('connects directly when there is no jump host', () => {
        const client = new FakeClient();
        connectSSH(client as unknown as Client, target, null, null);
        expect(client.connect).toHaveBeenCalledWith(target);
        expect(FakeClient.instances).toHaveLength(1);
    });

    it('dials the bastion, forwards to the target, and handshakes over that channel', () => {
        const client = new FakeClient();
        connectSSH(client as unknown as Client, target, jump, null);

        const bastion = FakeClient.instances[1];
        expect(client.connect).not.toHaveBeenCalled();
        expect(bastion.connect).toHaveBeenCalledWith(
            expect.objectContaining({ host: 'bastion.example.com', port: 2222, username: 'jump' }),
        );

        bastion.emit('ready');
        expect(bastion.forwardOut).toHaveBeenCalledWith(
            '127.0.0.1',
            0,
            '10.0.2.4',
            22,
            expect.any(Function),
        );

        const stream = { fake: 'stream' };
        bastion.forwardOut.mock.calls[0][4](undefined, stream);
        const cc = client.connect.mock.calls[0][0];
        expect(cc.sock).toBe(stream);
        // The target is never dialed directly by this process.
        expect(cc.host).toBeUndefined();
        expect(cc.port).toBeUndefined();
        expect(cc.username).toBe('deploy');
    });

    it('reports a bastion that cannot reach the target as an error on the client', () => {
        const client = new FakeClient();
        const onError = vi.fn();
        client.on('error', onError);
        connectSSH(client as unknown as Client, target, jump, null);
        const bastion = FakeClient.instances[1];

        bastion.emit('ready');
        bastion.forwardOut.mock.calls[0][4](new Error('Connection refused'));

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].message).toMatch(/could not reach 10\.0\.2\.4:22/);
        expect(bastion.end).toHaveBeenCalled();
        expect(client.connect).not.toHaveBeenCalled();
    });

    it('reports bastion auth failures once, and closes the bastion with the client', () => {
        const client = new FakeClient();
        const onError = vi.fn();
        client.on('error', onError);
        connectSSH(client as unknown as Client, target, jump, null);
        const bastion = FakeClient.instances[1];

        bastion.emit('error', new Error('All configured authentication methods failed'));
        bastion.emit('close');
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].message).toMatch(/^Jump host bastion\.example\.com/);

        client.emit('close');
        expect(bastion.end).toHaveBeenCalled();
    });
});
