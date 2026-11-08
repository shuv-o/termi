/**
 * The downloadable bridge script: a dependency-free Node.js (22+) program
 * that runs the same tunnel runtime as the desktop app (see
 * apps/electron/tunnel-mux.js) for whoever uses Termi from a browser.
 *
 * Server names and hosts come from users — including whoever shared the
 * server — and the script runs on the user's own machine, so they only ever
 * enter it as JSON string literals (comments get a printable, one-line copy).
 */

import { TUNNEL_RUNTIME_SOURCE } from './runtime-source';

export type ForwardMode = 'local' | 'dynamic' | 'remote';

export interface BridgeOptions {
    gatewayUrl: string;
    serverId: string;
    serverName: string;
    token: string;
    mode: ForwardMode;
    /** local: the target as seen from the server. */
    remoteHost?: string;
    remotePort?: number;
    /** local / dynamic: the port to listen on here (0 = any free port). */
    localPort?: number;
    /** remote: where the server listens, and the service here it reaches. */
    bindAddress?: string;
    bindPort?: number;
    localTarget?: { host: string; port: number };
}

const commentSafe = (v: string) => v.replace(/[^\x20-\x7e]/g, '?').slice(0, 120);

/** Ports below 1024 need root on Unix: fall back to any free port. */
export function safeLocalPort(port: number | undefined): number {
    return Number.isInteger(port) && port! >= 1024 && port! <= 65535 ? port! : 0;
}

export function tunnelWsUrl(gatewayUrl: string, serverId: string): string {
    return `${gatewayUrl}/connect?protocol=tunnel&serverId=${encodeURIComponent(serverId)}&mux=1`;
}

export function buildBridgeScript(o: BridgeOptions): string {
    const config = {
        wsUrl: tunnelWsUrl(o.gatewayUrl, o.serverId),
        token: o.token,
        mode: o.mode,
        listenHost: '127.0.0.1',
        listenPort: safeLocalPort(o.localPort),
        target: o.mode === 'remote' ? o.localTarget : undefined,
    };
    const what =
        o.mode === 'local'
            ? `forwards a local port to ${o.remoteHost}:${o.remotePort}`
            : o.mode === 'dynamic'
              ? 'runs a SOCKS5 proxy'
              : `makes ${o.bindAddress}:${o.bindPort} on the server reach ${o.localTarget?.host}:${o.localTarget?.port} here`;

    return `#!/usr/bin/env node
// Termi tunnel bridge — ${commentSafe(what)}
// through "${commentSafe(o.serverName)}". Requires Node 22+ (built-in WebSocket).
// Start it within 5 minutes (the sign-in token expires); once connected it
// keeps running until you stop it with Ctrl+C.
//
// Run: node termi-tunnel.mjs

import net from 'node:net';

${TUNNEL_RUNTIME_SOURCE}
const CONFIG = ${JSON.stringify(config, null, 4)};
const SERVER_NAME = ${JSON.stringify(o.serverName)};
const TARGET = ${JSON.stringify(o.mode === 'local' ? `${o.remoteHost}:${o.remotePort}` : '')};
const say = (msg) => console.log('[termi-tunnel] ' + msg);

const tunnel = runTunnel({
    ...CONFIG,
    log: say,
    onReady(info) {
        if (CONFIG.mode === 'local') {
            say('Listening on 127.0.0.1:' + info.localPort + ' -> ' + TARGET + ' via ' + SERVER_NAME);
            say('Point your tool at 127.0.0.1:' + info.localPort);
        } else if (CONFIG.mode === 'dynamic') {
            say('SOCKS5 proxy on 127.0.0.1:' + info.localPort + ' via ' + SERVER_NAME);
            say('Try: curl --socks5-hostname 127.0.0.1:' + info.localPort + ' https://example.com');
        } else {
            say('Port ' + info.bindPort + ' on ' + SERVER_NAME + ' now reaches ' + CONFIG.target.host + ':' + CONFIG.target.port + ' on this computer');
        }
    },
    onClose(reason) {
        console.error('[termi-tunnel] ' + reason);
        process.exit(1);
    },
});
process.on('SIGINT', () => {
    tunnel.close();
    process.exit(0);
});
`;
}
