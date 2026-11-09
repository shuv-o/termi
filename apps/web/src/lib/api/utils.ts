/**
 * API Utilities and Response Helpers
 */

import { NextResponse } from 'next/server';
import { ZodError, ZodSchema } from 'zod';

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    errors?: Record<string, string[]>;
}

// Every JSON API response goes through these helpers, and many carry
// per-session/per-user data (e.g. /api/auth/me). Without an explicit
// no-store directive, a shared cache sitting in front of the deployment
// (CDN, reverse proxy) is free to cache one user's authenticated response
// and replay it to the next visitor — including an unauthenticated one.
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

export function successResponse<T>(data: T, status: number = 200) {
    return NextResponse.json<ApiResponse<T>>(
        { success: true, data },
        { status, headers: NO_STORE_HEADERS },
    );
}

export function errorResponse(error: string, status: number = 400) {
    return NextResponse.json<ApiResponse>(
        { success: false, error },
        { status, headers: NO_STORE_HEADERS },
    );
}

export function validationErrorResponse(errors: Record<string, string[]>) {
    return NextResponse.json<ApiResponse>(
        { success: false, error: 'Validation failed', errors },
        { status: 400, headers: NO_STORE_HEADERS },
    );
}

export function unauthorizedResponse(message: string = 'Unauthorized') {
    return NextResponse.json<ApiResponse>(
        { success: false, error: message },
        { status: 401, headers: NO_STORE_HEADERS },
    );
}

export function forbiddenResponse(message: string = 'Forbidden') {
    return NextResponse.json<ApiResponse>(
        { success: false, error: message },
        { status: 403, headers: NO_STORE_HEADERS },
    );
}

export function notFoundResponse(message: string = 'Not found') {
    return NextResponse.json<ApiResponse>(
        { success: false, error: message },
        { status: 404, headers: NO_STORE_HEADERS },
    );
}

export function serverErrorResponse(message: string = 'Internal server error') {
    return NextResponse.json<ApiResponse>(
        { success: false, error: message },
        { status: 500, headers: NO_STORE_HEADERS },
    );
}

/**
 * Validate request body against a Zod schema
 */
export async function validateBody<T>(
    request: Request,
    schema: ZodSchema<T>,
): Promise<{ data: T } | { error: NextResponse }> {
    try {
        const body = await request.json();
        const data = schema.parse(body);
        return { data };
    } catch (e) {
        if (e instanceof ZodError) {
            const errors: Record<string, string[]> = {};
            for (const issue of e.issues) {
                const path = issue.path.join('.');
                if (!errors[path]) {
                    errors[path] = [];
                }
                errors[path].push(issue.message);
            }
            return { error: validationErrorResponse(errors) };
        }
        return { error: errorResponse('Invalid JSON body') };
    }
}

/**
 * Get the client's IP address, for rate limiting and audit logs.
 *
 * Forwarding headers are set by whoever sends the request, so a header is
 * only trusted when the deployment says which proxy sets it (TRUSTED_PROXY):
 *
 *   cloudflare       CF-Connecting-IP. Only sound if the origin accepts traffic
 *                    from Cloudflare alone — otherwise anyone can send it directly.
 *   x-real-ip        X-Real-IP, set by a single reverse proxy (nginx, Traefik…).
 *   x-forwarded-for  The last X-Forwarded-For entry (the one our proxy added).
 *   true             Same as x-forwarded-for (the setting's original meaning).
 *
 * Unset: no header is trusted and every client shares the 'unknown' bucket.
 * Per-account limits (login lockout, 2FA/OTP attempts) still apply per user.
 */
let warnedNoTrustedProxy = false;

export function getClientIP(request: Request): string {
    const mode = (process.env.TRUSTED_PROXY ?? '').trim().toLowerCase();
    const header = (name: string) => request.headers.get(name)?.trim() || null;

    switch (mode) {
        case 'cloudflare':
            return header('cf-connecting-ip') ?? 'unknown';
        case 'x-real-ip':
            return header('x-real-ip') ?? 'unknown';
        case 'x-forwarded-for':
        case 'true': {
            const ips = (header('x-forwarded-for') ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            return ips[ips.length - 1] ?? 'unknown';
        }
        default:
            if (!warnedNoTrustedProxy && process.env.NODE_ENV === 'production') {
                warnedNoTrustedProxy = true;
                console.warn(
                    '[security] TRUSTED_PROXY is not set, so no client-IP header is trusted and ' +
                        'per-IP rate limits are shared by all clients. Behind a proxy, set ' +
                        'TRUSTED_PROXY=cloudflare | x-real-ip | x-forwarded-for.',
                );
            }
            return 'unknown';
    }
}

/**
 * Get device info from User-Agent
 */
export function getDeviceInfo(request: Request): string {
    return request.headers.get('user-agent') || 'Unknown Device';
}
