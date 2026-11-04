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

export type Jump = NonNullable<TokenPayload['jump']>;

export function bastionConfig(jump: Jump, readyTimeout?: number): ConnectConfig {
    const cc: ConnectConfig = {
        host: jump.host,
        port: jump.port,
        username: jump.username,
        readyTimeout: readyTimeout ?? 10_000,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 6,
    };
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
 */
export function connectSSH(
    client: Client,
    config: ConnectConfig,
    jump: TokenPayload['jump'],
): void {
    if (!jump) {
        client.connect(config);
        return;
    }

    const target = `${config.host}:${config.port ?? 22}`;
    const bastion = new Client();
    let handedOff = false;
    const fail = (message: string) => {
        if (handedOff) return;
        handedOff = true;
        client.emit('error', new Error(message));
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
    bastion.on('error', (err) => fail(`jump host ${jump.host}: ${err.message}`));
    bastion.on('close', () => {
        if (!handedOff) fail(`jump host ${jump.host} closed the connection`);
    });
    client.once('close', () => bastion.end());

    try {
        bastion.connect(bastionConfig(jump, config.readyTimeout));
    } catch (err) {
        fail(`jump host ${jump.host}: ${(err as Error).message}`);
    }
}
