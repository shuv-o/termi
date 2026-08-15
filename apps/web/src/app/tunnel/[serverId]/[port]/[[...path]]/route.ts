/**
 * /tunnel/[serverId]/[port]/[...path] — one-click HTTP reverse proxy for
 * port-forward tunnels.
 *
 * Visited directly in the browser (or via an iframe/new tab from the
 * server's detail page) — authenticated by the normal session cookie, no
 * token in the URL. Proxies the request through the SSH forwardOut channel
 * to the target, using this exact same origin/port, so it works behind a
 * reverse proxy that only forwards 80/443 (no arbitrary TCP listener needed).
 *
 * Bodies are streamed both ways rather than buffered, except HTML responses
 * up to MAX_HTML_REWRITE_BYTES, which are buffered just long enough to inject
 * a <base> tag (see below) — everything else, including large file transfers,
 * passes through without ever holding the full payload in memory.
 *
 * Known limitations:
 *  - Path-prefixed, not a dedicated subdomain, so a target app that emits
 *    absolute-path links/assets (most SPAs with a hardcoded root) will have
 *    broken links. The <base> tag fixes *relative* links only; absolute ones
 *    would need a real per-tunnel subdomain.
 *  - Targets that expect a WebSocket upgrade (dev servers with hot-reload,
 *    some admin panels) aren't supported — see the explicit check below.
 */

import http from 'node:http';
import { Readable } from 'node:stream';
import type { Duplex } from 'node:stream';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getServerForConnection } from '@/lib/services';
import { sshPool, type SSHPoolConfig } from '@/lib/services/ssh-pool';

interface RouteParams {
    params: Promise<{ serverId: string; port: string; path?: string[] }>;
}

const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
]);

// This route is same-origin with the rest of Termi, so the browser attaches
// the real session cookie (and any Authorization header) to every request
// here automatically. Forwarding either to the tunneled target — a third
// party as far as this credential is concerned — would leak a live Termix
// session to whatever's on the other end of the tunnel. Never forward these.
const CREDENTIAL_HEADERS = new Set(['cookie', 'authorization']);

// HTML responses are buffered (not streamed) so the <base> tag can be
// injected — bounded so a huge "text/html" response can't exhaust memory;
// past this size the body streams through unmodified instead.
const MAX_HTML_REWRITE_BYTES = 5 * 1024 * 1024;

/** Routes Node's http client over an already-open duplex stream instead of
 *  opening its own TCP socket — the standard pattern for HTTP-over-tunnel. */
class StreamAgent extends http.Agent {
    constructor(private readonly stream: Duplex) {
        super({ keepAlive: false });
    }
    override createConnection(): Duplex {
        return this.stream;
    }
}

/** Strips hop-by-hop and credential headers before forwarding a request to
 *  the tunneled target — see CREDENTIAL_HEADERS above for why. */
export function filterForwardHeaders(requestHeaders: Headers): Record<string, string> {
    const headers: Record<string, string> = {};
    requestHeaders.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (!HOP_BY_HOP_HEADERS.has(lower) && !CREDENTIAL_HEADERS.has(lower)) {
            headers[key] = value;
        }
    });
    return headers;
}

/** Re-scopes a Set-Cookie header's Path to this tunnel's own path, so a
 *  tunneled target's cookies never collide with Termi's own or another
 *  tunnel's. */
export function scopeCookiePath(cookie: string, basePath: string): string {
    return /;\s*Path=/i.test(cookie)
        ? cookie.replace(/;\s*Path=[^;]*/i, `; Path=${basePath}`)
        : `${cookie}; Path=${basePath}`;
}

/** Injects a <base> tag right after <head> so relative links/assets resolve
 *  against this tunnel's path prefix. No-op if the HTML already has one, or
 *  has no detectable <head>. */
export function injectBaseTag(html: string, basePath: string): string {
    if (!/<head[^>]*>/i.test(html) || /<base[\s>]/i.test(html)) return html;
    return html.replace(/<head([^>]*)>/i, `<head$1><base href="${basePath}">`);
}

