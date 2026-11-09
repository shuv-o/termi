/**
 * Device mode: this gateway runs inside the Termi desktop app (LOCAL_GATEWAY=1)
 * so SSH, file transfer and port forwarding to servers the user owns go
 * straight from their computer, with everything else unchanged.
 *
 * - Listens on 127.0.0.1 only, and every connection must carry the secret
 *   the app generated at launch (`lk` query parameter).
 * - Opens only tokens the web app sealed to this device (ECDH-ES to the
 *   device's public key; see auth/token.ts). There is no shared secret.
 * - Proves itself to the web app with a short-lived ES256 token signed by the
 *   device key, for the access check and for recording a first-use host key.
 *
 * The keys arrive from the desktop app's main process over its message port;
 * they never leave this computer.
 */

import { timingSafeEqual } from 'crypto';
import * as jose from 'jose';
import type { TokenPayload } from '../auth/token.js';

export const LOCAL_MODE = process.env.LOCAL_GATEWAY === '1';

interface DeviceKeys {
    enc: CryptoKey | Uint8Array;
    sig: CryptoKey | Uint8Array;
    /** JWK thumbprint of the public signing key: how the web app knows this device. */
    keyId: string;
}

interface LocalConfig {
    secret: string;
    keys: DeviceKeys;
}

let config: LocalConfig | null = null;
let configured: Promise<LocalConfig> | null = null;

interface ParentPort {
    on(event: 'message', cb: (e: { data: unknown }) => void): void;
    postMessage(m: unknown): void;
}

export const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;

/**
 * Wait for the desktop app to hand over the launch secret and device keys.
 * They come over the utility process's message port rather than the
 * environment, which other programs of the same user could read.
 */
export function receiveLocalConfig(): Promise<LocalConfig> {
    if (!LOCAL_MODE) return Promise.reject(new Error('Not running in device mode'));
    if (!parentPort) return Promise.reject(new Error('Device mode needs the desktop app'));
    configured ??= new Promise<LocalConfig>((resolve, reject) => {
        parentPort.on('message', (e) => {
            if (config) return; // set once; later messages are ignored
            const m = e.data as { type?: string; secret?: unknown; enc?: jose.JWK; sig?: jose.JWK };
            if (m?.type !== 'config') return;
            (async () => {
                if (typeof m.secret !== 'string' || m.secret.length < 32) {
                    throw new Error('Launch secret missing');
                }
                if (!m.enc?.d || !m.sig?.d) throw new Error('Device keys missing');
                const { kty, crv, x, y } = m.sig;
                config = {
                    secret: m.secret,
                    keys: {
                        enc: await jose.importJWK(m.enc, 'ECDH-ES'),
                        sig: await jose.importJWK(m.sig, 'ES256'),
                        keyId: await jose.calculateJwkThumbprint({ kty, crv, x, y }),
                    },
                };
                return config;
            })().then(resolve, reject);
        });
    });
    return configured;
}

export function deviceKeys(): Promise<DeviceKeys> {
    if (config) return Promise.resolve(config.keys);
    return receiveLocalConfig().then((c) => c.keys);
}

/** `Authorization` header value proving a request comes from this device. */
export async function deviceAuthorization(purpose: string): Promise<string> {
    const { sig, keyId } = await deviceKeys();
    const jwt = await new jose.SignJWT({ purpose })
        .setProtectedHeader({ alg: 'ES256', kid: keyId })
        .setIssuedAt()
        .setExpirationTime('60s')
        .sign(sig);
    return `Device ${jwt}`;
}

const WEB_URL =
    process.env.WEB_INTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:22080';

/** Tell the web app which host key a server presented on its first use. */
async function reportHostKey(
    serverId: string,
    jump: boolean,
    fingerprint: string,
    keyType: string,
) {
    try {
        const res = await fetch(new URL('/api/devices/host-key', WEB_URL), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: await deviceAuthorization('host-key'),
            },
            body: JSON.stringify({ serverId, jump, fingerprint, keyType }),
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) console.warn(`[device] Recording the host key failed: HTTP ${res.status}`);
    } catch (err) {
        console.warn('[device] Recording the host key failed:', (err as Error).message);
    }
}

/**
 * For a server with no recorded key, accept the first one seen and report it.
 * The web app keeps it only if the server is still unpinned and this device's
 * user owns it; every later connection is checked against it strictly.
 */
export function armFirstUse(token: TokenPayload): void {
    if (!LOCAL_MODE) return;
    if (token.hostKeyFirstUse && !token.hostKey) {
        token.hostKey = {
            onFirstUse: (fp, type) => void reportHostKey(token.serverId, false, fp, type),
        };
    }
    if (token.jump?.hostKeyFirstUse && !token.jump.hostKey) {
        token.jump.hostKey = {
            onFirstUse: (fp, type) => void reportHostKey(token.serverId, true, fp, type),
        };
    }
}

/** A connection to the desktop app's gateway must carry the launch secret. */
export function localSecretOk(url: URL): boolean {
    if (!LOCAL_MODE) return true;
    const secret = config?.secret;
    const given = url.searchParams.get('lk') ?? '';
    if (!secret || given.length !== secret.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
