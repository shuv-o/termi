/**
 * Multiplexed port forwarding: one WebSocket, one SSH connection, many TCP
 * streams. Carries all three forwarding modes:
 *
 *   local    (`ssh -L`) the client opens streams; each goes to the token's
 *            fixed remoteHost:remotePort via `forwardOut`.
 *   dynamic  (`ssh -D`) the client runs a SOCKS proxy and opens streams to
 *            whatever host:port each SOCKS request names — dialed by the
 *            target's own SSH server, exactly what `ssh -D` grants.
 *   remote   (`ssh -R`) the server listens (`forwardIn`) and each connection
 *            it accepts becomes a stream the client connects to a local port.
 *
 * Wire format
 *   binary  [u32 BE stream id][payload]
 *   text    JSON control:
 *     client → gateway  open {id, host?, port?} · accept {id} · eof {id}
 *                       close {id} · pause {id} · resume {id} · ping
 *     gateway → client  tunnel-ready {mode, bindPort?} · opened {id}
 *                       open-failed {id, message} · incoming {id, from}
 *                       eof {id} · closed {id} · pause {id} · resume {id}
 *                       pong · error
 *
 * `eof` is a TCP half-close (one side finished sending); `close`/`closed`
 * mean the stream is gone. Many protocols (HTTP/1.0, nc, rsync) rely on the
 * half-close, and sshd only closes a channel once both sides sent EOF.
 *
 * Stream ids opened by the client are below 2^31; ids for incoming remote
 * connections are assigned here from 2^31 up, so the two never collide.
 *
 * Flow control is per stream: whoever can't keep up (a full SSH channel here,
 * a slow local socket on the client) sends `pause`, then `resume` on drain;
 * a WebSocket that is buffering too much pauses the SSH channels feeding it.
 *
 * Unlike the single-channel TunnelHandler, the token is only needed to open
 * the WebSocket, so a tunnel keeps accepting new connections for as long as
 * it stays up.
 */

import { Client, type ClientChannel } from 'ssh2';
import { WebSocket } from 'ws';
import type { TokenPayload } from '../auth/token.js';
import { HOST_KEY_MISMATCH } from '../auth/host-key.js';
import { connectSSH } from './jump.js';
import { tunnelConnectConfig } from './tunnel.js';

export const MAX_STREAMS = 256;
const CLIENT_ID_LIMIT = 0x8000_0000;
const WS_HIGH_WATER = 8 * 1024 * 1024;
const WS_LOW_WATER = 1024 * 1024;
const MAX_HOST_LENGTH = 255;

export type ForwardMode = 'local' | 'dynamic' | 'remote';

interface Stream {
    channel: ClientChannel;
    /** The other side asked us to stop sending. */
    peerPaused: boolean;
    /** Our WebSocket is too full to take more from this channel. */
    wsPaused: boolean;
    closedByPeer: boolean;
    /** We asked the peer to pause because this channel is full. */
    writeBlocked: boolean;
}

/** Host names a SOCKS client may ask for: a DNS name, IPv4 or IPv6 literal. */
const VALID_HOST = /^[A-Za-z0-9._:-]+$/;

export class TunnelMuxHandler {
    private ssh = new Client();
    private streams = new Map<number, Stream>();
    private nextIncomingId = CLIENT_ID_LIMIT;
    private ready = false;
    private closing = false;
    private drainTimer: ReturnType<typeof setInterval> | null = null;
    readonly mode: ForwardMode;

    constructor(
        private token: TokenPayload,
        private ws: WebSocket,
    ) {
        this.mode = token.forward?.kind ?? 'local';
        this.setupSSH();
    }

    // ── WebSocket → SSH ─────────────────────────────────────────────────────