async function handleProxy(request: NextRequest, { params }: RouteParams): Promise<Response> {
    const user = await getCurrentUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    // Targets that expect a WebSocket upgrade need a completely different
    // handshake (HTTP 101 + a persistent bidirectional pipe) that this
    // request/response proxy doesn't implement. In practice, requests that
    // genuinely carry `Upgrade: websocket` never reach this check at all —
    // Node's own HTTP server closes the socket before Next.js's router sees
    // it, since nothing here registers an `'upgrade'` server-level listener.
    // That still fails clearly (the client sees a closed connection), just
    // not with this custom message. This check is a backstop for callers
    // that send the header without actually going through the WS handshake.
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        return new Response(
            'This tunnel proxy only handles plain HTTP requests — targets that need a ' +
                'WebSocket upgrade (e.g. a dev server with hot-reload) are not supported.',
            { status: 501 },
        );
    }

    const { serverId, port, path } = await params;
    const remotePort = parseInt(port, 10);
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
        return new Response('Invalid port', { status: 400 });
    }

    const server = await getServerForConnection(serverId, user.id);
    if (!server) return new Response('Server not found', { status: 404 });
    if (server.protocol !== 'SSH') {
        return new Response('Port forwarding requires an SSH server', { status: 400 });
    }

    const url = new URL(request.url);
    const remoteHost = url.searchParams.get('host') || '127.0.0.1';

    const forwardedQuery = new URLSearchParams(url.searchParams);
    forwardedQuery.delete('host');
    const qs = forwardedQuery.toString();
    const targetPath = '/' + (path?.join('/') ?? '') + (qs ? `?${qs}` : '');

    const config: SSHPoolConfig = {
        id: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        password: server.password,
        privateKey: server.privateKey,
        passphrase: server.passphrase,
    };

    let client;
    let poolKey: string;
    try {
        const acquired = await sshPool.acquire(config);
        client = acquired.client;
        poolKey = acquired.key;
    } catch (err) {
        return new Response(
            `SSH connect error: ${err instanceof Error ? err.message : String(err)}`,
            { status: 502 },
        );
    }

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body;

    return new Promise<Response>((resolve) => {
        let settled = false;
        const finish = (response: Response) => {
            if (settled) return;
            settled = true;
            resolve(response);
        };

        client.forwardOut('127.0.0.1', 0, remoteHost, remotePort, (err, stream) => {
            if (err || !stream) {
                sshPool.release(poolKey);
                finish(
                    new Response(
                        `Failed to reach ${remoteHost}:${remotePort} — ${err?.message ?? 'unknown error'}`,
                        { status: 502 },
                    ),
                );
                return;
            }

            // The forwardOut channel closes once the HTTP interaction is fully
            // done — whether the response streamed straight through or was
            // buffered for HTML rewriting, and whether it succeeded or errored.
            // Releasing the pooled SSH connection here (exactly once) avoids
            // needing to duplicate that bookkeeping across every response path,
            // and — critically — avoids double-consuming a streamed body just
            // to know when it finished (a client-side ReadableStream can only
            // be read by one consumer).
            let released = false;
            const releasePoolOnce = () => {
                if (released) return;
                released = true;
                sshPool.release(poolKey);
            };
            stream.on('close', releasePoolOnce);
            stream.on('error', releasePoolOnce);

            const headers = filterForwardHeaders(request.headers);
            headers.host = `${remoteHost}:${remotePort}`;
            // Always request uncompressed responses — an HTML body may be
            // rewritten below (the <base> tag injection), and re-declaring a
            // stale content-encoding on modified bytes breaks client decoding.
            headers['accept-encoding'] = 'identity';

            const proxyReq = http.request(
                {
                    agent: new StreamAgent(stream),
                    method: request.method,
                    path: targetPath || '/',
                    headers,
                },
                (proxyRes) => {
                    const hostSuffix = url.searchParams.get('host')
                        ? `?host=${encodeURIComponent(remoteHost)}`
                        : '';
                    const basePath = `/tunnel/${serverId}/${port}${hostSuffix}/`;

                    const resHeaders = new Headers();
                    for (const [key, value] of Object.entries(proxyRes.headers)) {
                        const lower = key.toLowerCase();
                        if (value === undefined || HOP_BY_HOP_HEADERS.has(lower)) continue;

                        if (lower === 'set-cookie') {
                            // Multiple Set-Cookie headers must stay separate lines, not
                            // comma-joined — and are re-scoped to this tunnel's own path
                            // so the target's session cookie never leaks onto Termi's
                            // real pages or collides with a different tunnel.
                            const cookies = Array.isArray(value) ? value : [value];
                            for (const cookie of cookies) {
                                resHeaders.append('set-cookie', scopeCookiePath(cookie, basePath));
                            }
                            continue;
                        }

                        resHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
                    }

                    const status = proxyRes.statusCode ?? 502;
                    const contentType = resHeaders.get('content-type') || '';

                    if (!contentType.includes('text/html')) {
                        // Not HTML — nothing to rewrite, so stream straight through
                        // without ever holding the full body in memory.
                        finish(
                            new Response(Readable.toWeb(proxyRes) as ReadableStream, {
                                status,
                                headers: resHeaders,
                            }),
                        );
                        return;
                    }

                    // HTML: buffer up to the cap so the <base> tag can be injected.
                    const chunks: Buffer[] = [];
                    let total = 0;
                    let overCap = false;
                    proxyRes.on('data', (chunk: Buffer) => {
                        total += chunk.length;
                        if (total > MAX_HTML_REWRITE_BYTES) {
                            overCap = true;
                            return; // still drains via 'data'; just stop retaining
                        }
                        chunks.push(chunk);
                    });
                    proxyRes.on('end', () => {
                        if (overCap) {
                            // Too large to safely buffer — return what little we can
                            // say about it rather than silently truncating HTML.
                            finish(
                                new Response(
                                    'Response too large to rewrite through this proxy ' +
                                        `(over ${MAX_HTML_REWRITE_BYTES / (1024 * 1024)} MB).`,
                                    { status: 502 },
                                ),
                            );
                            return;
                        }

                        const html = injectBaseTag(
                            Buffer.concat(chunks).toString('utf8'),
                            basePath,
                        );
                        resHeaders.delete('content-length');
                        finish(
                            new Response(Buffer.from(html, 'utf8'), {
                                status,
                                headers: resHeaders,
                            }),
                        );
                    });
                },
            );

            proxyReq.on('error', (e) => {
                // Belt-and-braces: the underlying stream's own close/error normally
                // fires releasePoolOnce, but a request-level failure that doesn't
                // cleanly tear down the stream shouldn't leak the pooled connection.
                releasePoolOnce();
                finish(new Response(`Proxy error: ${e.message}`, { status: 502 }));
            });

            if (hasBody && request.body) {
                Readable.fromWeb(request.body as import('node:stream/web').ReadableStream).pipe(
                    proxyReq,
                );
            } else {
                proxyReq.end();
            }
        });
    });
}

export async function GET(request: NextRequest, ctx: RouteParams) {
    return handleProxy(request, ctx);
}
export async function POST(request: NextRequest, ctx: RouteParams) {
    return handleProxy(request, ctx);
}
export async function PUT(request: NextRequest, ctx: RouteParams) {
    return handleProxy(request, ctx);
}
export async function DELETE(request: NextRequest, ctx: RouteParams) {
    return handleProxy(request, ctx);
}
export async function PATCH(request: NextRequest, ctx: RouteParams) {
    return handleProxy(request, ctx);
}
export async function HEAD(request: NextRequest, ctx: RouteParams) {
    return handleProxy(request, ctx);
}
