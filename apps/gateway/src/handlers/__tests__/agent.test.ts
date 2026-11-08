import { describe, expect, it } from 'vitest';
import { AgentProtocol, utils, type ParsedKey } from 'ssh2';
import { ForwardedAgent } from '../agent.js';

const kp = utils.generateKeyPairSync('ed25519', { comment: 'deploy key' });
const other = utils.generateKeyPairSync('ed25519');
const pub = utils.parseKey(kp.public) as ParsedKey;

/** Connect an agent-protocol client (what the remote ssh would be) to the agent. */
function connect(agent: ForwardedAgent) {
    const client = new AgentProtocol(true);
    agent.getStream((_err, stream) => {
        client.pipe(stream!).pipe(client);
    });
    return client;
}

const identities = (client: InstanceType<typeof AgentProtocol>) =>
    new Promise<ParsedKey[]>((resolve, reject) =>
        client.getIdentities((err, keys) => (err ? reject(err) : resolve(keys as ParsedKey[]))),
    );

const sign = (client: InstanceType<typeof AgentProtocol>, key: ParsedKey, data: Buffer) =>
    new Promise<Buffer>((resolve, reject) =>
        client.sign(key, data, {}, (err, sig) => (err ? reject(err) : resolve(sig as Buffer))),
    );

describe('ForwardedAgent', () => {
    it('lists its keys and signs with them', async () => {
        const agent = new ForwardedAgent([{ comment: 'deploy key', privateKey: kp.private }]);
        const client = connect(agent);
        const keys = await identities(client);
        expect(keys).toHaveLength(1);
        expect(keys[0].getPublicSSH().equals(pub.getPublicSSH())).toBe(true);

        const data = Buffer.from('session-id + userauth request');
        const sig = await sign(client, keys[0], data);
        expect(pub.verify(data, sig)).toBe(true);
    });

    it('asks before each signature in confirm mode, and refuses when denied', async () => {
        const asked: string[] = [];
        let answer = false;
        const agent = new ForwardedAgent(
            [{ comment: 'deploy key', privateKey: kp.private }],
            async (req) => {
                asked.push(`${req.comment} ${req.fingerprint}`);
                return answer;
            },
        );
        const client = connect(agent);
        const [key] = await identities(client);
        await expect(sign(client, key, Buffer.from('x'))).rejects.toThrow();
        answer = true;
        const sig = await sign(client, key, Buffer.from('y'));
        expect(pub.verify(Buffer.from('y'), sig)).toBe(true);
        expect(asked).toHaveLength(2);
        expect(asked[0]).toMatch(/^deploy key SHA256:[A-Za-z0-9+/]{43}$/);
    });

    it('refuses keys it does not hold, and skips unreadable or duplicate keys', async () => {
        const agent = new ForwardedAgent([
            { comment: 'a', privateKey: kp.private },
            { comment: 'dup', privateKey: kp.private },
            { comment: 'bad', privateKey: 'not a key' },
        ]);
        expect(agent.size).toBe(1);
        const client = connect(agent);
        const stranger = utils.parseKey(other.public) as ParsedKey;
        await expect(sign(client, stranger, Buffer.from('z'))).rejects.toThrow();
    });

    it('answers like OpenSSH expects: unknown extensions are refused cleanly', async () => {
        // OpenSSH 8.9+ starts with a session-bind extension; the request after
        // it must still be read correctly.
        const agent = new ForwardedAgent([{ comment: 'deploy key', privateKey: kp.private }]);
        const stream = await new Promise<import('stream').Duplex>((r) =>
            agent.getStream((_e, s) => r(s!)),
        );
        const frame = (body: Buffer) => {
            const len = Buffer.alloc(4);
            len.writeUInt32BE(body.length);
            return Buffer.concat([len, body]);
        };
        const ext = Buffer.concat([
            Buffer.from([27]),
            Buffer.from([0, 0, 0, 26]),
            Buffer.from('session-bind@openssh.com\0\0'),
            Buffer.alloc(64, 7),
        ]);
        const replies: Buffer[] = [];
        stream.on('data', (d: Buffer) => replies.push(d));
        stream.write(Buffer.concat([frame(ext), frame(Buffer.from([11]))]));
        await new Promise((r) => setTimeout(r, 20));
        const all = Buffer.concat(replies);
        expect(all.subarray(0, 5)).toEqual(Buffer.from([0, 0, 0, 1, 5])); // failure for the extension
        expect(all[9]).toBe(12); // then a proper identities answer
        expect(all.includes(Buffer.from('deploy key'))).toBe(true);
    });
});
