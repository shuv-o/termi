/**
 * Connection Token Minting
 *
 * Shared by /api/connection/token and /api/tunnels — both hand the gateway an
 * encrypted JWE token so it can open the right connection without ever
 * touching Postgres itself (the gateway has no DB access).
 */

import * as jose from 'jose';
import { createHash } from 'crypto';

export function getJWEKey(): Uint8Array {
    const secret = process.env.GATEWAY_JWT_SECRET;
    if (
        !secret ||
        secret === 'gateway-secret-key-change-in-production' ||
        /^change-me/i.test(secret)
    ) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'GATEWAY_JWT_SECRET must be set to a strong random value in production',
            );
        }
        // Dev fallback
        return new Uint8Array(createHash('sha256').update('dev-gateway-secret').digest());
    }
    return new Uint8Array(createHash('sha256').update(secret).digest());
}

export interface ConnectionTokenClaims {
    userId: string;
    serverId: string;
    protocol: 'ssh' | 'scp' | 'rdp' | 'vnc' | 'telnet' | 'local' | 'tunnel';
    host: string;
    port: number;
    username: string;
    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
    displayWidth?: number;
    displayHeight?: number;
    colorDepth?: number;
    rdpSecurity?: string;
    remoteHost?: string;
    remotePort?: number;
    /**
     * The server's pinned SSH host key (`SHA256:…`). The gateway refuses any
     * other key, and refuses SSH-family connections that carry none.
     */
    hostKey?: string | null;
    /**
     * Optional bastion. When present the gateway connects here first and
     * reaches `host:port` over a `forwardOut` channel, like `ssh -J`.
     */
    jump?: {
        host: string;
        port: number;
        username: string;
        password?: string | null;
        privateKey?: string | null;
        passphrase?: string | null;
        /** The bastion's pinned SSH host key. */
        hostKey: string | null;
    } | null;
}

/** The `jump` claim for a server's (already decrypted) jump host, if any. */
export function jumpClaim(
    jump:
        | {
              host: string;
              port: number;
              username: string;
              password?: string;
              privateKey?: string;
              passphrase?: string;
              hostKey: { fingerprint: string | null };
          }
        | null
        | undefined,
): ConnectionTokenClaims['jump'] {
    if (!jump) return null;
    return {
        host: jump.host,
        port: jump.port,
        username: jump.username,
        password: jump.password ?? null,
        privateKey: jump.privateKey ?? null,
        passphrase: jump.passphrase ?? null,
        hostKey: jump.hostKey.fingerprint,
    };
}

/** Mints a 5-minute JWE connection token — only long enough to bootstrap the
 *  gateway connection; the connection itself persists independently once open. */
export async function mintConnectionToken(claims: ConnectionTokenClaims): Promise<string> {
    const key = getJWEKey();
    return new jose.EncryptJWT({ ...claims })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setExpirationTime('5m')
        .setIssuedAt()
        .encrypt(key);
}

export function getGatewayUrl(): string {
    return process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:22080/gateway';
}
