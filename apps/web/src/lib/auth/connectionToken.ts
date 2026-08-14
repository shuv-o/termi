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
    if (!secret || secret === 'gateway-secret-key-change-in-production') {
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