    handleMessage(data: Buffer, isBinary: boolean): void {
        if (isBinary) {
            if (data.length < 4) return;
            const id = data.readUInt32BE(0);
            const s = this.streams.get(id);
            if (!s) return; // already closed: drop, as TCP would
            if (!s.channel.write(data.subarray(4)) && !s.writeBlocked) {
                s.writeBlocked = true;
                this.send({ type: 'pause', id });
                s.channel.once('drain', () => {
                    s.writeBlocked = false;
                    if (this.streams.get(id) === s) this.send({ type: 'resume', id });
                });
            }
            return;
        }

        let msg: { type?: unknown; id?: unknown; host?: unknown; port?: unknown };
        try {
            msg = JSON.parse(data.toString());
        } catch {
            return;
        }
        const id = msg.id;
        switch (msg.type) {
            case 'ping':
                this.send({ type: 'pong' });
                return;
            case 'open':
                if (typeof id === 'number') this.open(id, msg.host, msg.port);
                return;
            case 'accept': {
                // Only incoming (remote) streams wait for an accept.
                if (typeof id !== 'number' || id < CLIENT_ID_LIMIT) return;
                const s = this.streams.get(id);
                if (s) this.updateFlow(s);
                return;
            }
            case 'eof': {
                const s = typeof id === 'number' ? this.streams.get(id) : undefined;
                if (s) s.channel.end();
                return;
            }
            case 'close': {
                const s = typeof id === 'number' ? this.streams.get(id) : undefined;
                if (s) {
                    s.closedByPeer = true;
                    s.channel.close();
                }
                return;
            }
            case 'pause':
            case 'resume': {
                const s = typeof id === 'number' ? this.streams.get(id) : undefined;
                if (!s) return;
                s.peerPaused = msg.type === 'pause';
                this.updateFlow(s);
                return;
            }
        }
    }

