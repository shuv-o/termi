import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, isDesktopDevice, type SessionData } from '@/lib/auth/session-config';
import { TUNNEL_SANDBOX } from '@/lib/security/tunnel-sandbox';
import { tunnelIdFromHost } from '@/lib/security/tunnel-origin';

// Slide the desktop session cookie at most once per hour. Each save re-issues
// the cookie with a fresh 30-day maxAge, so any interaction within the window
// keeps the Electron user signed in for another 30 days.
const DESKTOP_COOKIE_SLIDE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * For Electron desktop requests, refresh the iron-session cookie so its 30-day
 * lifetime rolls forward on activity. The authoritative DB expiry is slid
 * separately in validateSession(); this only keeps the cookie itself alive.
 * Best-effort — any failure must never block the request.
 */
async function slideDesktopSession(request: NextRequest, response: NextResponse) {
    if (!isDesktopDevice(request.headers.get('user-agent'))) return;
    // Auth routes (login / logout / 2FA) own the session cookie themselves —
    // never write a competing Set-Cookie for them.
    if (request.nextUrl.pathname.startsWith('/api/auth/')) return;
    try {
        const session = await getIronSession<SessionData>(request, response, sessionOptions);
        if (!session.isLoggedIn) return;
        const now = Date.now();
        if (session.lastActivity && now - session.lastActivity < DESKTOP_COOKIE_SLIDE_INTERVAL_MS) {
            return;
        }
        session.lastActivity = now;
        await session.save(); // re-issues Set-Cookie with a fresh 30-day maxAge
    } catch {
        // ignore — never block a request over a cookie refresh
    }
}

export async function proxy(request: NextRequest) {
    // Redirect users from specific domains to termi.run
    const host = request.headers.get('host') || '';
    const url = new URL(request.url);

    // Check if the request is from termi.shuvoo.com or termix.run
    if (host === 'termi.shuvoo.com' || host === 'termix.run') {
        // Redirect to termi.run with the same path and query
        const redirectUrl = new URL(url.pathname + url.search, 'https://termi.run');
        return NextResponse.redirect(redirectUrl, {
            status: 301, // Permanent redirect
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                Pragma: 'no-cache',
                Expires: '0',
            },
        });
    }

    // Per-tunnel origins (TUNNEL_ORIGIN_TEMPLATE) serve tunneled apps and
    // nothing else: no Termi pages or API, no Termi CSP or session handling.
    if (tunnelIdFromHost(host)) {
        if (!url.pathname.startsWith('/tunnel/')) {
            return new NextResponse('Not found', { status: 404 });
        }
        const tunnelResponse = NextResponse.next();
        tunnelResponse.headers.set('X-Content-Type-Options', 'nosniff');
        tunnelResponse.headers.set('Referrer-Policy', 'no-referrer');
        return tunnelResponse;
    }

    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const isDev = process.env.NODE_ENV !== 'production';
    const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:22080/gateway';

    // Convert the gateway HTTP/WS URL to both ws: and wss: forms so CSP covers
    // both dev (ws://) and prod (wss://) without opening a wildcard.
    const gatewayWsOrigin = gatewayUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');
    // Also allow the https/http origin for fetch-based health checks
    const gatewayHttpOrigin = gatewayUrl
        .replace(/^wss:\/\//, 'https://')
        .replace(/^ws:\/\//, 'http://');

    // 'unsafe-eval' is only needed in development for Next.js hot reload (webpack eval)
    const scriptSrc = ["'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-eval'"] : [])].join(' ');

    const csp = [
        "default-src 'self'",
        `connect-src 'self' ${gatewayHttpOrigin} ${gatewayWsOrigin}`,
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'", // Tailwind inlines styles
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "frame-src 'none'",
        // Nobody may frame Termi (clickjacking); X-Frame-Options: DENY is the
        // legacy equivalent, kept below for old browsers.
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'upgrade-insecure-requests',
        // Tunneled apps are served from this origin but must never get it:
        // the sandbox gives them an opaque origin (see app/tunnel/.../route.ts).
        ...(url.pathname.startsWith('/tunnel/') ? [TUNNEL_SANDBOX] : []),
    ].join('; ');

    // Forward the nonce to server components via a request header
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);

    const response = NextResponse.next({ request: { headers: requestHeaders } });

    // Apply CSP and all other security headers on the response
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('X-Frame-Options', 'DENY');
    // Trusted Types, report-only: logs any DOM-XSS-prone sink (innerHTML etc.)
    // to the console without blocking, so it can be enforced once clean.
    // Not applied to tunneled pages, which aren't ours.
    if (!url.pathname.startsWith('/tunnel/')) {
        response.headers.set(
            'Content-Security-Policy-Report-Only',
            "require-trusted-types-for 'script'",
        );
    }
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    // includeSubDomains/preload commit every subdomain of the deployment's
    // domain to HTTPS for a year (and, once preloaded, into browsers' built-in
    // lists). That's the operator's decision for their own domain, so it's
    // opt-in; plain HSTS is always sent.
    response.headers.set(
        'Strict-Transport-Security',
        process.env.HSTS_PRELOAD === 'true'
            ? 'max-age=31536000; includeSubDomains; preload'
            : 'max-age=31536000',
    );
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    // A sandboxed tunnel page has an opaque origin, so same-origin CORP would
    // block it from loading even its own scripts and styles. Its resources are
    // reachable only through the unguessable tunnel token in the URL.
    response.headers.set(
        'Cross-Origin-Resource-Policy',
        url.pathname.startsWith('/tunnel/') ? 'cross-origin' : 'same-origin',
    );

    // Roll the desktop (Electron) session cookie forward on any interaction.
    await slideDesktopSession(request, response);

    return response;
}

export const config = {
    // Run on all routes except static files, Next.js internals, and dev-server
    // WebSocket endpoints (HMR / Turbopack live-reload).  Intercepting WebSocket
    // upgrade requests with NextResponse.next() + extra headers produces
    // ERR_INVALID_HTTP_RESPONSE in Electron (and browsers) because the 101
    // Switching Protocols response becomes malformed.
    matcher: [
        '/((?!_next/static|_next/image|_next/webpack-hmr|_next/on-demand-entries-ping|favicon.ico|icons|manifest.json).*)',
    ],
};
