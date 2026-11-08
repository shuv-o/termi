/**
 * SSH through a jump host (bastion) — the `ssh -J` pattern.
 *
 * Connects to the bastion first, opens a `direct-tcpip` channel from it to the
 * target with `forwardOut`, then runs the target's SSH handshake over that
 * channel. The target is therefore dialed from inside the bastion's network,
 * never from this server. Mirrors `apps/gateway/src/handlers/jump.ts`.
 */

import { Client, type ConnectConfig } from 'ssh2';
import {
    applyHostKeyCheck,
    HOST_KEY_ALGORITHMS,
    HOST_KEY_MISMATCH,
    type HostKeyPin,
} from '@/lib/security/host-key';
import { pinFirstHostKey, recordHostKeyMismatch } from './host-key.service';

export interface SSHJumpConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    /** The bastion's own pinned host key. */
    hostKey: HostKeyPin;
}

function checkHostKey(client: Client, cc: ConnectConfig, pin: HostKeyPin, label: string) {
    applyHostKeyCheck(client, cc, pin, label, pinFirstHostKey, (err) =>
        recordHostKeyMismatch(pin.serverId, err),
    );
}

function bastionConfig(jump: SSHJumpConfig, readyTimeout?: number): ConnectConfig {
    const cc: ConnectConfig = {
        host: jump.host,
        port: jump.port,
        username: jump.username,
        readyTimeout: readyTimeout ?? 10_000,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
    };
    if (jump.privateKey?.trim()) {
        cc.privateKey = jump.privateKey;
        if (jump.passphrase?.trim()) cc.passphrase = jump.passphrase;
    } else if (jump.password?.trim()) {
        cc.password = jump.password;
        cc.tryKeyboard = true;
    }
    return cc;
}

/**
 * `client.connect(cc)`, but through `jump` when one is given. Failures on the
 * bastion surface as an `error` event on `client`, so callers keep a single
 * error path. The bastion connection is closed when `client` closes.
 *
 * `hostKey` is the target's pin: its host key is verified (or pinned on first
 * contact). Pass `null` only when `cc` brings its own `hostVerifier` (the
 * probe) or for a server that isn't saved yet (the connection test). The
 * bastion is always verified against its own pin.
 */
export function connectSSH(
    client: Client,
    cc: ConnectConfig,
    jump: SSHJumpConfig | null | undefined,
    hostKey: HostKeyPin | null,
): void {
    if (hostKey) checkHostKey(client, cc, hostKey, cc.host ?? 'the server');
    else cc.algorithms = { ...cc.algorithms, serverHostKey: HOST_KEY_ALGORITHMS };

    if (!jump) {
        client.connect(cc);
        return;
    }

    const target = `${cc.host}:${cc.port ?? 22}`;
    const bastion = new Client();
    let handedOff = false;
    const fail = (message: string, code?: unknown) => {
        if (handedOff) return;
        handedOff = true;
        client.emit('error', Object.assign(new Error(message), code ? { code } : {}));
        bastion.end();
    };

    if (jump.password) {
        bastion.on('keyboard-interactive', (_n, _i, _l, _p, finish) => finish([jump.password!]));
    }

    bastion.once('ready', () => {
        bastion.forwardOut('127.0.0.1', 0, cc.host ?? '', cc.port ?? 22, (err, stream) => {
            if (err) {
                fail(`Jump host ${jump.host} could not reach ${target}: ${err.message}`);
                return;
            }
            handedOff = true;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { host, port, ...rest } = cc;
            client.connect({ ...rest, sock: stream });
        });
    });
    bastion.on('error', (err: Error & { code?: unknown }) =>
        fail(
            `Jump host ${jump.host}: ${err.message}`,
            err.code === HOST_KEY_MISMATCH ? HOST_KEY_MISMATCH : undefined,
        ),
    );
    bastion.on('close', () => {
        // Bastion gone before the target came up — say so rather than hang.
        if (!handedOff) fail(`Jump host ${jump.host} closed the connection`);
    });
    client.once('close', () => bastion.end());

    try {
        const bcc = bastionConfig(jump, cc.readyTimeout);
        checkHostKey(bastion, bcc, jump.hostKey, `jump host ${jump.host}`);
        bastion.connect(bcc);
    } catch (err) {
        fail(`Jump host ${jump.host}: ${(err as Error).message}`);
    }
}
