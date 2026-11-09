/**
 * Token Validation for Gateway
 *
 * Validates JWE tokens (A256GCM) issued by the web app.
 * Credentials are decrypted only inside the gateway process.
 */

import * as jose from 'jose';
import { createHash } from 'crypto';
import type { HostKeyExpectation } from './host-key.js';
import { LOCAL_MODE, deviceKeys } from '../local/device.js';

export interface TokenPayload {
    userId: string;
    serverId: string;
    protocol: 'ssh' | 'scp' | 'rdp' | 'vnc' | 'telnet' | 'local' | 'tunnel';
    // host/username are present for remote protocols, absent for 'local'
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
    // 'tunnel' protocol only — the internal address (reachable from `host`'s own
    // network) that forwardOut targets. Not secret: equivalent to what the user
    // could already reach with a normal interactive session on this server.
    remoteHost?: string;
    remotePort?: number;
    /**
     * 'tunnel' only: which kind of forwarding (see handlers/tunnel-mux.ts).
     * Absent on tokens from older web versions, which mean 'local'.
     */
    forward?:
        | { kind: 'local' }
        | { kind: 'dynamic' }
        | { kind: 'remote'; bindAddress: string; bindPort: number };
    /** The server's pinned SSH host key (`SHA256:…`); SSH is refused without it. */
    hostKey?: HostKeyExpectation;
    /**
     * Desktop app only: the server has no recorded key yet, so the first one
     * seen is accepted and reported back (local/device.ts).
     */
    hostKeyFirstUse?: boolean;
    /** Desktop app only: the device the token was sealed to. */
    deviceKeyId?: string;
    /** OpenSSH user certificate for `privateKey`. */
    certificate?: string | null;
    /**
     * 'ssh' only: forward an agent holding these keys (see handlers/agent.ts).
     * Only ever set when the server's owner connects.
     */
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
        hostKey?: HostKeyExpectation;
        hostKeyFirstUse?: boolean;
        certificate?: string | null;
    } | null;
    /** 'ssh' only: sign in with this FIDO2 security key (signatures come from the browser). */
    securityKey?: { credentialId: string; publicKey: string; rpId: string } | null;
    /**
     * 'ssh' only: this token joins someone else's live session as a guest
     * (see sessions/guests.ts) instead of opening a connection. No
     * credentials are carried.
     */
    join?: {
        sessionId: string;
        ownerId: string;
        email: string;
        mode: 'view' | 'control';
        /** The share link it was minted from: turning the link off removes the guest. */
        shareId?: string;
    } | null;
    /**
     * The web sign-in (Session id) that minted this token. The access check
     * (sessions/access-check.ts) closes the connection when that sign-in is
     * revoked or expires. Absent only on tokens from an older web app.
     */
    sid?: string | null;
    exp: number;
}

// Key derivation MUST stay byte-for-byte identical to the web app's
// getJWEKey (apps/web/src/lib/auth/connectionToken.ts), otherwise tokens
// encrypted by the web app will fail to decrypt here. In particular, an unset
// or placeholder secret in development must derive from the SAME fallback
// string on both sides.
const PLACEHOLDER_SECRET = 'gateway-secret-key-change-in-production';

function getJWEKey(): Uint8Array {
    const secret = process.env.GATEWAY_JWT_SECRET;
    if (!secret || secret === PLACEHOLDER_SECRET || /^change-me/i.test(secret)) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'GATEWAY_JWT_SECRET must be set to a strong random value in production',
            );
        }
        // Dev fallback — must match the web app's dev fallback exactly.
        return new Uint8Array(createHash('sha256').update('dev-gateway-secret').digest());
    }
    return new Uint8Array(createHash('sha256').update(secret).digest());
}

/**
 * Validate and decrypt a JWE connection token.
 * Only the gateway (holding the key) can read the payload.
 */
export async function validateToken(token: string): Promise<TokenPayload> {
    try {
        // The desktop app's own gateway opens only tokens sealed to its device.
        const { payload } = LOCAL_MODE
            ? await jose.jwtDecrypt(token, (await deviceKeys()).enc, {
                  keyManagementAlgorithms: ['ECDH-ES'],
                  contentEncryptionAlgorithms: ['A256GCM'],
              })
            : await jose.jwtDecrypt(token, getJWEKey(), {
                  contentEncryptionAlgorithms: ['A256GCM'],
              });
        if (LOCAL_MODE) {
            if (payload.deviceKeyId !== (await deviceKeys()).keyId) {
                throw new Error('Token sealed to another device');
            }
            // Joining someone's live session only ever happens on the server.
            if (payload.join) throw new Error('Invalid token payload');
        } else if (payload.deviceKeyId !== undefined || payload.hostKeyFirstUse !== undefined) {
            // A device token on the shared gateway is a mix-up, never valid here.
            throw new Error('Invalid token payload');
        }

        if (!payload.userId || !payload.serverId) {
            throw new Error('Invalid token payload');
        }
        // A service token (gateway ↔ web, see mintServiceToken) is never a
        // connection token.
        if (payload.purpose !== undefined) {
            throw new Error('Invalid token payload');
        }

        const VALID_PROTOCOLS = ['ssh', 'scp', 'rdp', 'vnc', 'telnet', 'local', 'tunnel'] as const;
        if (
            !payload.protocol ||
            !VALID_PROTOCOLS.includes(payload.protocol as (typeof VALID_PROTOCOLS)[number])
        ) {
            throw new Error('Invalid token protocol');
        }

        // Remote protocols require host and username; local does not, and nor
        // does a guest joining someone's live session (it dials nothing).
        const join = payload.join as TokenPayload['join'];
        const isGuest =
            payload.protocol === 'ssh' &&
            !!join &&
            typeof join.sessionId === 'string' &&
            typeof join.ownerId === 'string' &&
            (join.mode === 'view' || join.mode === 'control');
        if (payload.protocol !== 'local' && !isGuest && (!payload.host || !payload.username)) {
            throw new Error('Invalid token payload');
        }

        return payload as unknown as TokenPayload;
    } catch (error) {
        if (error instanceof jose.errors.JWTExpired) {
            throw new Error('Token expired');
        }
        throw new Error('Invalid token');
    }
}

/**
 * A short-lived token proving a request comes from this gateway, for the
 * web app's internal endpoints (`purpose` names the one endpoint it is for).
 * Same key as connection tokens; validateToken refuses anything with a
 * `purpose`, and the web app refuses anything without the right one, so
 * neither kind can stand in for the other.
 */
export async function mintServiceToken(purpose: string): Promise<string> {
    return new jose.EncryptJWT({ purpose })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setExpirationTime('60s')
        .encrypt(getJWEKey());
}
