/**
 * SSH through a jump host (bastion) — the `ssh -J` pattern.
 *
 * Connects to the bastion first, opens a `direct-tcpip` channel from it to the
 * target with `forwardOut`, then runs the target's SSH handshake over that
 * channel. The target is therefore dialed from inside the bastion's network,
 * never from this server. Mirrors `apps/gateway/src/handlers/jump.ts`.
 */

import { Client, type ConnectConfig } from 'ssh2';

export interface SSHJumpConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
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
 */
export function connectSSH(client: Client, cc: ConnectConfig, jump?: SSHJumpConfig | null): void {
    if (!jump) {
        client.connect(cc);
        return;
    }

    const target = `${cc.host}:${cc.port ?? 22}`;
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
    bastion.on('error', (err) => fail(`Jump host ${jump.host}: ${err.message}`));
    bastion.on('close', () => {
        // Bastion gone before the target came up — say so rather than hang.
        if (!handedOff) fail(`Jump host ${jump.host} closed the connection`);
    });
    client.once('close', () => bastion.end());

    try {
        bastion.connect(bastionConfig(jump, cc.readyTimeout));
    } catch (err) {
        fail(`Jump host ${jump.host}: ${(err as Error).message}`);
    }
}
