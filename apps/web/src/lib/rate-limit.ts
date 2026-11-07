/**
 * Rate limiter.
 *
 * Fixed-window counters. With REDIS_URL set they live in Redis, so limits hold
 * across restarts and every instance of the web app shares them; without it
 * they live in this process's memory (fine for a single instance). If Redis
 * becomes unreachable the limiter falls back to memory rather than failing
 * open.
 */

import Redis from 'ioredis';

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number; // epoch ms
}

// MEMORY STORE

interface RateLimitEntry {
    count: number;
    resetAt: number; // epoch ms
}

const memory = new Map<string, RateLimitEntry>();

if (typeof setInterval !== 'undefined') {
    const timer = setInterval(
        () => {
            const now = Date.now();
            for (const [key, entry] of memory.entries()) {
                if (entry.resetAt < now) memory.delete(key);
            }
        },
        5 * 60 * 1000,
    );
    timer.unref?.();
}

function memoryIncrement(key: string, windowMs: number): { count: number; resetAt: number } {
    const now = Date.now();
    let entry = memory.get(key);
    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + windowMs };
        memory.set(key, entry);
    }
    entry.count++;
    return { count: entry.count, resetAt: entry.resetAt };
}

// REDIS STORE

let redis: Redis | null | undefined;
let warnedRedisDown = false;

function getRedis(): Redis | null {
    if (redis !== undefined) return redis;
    const url = process.env.REDIS_URL;
    if (!url) return (redis = null);
    redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: false,
    });
    redis.on('error', (err) => {
        if (!warnedRedisDown) {
            warnedRedisDown = true;
            console.error('[rate-limit] Redis unavailable, using in-memory limits:', err.message);
        }
    });
    redis.on('ready', () => {
        warnedRedisDown = false;
    });
    return redis;
}

async function increment(
    key: string,
    windowMs: number,
): Promise<{ count: number; resetAt: number }> {
    const client = getRedis();
    if (client && client.status === 'ready') {
        try {
            const k = `termi:rl:${key}`;
            const res = await client.multi().set(k, 0, 'PX', windowMs, 'NX').incr(k).pttl(k).exec();
            const count = Number(res?.[1]?.[1]);
            const ttl = Number(res?.[2]?.[1]);
            if (Number.isFinite(count)) {
                return { count, resetAt: Date.now() + (ttl > 0 ? ttl : windowMs) };
            }
        } catch {
            // fall through to memory
        }
    }
    return memoryIncrement(key, windowMs);
}

/** Forget a counter (e.g. after a successful verification). */
export async function resetCounter(key: string): Promise<void> {
    memory.delete(key);
    const client = getRedis();
    if (client && client.status === 'ready') {
        await client.del(`termi:rl:${key}`).catch(() => undefined);
    }
}

/** Count one event and return the running total within its window. */
export async function countEvent(key: string, windowMs: number): Promise<number> {
    return (await increment(key, windowMs)).count;
}

/**
 * Check and update the rate limit for a key.
 *
 * @param key      - Unique identifier (e.g., "login:127.0.0.1")
 * @param limit    - Maximum number of requests in the window
 * @param windowMs - Window duration in milliseconds
 */
export async function rateLimit(
    key: string,
    limit: number,
    windowMs: number,
): Promise<RateLimitResult> {
    const { count, resetAt } = await increment(key, windowMs);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}

// PRE-CONFIGURED LIMITERS

/** 10 login attempts per 15 minutes per IP */
export function loginRateLimit(ip: string): Promise<RateLimitResult> {
    return rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
}

/** 5 register attempts per hour per IP */
export function registerRateLimit(ip: string): Promise<RateLimitResult> {
    return rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
}

/** 5 verify-2FA attempts per 5 minutes per IP */
export function verify2FARateLimit(ip: string): Promise<RateLimitResult> {
    return rateLimit(`verify2fa:${ip}`, 5, 5 * 60 * 1000);
}

/** 3 email OTP send requests per 10 minutes per user */
export function emailOtpRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`emailotp:${userId}`, 3, 10 * 60 * 1000);
}

/** 3 credential reveal attempts per 5 minutes per user */
export function credentialRevealRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`reveal:${userId}`, 3, 5 * 60 * 1000);
}

/**
 * 5 server exports per hour per user.
 *
 * Tighter than most limits here: one successful export hands over every
 * credential the account holds, so this is the blast radius of a stolen
 * session, not merely of a noisy client.
 */
export function serverExportRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`server-export:${userId}`, 5, 60 * 60 * 1000);
}

/** 10 server imports per hour per user */
export function serverImportRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`server-import:${userId}`, 10, 60 * 60 * 1000);
}

/** 10 passkey authentication attempts per 5 minutes per IP */
export function passkeyAuthRateLimit(ip: string): Promise<RateLimitResult> {
    return rateLimit(`passkey-auth:${ip}`, 10, 5 * 60 * 1000);
}

/** 20 connection test attempts per 5 minutes per user */
export function connectionTestRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`conn-test:${userId}`, 20, 5 * 60 * 1000);
}

/** 5 hardening runs per hour per user — each one changes a server's login. */
export function serverHardenRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`server-harden:${userId}`, 5, 60 * 60 * 1000);
}

/** 10 security scans per 10 minutes per user — each one runs a script over SSH. */
export function securityScanRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`security-scan:${userId}`, 10, 10 * 60 * 1000);
}

/** 30 connection token requests per 5 minutes per user */
export function connectionTokenRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`conn-token:${userId}`, 30, 5 * 60 * 1000);
}

/** 3 forgot-password requests per hour per IP */
export function forgotPasswordRateLimit(ip: string): Promise<RateLimitResult> {
    return rateLimit(`forgot-password:${ip}`, 3, 60 * 60 * 1000);
}

/** 3 resend-verification requests per hour per user */
export function sendVerificationRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`send-verification:${userId}`, 3, 60 * 60 * 1000);
}

/**
 * 10 group-broadcast command runs per 5 minutes per user.
 *
 * Each run opens SSH connections to every server in a group and executes
 * arbitrary input there, so this is throttled more like a mutating action
 * than a read — the risk is "commands run," not request volume.
 */
export function broadcastCommandRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`broadcast:${userId}`, 10, 5 * 60 * 1000);
}

/** 20 tunnel-open attempts per 10 minutes per user — each opens a real listening port. */
export function tunnelCreateRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`tunnel-create:${userId}`, 20, 10 * 60 * 1000);
}

/** 20 recording saves per hour per user — each stores up to 5 MB of text. */
export function recordingCreateRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`recording-create:${userId}`, 20, 60 * 60 * 1000);
}

/**
 * Per-account limits for code verification. The IP-based limiters can be
 * sidestepped by rotating client IPs (or forwarding headers), so 2FA and
 * signup codes are also bounded per user: 10 tries per 15 minutes.
 */
export function verify2FAAccountRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`verify2fa-user:${userId}`, 10, 15 * 60 * 1000);
}

export function verifySignupRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`verify-signup:${userId}`, 10, 15 * 60 * 1000);
}

/**
 * Decrypted keychain reads: 30 per 5 minutes per user. Generous enough for
 * the keychain page and the server form, but caps bulk extraction from a
 * hijacked session or injected script.
 */
export function keychainReadRateLimit(userId: string): Promise<RateLimitResult> {
    return rateLimit(`keychain-read:${userId}`, 30, 5 * 60 * 1000);
}
