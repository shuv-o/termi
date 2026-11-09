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
    /**
     * The web sign-in (Session id) asking for the token. The gateway closes
     * the connection once that sign-in is revoked or expires (see
     * POST /api/internal/access-check). Required so no caller forgets it.
     */
    sid: string;
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
    /** 'tunnel' only: the kind of forwarding (gateway: handlers/tunnel-mux.ts). */
    forward?:
        | { kind: 'local' }
        | { kind: 'dynamic' }
        | { kind: 'remote'; bindAddress: string; bindPort: number };
    /**
     * 'ssh' only, owner only: sign in with this FIDO2 security key — the
     * gateway asks the browser for each signature. Public data only.
     */
    securityKey?: { credentialId: string; publicKey: string; rpId: string } | null;
    /** 'ssh' only: join someone's live session as a guest (no credentials). */
    join?: {
        sessionId: string;
        ownerId: string;
        email: string;
        mode: 'view' | 'control';
        /** The share link: turning it off removes the guest (gateway access check). */
        shareId: string;
    } | null;
    /**
     * The server's pinned SSH host key (`SHA256:…`). The gateway refuses any
     * other key, and refuses SSH-family connections that carry none.
     */
    hostKey?: string | null;
    /** Device tokens only: no key recorded yet, record the first one seen. */
    hostKeyFirstUse?: boolean;
    /** OpenSSH user certificate for privateKey. */
    certificate?: string | null;
    /** 'ssh' only, owner only: forward an agent holding these keys. */
    agent?: {
        mode: 'on' | 'confirm';
        keys: { comment: string; privateKey: string; passphrase?: string | null }[];
    } | null;
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
        hostKeyFirstUse?: boolean;
        certificate?: string | null;
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
              certificate?: string | null;
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
        certificate: jump.certificate ?? null,
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

/**
 * Reads a gateway service token (apps/gateway/src/auth/token.ts
 * mintServiceToken): true only for an unexpired token made for `purpose`.
 * Connection tokens have no `purpose`, so one handed to a browser can never
 * call an internal endpoint.
 */
export async function verifyServiceToken(token: string, purpose: string): Promise<boolean> {
    try {
        const { payload } = await jose.jwtDecrypt(token, getJWEKey(), {
            contentEncryptionAlgorithms: ['A256GCM'],
            keyManagementAlgorithms: ['dir'],
            maxTokenAge: '2m',
        });
        return payload.purpose === purpose;
    } catch {
        return false;
    }
}

export function getGatewayUrl(): string {
    return process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:22080/gateway';
}
