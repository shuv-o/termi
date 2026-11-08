/**
 * SSH through a jump host (bastion) — the `ssh -J` pattern.
 *
 * Connects to the bastion from the token's `jump` claim, opens a
 * `direct-tcpip` channel from it to the target with `forwardOut`, and runs the
 * target's SSH handshake over that channel. The target is dialed from inside
 * the bastion's network, never from the gateway. Mirrors
 * `apps/web/src/lib/services/ssh-jump.ts`.
 */

import { Client, type ConnectConfig } from 'ssh2';
import type { TokenPayload } from '../auth/token.js';
import { applyHostKeyCheck, HOST_KEY_MISMATCH } from '../auth/host-key.js';

export type Jump = NonNullable<TokenPayload['jump']>;

/** Connection config for the bastion `client`, with its host key verified. */
export function bastionConfig(client: Client, jump: Jump, readyTimeout?: number): ConnectConfig {
    const cc: ConnectConfig = {
        host: jump.host,
        port: jump.port,
        username: jump.username,
        readyTimeout: readyTimeout ?? 10_000,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 6,
    };
    applyHostKeyCheck(client, cc, jump.hostKey, `jump host ${jump.host}`);
    if (jump.privateKey) {
        cc.privateKey = jump.privateKey;
        if (jump.passphrase) cc.passphrase = jump.passphrase;
    } else if (jump.password) {
        cc.password = jump.password;
        cc.tryKeyboard = true;
    }
    return cc;
}

/**
 * `client.connect(config)`, but through `jump` when the token carries one.
 * Bastion failures surface as an `error` event on `client`, so handlers keep
 * their single existing error path. The bastion is closed with `client`.
 * Both hops' host keys are verified against the token's pins (`hostKey`).
 */
export function connectSSH(
    client: Client,
    config: ConnectConfig,
    jump: TokenPayload['jump'],
    hostKey: string | null | undefined,
): void {
    applyHostKeyCheck(client, config, hostKey, config.host ?? 'the server');

    if (!jump) {
        client.connect(config);
        return;
    }

    const target = `${config.host}:${config.port ?? 22}`;
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
        bastion.forwardOut('127.0.0.1', 0, config.host ?? '', config.port ?? 22, (err, stream) => {
            if (err) {
                fail(`jump host ${jump.host} could not reach ${target}: ${err.message}`);
                return;
            }
            handedOff = true;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { host, port, ...rest } = config;
            client.connect({ ...rest, sock: stream });
        });
    });
    bastion.on('error', (err: Error & { code?: unknown }) =>
        fail(
            `jump host ${jump.host}: ${err.message}`,
            err.code === HOST_KEY_MISMATCH ? HOST_KEY_MISMATCH : undefined,
        ),
    );
    bastion.on('close', () => {
        if (!handedOff) fail(`jump host ${jump.host} closed the connection`);
    });
    client.once('close', () => bastion.end());

    try {
        bastion.connect(bastionConfig(bastion, jump, config.readyTimeout));
    } catch (err) {
        fail(`jump host ${jump.host}: ${(err as Error).message}`);
    }
}
