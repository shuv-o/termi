/**
 * In-Memory Rate Limiter
 *
 * Sliding-window rate limiter for protecting auth endpoints.
 * For multi-instance deployments, swap the Map for a Redis-backed store.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number; // epoch ms
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(
        () => {
            const now = Date.now();
            for (const [key, entry] of store.entries()) {
                if (entry.resetAt < now) {
                    store.delete(key);
                }
            }
        },
        5 * 60 * 1000,
    );
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number; // epoch ms
}

/**
 * Check and update the rate limit for a key.
 *
 * @param key      - Unique identifier (e.g., "login:127.0.0.1")
 * @param limit    - Maximum number of requests in the window
 * @param windowMs - Window duration in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + windowMs };
        store.set(key, entry);
    }

    entry.count++;

    return {
        allowed: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        resetAt: entry.resetAt,
    };
}

// PRE-CONFIGURED LIMITERS

/** 10 login attempts per 15 minutes per IP */
export function loginRateLimit(ip: string): RateLimitResult {
    return rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
}

/** 5 register attempts per hour per IP */
export function registerRateLimit(ip: string): RateLimitResult {
    return rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
}

/** 5 verify-2FA attempts per 5 minutes per IP */
export function verify2FARateLimit(ip: string): RateLimitResult {
    return rateLimit(`verify2fa:${ip}`, 5, 5 * 60 * 1000);
}

/** 3 email OTP send requests per 10 minutes per user */
export function emailOtpRateLimit(userId: string): RateLimitResult {
    return rateLimit(`emailotp:${userId}`, 3, 10 * 60 * 1000);
}

/** 3 credential reveal attempts per 5 minutes per user */
export function credentialRevealRateLimit(userId: string): RateLimitResult {
    return rateLimit(`reveal:${userId}`, 3, 5 * 60 * 1000);
}

/**
 * 5 server exports per hour per user.
 *
 * Tighter than most limits here: one successful export hands over every
 * credential the account holds, so this is the blast radius of a stolen
 * session, not merely of a noisy client.
 */
export function serverExportRateLimit(userId: string): RateLimitResult {
    return rateLimit(`server-export:${userId}`, 5, 60 * 60 * 1000);
}

/** 10 server imports per hour per user */
export function serverImportRateLimit(userId: string): RateLimitResult {
    return rateLimit(`server-import:${userId}`, 10, 60 * 60 * 1000);
}

/** 10 passkey authentication attempts per 5 minutes per IP */
export function passkeyAuthRateLimit(ip: string): RateLimitResult {
    return rateLimit(`passkey-auth:${ip}`, 10, 5 * 60 * 1000);
}

/** 20 connection test attempts per 5 minutes per user */
export function connectionTestRateLimit(userId: string): RateLimitResult {
    return rateLimit(`conn-test:${userId}`, 20, 5 * 60 * 1000);
}

/** 30 connection token requests per 5 minutes per user */
export function connectionTokenRateLimit(userId: string): RateLimitResult {
    return rateLimit(`conn-token:${userId}`, 30, 5 * 60 * 1000);
}

/** 3 forgot-password requests per hour per IP */
export function forgotPasswordRateLimit(ip: string): RateLimitResult {
    return rateLimit(`forgot-password:${ip}`, 3, 60 * 60 * 1000);
}

/** 3 resend-verification requests per hour per user */
export function sendVerificationRateLimit(userId: string): RateLimitResult {
    return rateLimit(`send-verification:${userId}`, 3, 60 * 60 * 1000);
}

/**
 * 10 group-broadcast command runs per 5 minutes per user.
 *
 * Each run opens SSH connections to every server in a group and executes
 * arbitrary input there, so this is throttled more like a mutating action
 * than a read — the risk is "commands run," not request volume.
 */
export function broadcastCommandRateLimit(userId: string): RateLimitResult {
    return rateLimit(`broadcast:${userId}`, 10, 5 * 60 * 1000);
}

/** 20 tunnel-open attempts per 10 minutes per user — each opens a real listening port. */
export function tunnelCreateRateLimit(userId: string): RateLimitResult {
    return rateLimit(`tunnel-create:${userId}`, 20, 10 * 60 * 1000);
}
