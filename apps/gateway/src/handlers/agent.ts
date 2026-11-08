/**
 * SSH agent forwarding without handing out keys.
 *
 * When a session has agent forwarding on, the remote server can ask "which
 * keys do you have?" and "sign this with key X" over the forwarded agent
 * channel — exactly what `ssh -A` gives it. Those requests are answered here,
 * in the gateway, from the keys in the connection token; the private keys
 * themselves never reach the server. In "confirm" mode each signature waits
 * for the user to allow it in the browser.
 *
 * As with `ssh -A`, anyone with root on that server can use the keys while
 * the session is open; the UI says so.
 */

import { createHash } from 'crypto';
import { Duplex } from 'stream';
import ssh2, { type ParsedKey } from 'ssh2';
import protocolUtils from 'ssh2/lib/protocol/utils.js';

// Default import: ssh2 is CommonJS, and Node's ESM loader can't see `utils`
// as a named export.
const { BaseAgent, utils } = ssh2;

// SSH agent protocol (draft-miller-ssh-agent).
const AGENT_FAILURE = 5;
const AGENTC_REQUEST_IDENTITIES = 11;
const AGENT_IDENTITIES_ANSWER = 12;
const AGENTC_SIGN_REQUEST = 13;
const AGENT_SIGN_RESPONSE = 14;
const RSA_SHA2_256 = 2;
const RSA_SHA2_512 = 4;
/** Larger agent messages are refused (real ones are a few KB). */
const MAX_MESSAGE = 256 * 1024;

export interface AgentKeyInput {
    comment: string;
    privateKey: string;
    passphrase?: string | null;
}

export interface SignRequest {
    comment: string;
    fingerprint: string;
}

/** Resolves true to allow one signature. */
export type Approver = (req: SignRequest) => Promise<boolean>;

interface LoadedKey {
    key: ParsedKey;
    comment: string;
    fingerprint: string;
    blob: Buffer;
}

const fingerprint = (blob: Buffer) =>
    'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');

export class ForwardedAgent extends BaseAgent {
    private keys: LoadedKey[] = [];

    constructor(
        inputs: AgentKeyInput[],
        private approve?: Approver,
    ) {
        super();
        for (const input of inputs) {
            const parsed = utils.parseKey(input.privateKey, input.passphrase ?? undefined);
            if (parsed instanceof Error) continue; // a bad key is skipped, not fatal
            const key = Array.isArray(parsed) ? parsed[0] : parsed;
            const blob = key.getPublicSSH();
            if (this.keys.some((k) => k.blob.equals(blob))) continue;
            this.keys.push({ key, comment: input.comment, fingerprint: fingerprint(blob), blob });
        }
    }

    get size(): number {
        return this.keys.length;
    }

    // BaseAgent's interface for agent *authentication*; logins never use this
    // agent (handlers restrict the auth methods), only forwarding does.
    getIdentities(cb: (err: Error | undefined, keys?: ParsedKey[]) => void): void {
        cb(
            undefined,
            this.keys.map((k) => k.key),
        );
    }

    sign(
        _pubKey: ParsedKey | Buffer | string,
        _data: Buffer,
        _options: unknown,
        cb?: (err: Error | undefined, signature?: Buffer) => void,
    ): void {
        cb?.(new Error('This agent only serves forwarded requests'));
    }

    /** A fresh agent-protocol stream for one forwarded channel. */
    getStream(cb: (err: Error | undefined, stream?: Duplex) => void): void {
        cb(undefined, new AgentServerStream(this.keys, this.approve));
    }
}

const u32 = (n: number) => {
    const b = Buffer.allocUnsafe(4);
    b.writeUInt32BE(n, 0);
    return b;
};
const sshString = (b: Buffer | string) => {
    const buf = typeof b === 'string' ? Buffer.from(b) : b;
    return Buffer.concat([u32(buf.length), buf]);
};

/**
 * The agent side of one forwarded channel. Written here rather than using
 * ssh2's AgentProtocol, which mis-frames messages it doesn't know: OpenSSH
 * 8.9+ opens with a `session-bind@openssh.com` extension, and the leftover
 * bytes corrupted the next request. Messages are handled one at a time, in
 * order, as the protocol requires.
 */
class AgentServerStream extends Duplex {
    private buffer = Buffer.alloc(0);
    private busy = false;

    constructor(
        private keys: LoadedKey[],
        private approve?: Approver,
    ) {
        super();
    }

    _read(): void {}

    _write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error) => void): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (this.buffer.length > MAX_MESSAGE + 4) {
            cb(new Error('agent message too large'));
            return;
        }
        void this.drain();
        cb();
    }

    private async drain(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        try {
            while (this.buffer.length >= 4) {
                const len = this.buffer.readUInt32BE(0);
                if (len === 0 || len > MAX_MESSAGE) {
                    this.destroy(new Error('bad agent message'));
                    return;
                }
                if (this.buffer.length < 4 + len) break;
                const msg = this.buffer.subarray(4, 4 + len);
                this.buffer = this.buffer.subarray(4 + len);
                const reply = await this.handle(msg).catch(() => Buffer.from([AGENT_FAILURE]));
                if (this.destroyed) return;
                this.push(Buffer.concat([u32(reply.length), reply]));
            }
        } finally {
            this.busy = false;
        }
    }

    private async handle(msg: Buffer): Promise<Buffer> {
        const failure = Buffer.from([AGENT_FAILURE]);
        switch (msg[0]) {
            case AGENTC_REQUEST_IDENTITIES:
                return Buffer.concat([
                    Buffer.from([AGENT_IDENTITIES_ANSWER]),
                    u32(this.keys.length),
                    ...this.keys.flatMap((k) => [sshString(k.blob), sshString(k.comment)]),
                ]);
            case AGENTC_SIGN_REQUEST: {
                let p = 1;
                const read = () => {
                    const n = msg.readUInt32BE(p);
                    const v = msg.subarray(p + 4, p + 4 + n);
                    if (v.length !== n) throw new Error('truncated');
                    p += 4 + n;
                    return v;
                };
                const blob = read();
                const data = read();
                const flags = msg.length >= p + 4 ? msg.readUInt32BE(p) : 0;
                const match = this.keys.find((k) => k.blob.equals(blob));
                if (!match) return failure;
                if (this.approve) {
                    const ok = await this.approve({
                        comment: match.comment,
                        fingerprint: match.fingerprint,
                    }).catch(() => false);
                    if (!ok) return failure;
                }
                let format: string = match.key.type;
                let hash: string | undefined;
                if (format === 'ssh-rsa' && flags & RSA_SHA2_512) {
                    format = 'rsa-sha2-512';
                    hash = 'sha512';
                } else if (format === 'ssh-rsa' && flags & RSA_SHA2_256) {
                    format = 'rsa-sha2-256';
                    hash = 'sha256';
                }
                const raw = match.key.sign(data, hash);
                if (raw instanceof Error) return failure;
                // ssh2 returns DER for ECDSA/DSA; the wire format is SSH's own.
                const sig = protocolUtils.convertSignature(raw, match.key.type);
                if (sig === false) return failure;
                return Buffer.concat([
                    Buffer.from([AGENT_SIGN_RESPONSE]),
                    sshString(Buffer.concat([sshString(format), sshString(sig)])),
                ]);
            }
            default:
                // Extensions (session-bind, query, …) and key management.
                return failure;
        }
    }
}