    private open(id: number, host: unknown, port: unknown): void {
        const fail = (message: string) => this.send({ type: 'open-failed', id, message });
        if (!this.ready) return fail('Tunnel is not ready yet');
        if (!Number.isInteger(id) || id < 1 || id >= CLIENT_ID_LIMIT || this.streams.has(id)) {
            return fail('Invalid stream id');
        }
        if (this.mode === 'remote') return fail('This tunnel only accepts incoming connections');
        if (this.streams.size >= MAX_STREAMS) return fail('Too many connections on this tunnel');

        let targetHost: string;
        let targetPort: number;
        if (this.mode === 'dynamic') {
            if (
                typeof host !== 'string' ||
                host.length === 0 ||
                host.length > MAX_HOST_LENGTH ||
                !VALID_HOST.test(host) ||
                typeof port !== 'number' ||
                !Number.isInteger(port) ||
                port < 1 ||
                port > 65535
            ) {
                return fail('Invalid destination');
            }
            targetHost = host;
            targetPort = port;
        } else {
            if (!this.token.remoteHost || !this.token.remotePort)
                return fail('Tunnel target missing');
            targetHost = this.token.remoteHost;
            targetPort = this.token.remotePort;
        }

        this.ssh.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, channel) => {
            if (this.closing) {
                channel?.end();
                return;
            }
            if (err || !channel) {
                return fail(
                    `Could not reach ${targetHost}:${targetPort}: ${err?.message ?? 'unknown error'}`,
                );
            }
            this.attach(id, channel);
            this.send({ type: 'opened', id });
        });
    }

    // ── SSH → WebSocket ─────────────────────────────────────────────────────

    private attach(id: number, channel: ClientChannel): Stream {
        const s: Stream = {
            channel,
            peerPaused: false,
            wsPaused: false,
            closedByPeer: false,
            writeBlocked: false,
        };
        this.streams.set(id, s);
        channel.on('data', (chunk: Buffer) => {
            if (this.ws.readyState !== WebSocket.OPEN) return;
            const header = Buffer.allocUnsafe(4);
            header.writeUInt32BE(id, 0);
            this.ws.send(Buffer.concat([header, chunk]), { binary: true });
            if (this.ws.bufferedAmount > WS_HIGH_WATER) {
                s.wsPaused = true;
                this.updateFlow(s);
                this.watchDrain();
            }
        });
        channel.on('end', () => {
            if (this.streams.get(id) === s) this.send({ type: 'eof', id });
        });
        channel.on('error', () => {
            /* 'close' follows */
        });
        channel.on('close', () => {
            if (this.streams.get(id) !== s) return;
            this.streams.delete(id);
            if (!s.closedByPeer) this.send({ type: 'closed', id });
        });
        return s;
    }

    private updateFlow(s: Stream): void {
        if (s.peerPaused || s.wsPaused) s.channel.pause();
        else s.channel.resume();
    }

    /** Resume WebSocket-paused channels once the socket has drained. */
    private watchDrain(): void {
        if (this.drainTimer) return;
        this.drainTimer = setInterval(() => {
            if (this.ws.bufferedAmount > WS_LOW_WATER) return;
            clearInterval(this.drainTimer!);
            this.drainTimer = null;
            for (const s of this.streams.values()) {
                if (!s.wsPaused) continue;
                s.wsPaused = false;
                this.updateFlow(s);
            }
        }, 25);
    }

    // ── SSH connection ──────────────────────────────────────────────────────

    private setupSSH(): void {
        this.ssh.on('ready', () => {
            if (this.mode !== 'remote') {
                this.ready = true;
                this.send({ type: 'tunnel-ready', mode: this.mode });
                return;
            }
            const fwd = this.token.forward;
            const bindAddress = fwd?.kind === 'remote' ? fwd.bindAddress : '127.0.0.1';
            const bindPort = fwd?.kind === 'remote' ? fwd.bindPort : 0;
            this.ssh.on('tcp connection', (_info, accept, reject) => {
                if (this.closing || this.streams.size >= MAX_STREAMS) {
                    reject();
                    return;
                }
                const id = this.nextIncomingId++;
                if (this.nextIncomingId >= 0xffff_ffff) this.nextIncomingId = CLIENT_ID_LIMIT;
                const channel = accept();
                channel.pause(); // until the client has connected its side
                this.attach(id, channel);
                this.send({ type: 'incoming', id, from: `${_info.srcIP}:${_info.srcPort}` });
            });
            this.ssh.forwardIn(bindAddress, bindPort, (err, port) => {
                if (err) {
                    this.send({
                        type: 'error',
                        message: `The server refused to listen on ${bindAddress}:${bindPort || 'any port'}: ${err.message}`,
                    });
                    this.close();
                    return;
                }
                this.ready = true;
                this.send({ type: 'tunnel-ready', mode: 'remote', bindPort: port || bindPort });
            });
        });

        this.ssh.on('error', (err) => {
            this.send({
                type: 'error',
                message: 'SSH error: ' + err.message,
                ...((err as { code?: unknown }).code === HOST_KEY_MISMATCH && {
                    code: HOST_KEY_MISMATCH,
                }),
            });
            this.close();
        });
        this.ssh.on('close', () => {
            this.send({ type: 'disconnected' });
            this.close();
        });

        try {
            connectSSH(
                this.ssh,
                tunnelConnectConfig(this.token),
                this.token.jump,
                this.token.hostKey,
                this.token.certificate,
            );
        } catch (err) {
            this.send({ type: 'error', message: 'Connection failed: ' + (err as Error).message });
            this.close();
        }
    }

    private send(msg: Record<string, unknown>): void {
        if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    }

    close(): void {
        if (this.closing) return;
        this.closing = true;
        if (this.drainTimer) clearInterval(this.drainTimer);
        for (const s of this.streams.values()) s.channel.end();
        this.streams.clear();
        try {
            this.ssh.end();
        } catch {
            /* already closed */
        }
        if (this.ws.readyState === WebSocket.OPEN) this.ws.close(1000, 'Tunnel closed');
    }
}
