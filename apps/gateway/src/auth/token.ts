/**
 * Token Validation for Gateway
 *
 * Validates JWE tokens (A256GCM) issued by the web app.
 * Credentials are decrypted only inside the gateway process.
 */

import * as jose from 'jose';
import { createHash } from 'crypto';

// TYPES

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
    exp: number;
}

// KEY DERIVATION

// Key derivation MUST stay byte-for-byte identical to the web app's
// getJWEKey (apps/web/.../api/connection/token/route.ts), otherwise tokens
// encrypted by the web app will fail to decrypt here. In particular, an unset
// or placeholder secret in development must derive from the SAME fallback
// string on both sides.
const PLACEHOLDER_SECRET = 'gateway-secret-key-change-in-production';

function getJWEKey(): Uint8Array {
    const secret = process.env.GATEWAY_JWT_SECRET;
    if (!secret || secret === PLACEHOLDER_SECRET) {
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

// TOKEN VALIDATION

/**
 * Validate and decrypt a JWE connection token.
 * Only the gateway (holding the key) can read the payload.
 */
export async function validateToken(token: string): Promise<TokenPayload> {
    try {
        const key = getJWEKey();
        const { payload } = await jose.jwtDecrypt(token, key, {
            contentEncryptionAlgorithms: ['A256GCM'],
        });

        if (!payload.userId || !payload.serverId) {
            throw new Error('Invalid token payload');
        }

        const VALID_PROTOCOLS = ['ssh', 'scp', 'rdp', 'vnc', 'telnet', 'local', 'tunnel'] as const;
        if (
            !payload.protocol ||
            !VALID_PROTOCOLS.includes(payload.protocol as (typeof VALID_PROTOCOLS)[number])
        ) {
            throw new Error('Invalid token protocol');
        }

        // Remote protocols require host and username; local does not
        if (payload.protocol !== 'local' && (!payload.host || !payload.username)) {
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
