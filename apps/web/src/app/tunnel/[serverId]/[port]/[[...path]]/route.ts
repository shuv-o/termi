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
 * Known limitation: this is path-prefixed, not a dedicated subdomain, so a
 * target app that emits absolute-path links/assets (most SPAs with a
 * hardcoded root) will have broken links. A best-effort <base> tag is
 * injected into HTML responses to fix *relative* links; it can't fix
 * absolute ones — that would require a real per-tunnel subdomain.
 */

import http from 'node:http';
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
// party as far as this credential is concerned — would leak a live Termi
// session to whatever's on the other end of the tunnel. Never forward these.
const CREDENTIAL_HEADERS = new Set(['cookie', 'authorization']);

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

async function handleProxy(request: NextRequest, { params }: RouteParams): Promise<Response> {
    const user = await getCurrentUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

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

    const body =
        request.method !== 'GET' && request.method !== 'HEAD'
            ? Buffer.from(await request.arrayBuffer())
            : undefined;

    return new Promise<Response>((resolve) => {
        let settled = false;
        const finish = (response: Response) => {
            if (settled) return;
            settled = true;
            sshPool.release(poolKey);
            resolve(response);
        };

        client.forwardOut('127.0.0.1', 0, remoteHost, remotePort, (err, stream) => {
            if (err || !stream) {
                finish(
                    new Response(
                        `Failed to reach ${remoteHost}:${remotePort} — ${err?.message ?? 'unknown error'}`,
                        { status: 502 },
                    ),
                );
                return;
            }

            const headers: Record<string, string> = {};
            request.headers.forEach((value, key) => {
                const lower = key.toLowerCase();
                if (!HOP_BY_HOP_HEADERS.has(lower) && !CREDENTIAL_HEADERS.has(lower)) {
                    headers[key] = value;
                }
            });
            headers.host = `${remoteHost}:${remotePort}`;
            // Always request uncompressed responses — the body may be rewritten
            // below (the <base> tag injection), and re-declaring a stale
            // content-encoding on modified bytes breaks decoding client-side.
            headers['accept-encoding'] = 'identity';

            const proxyReq = http.request(
                {
                    agent: new StreamAgent(stream),
                    method: request.method,
                    path: targetPath || '/',
                    headers,
                },
                (proxyRes) => {
                    const chunks: Buffer[] = [];
                    proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
                    proxyRes.on('end', () => {
                        const resHeaders = new Headers();
                        for (const [key, value] of Object.entries(proxyRes.headers)) {
                            if (value === undefined || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
                                continue;
                            }
                            resHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
                        }

                        let responseBody = Buffer.concat(chunks);
                        const contentType = resHeaders.get('content-type') || '';
                        if (contentType.includes('text/html')) {
                            const hostSuffix = url.searchParams.get('host')
                                ? `?host=${encodeURIComponent(remoteHost)}`
                                : '';
                            const basePath = `/tunnel/${serverId}/${port}${hostSuffix}/`;
                            let html = responseBody.toString('utf8');
                            if (/<head[^>]*>/i.test(html) && !/<base[\s>]/i.test(html)) {
                                html = html.replace(
                                    /<head([^>]*)>/i,
                                    `<head$1><base href="${basePath}">`,
                                );
                            }
                            responseBody = Buffer.from(html, 'utf8');
                            resHeaders.delete('content-length');
                        }

                        finish(
                            new Response(responseBody, {
                                status: proxyRes.statusCode ?? 502,
                                headers: resHeaders,
                            }),
                        );
                    });
                },
            );

            proxyReq.on('error', (e) => {
                finish(new Response(`Proxy error: ${e.message}`, { status: 502 }));
            });

            if (body) proxyReq.write(body);
            proxyReq.end();
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
