'use strict';
/**
 * Client side of Termi's multiplexed port forwarding (the gateway side is
 * apps/gateway/src/handlers/tunnel-mux.ts — see it for the wire format).
 *
 * Used by the desktop app's main process, and embedded verbatim in the
 * downloadable bridge script: everything between the RUNTIME markers is
 * copied into apps/web/src/lib/tunnel/runtime-source.ts by
 * `npm run sync:tunnel-runtime`, and a test fails if the two drift.
 * Between the markers, use only `net`, `Buffer` and the global WebSocket.
 */
const net = require('net');

// ── RUNTIME START ──
/**
 * Open a tunnel. `opts`:
 *   wsUrl, token          gateway URL (with mux=1) and connection token
 *   mode                  'local' | 'dynamic' | 'remote'
 *   listenHost/listenPort local listener for 'local' and 'dynamic' (0 = any)
 *   target {host, port}   local service for 'remote'
 *   log(msg)              optional progress output
 *   onReady({localPort?, bindPort?})   listening / the server is listening
 *   onClose(reason)       the tunnel ended (not called after close())
 * Returns { close() }.
 */
function runTunnel(opts) {
    const HIGH_WATER = 4 * 1024 * 1024;
    const LOW_WATER = 512 * 1024;
    const log = opts.log || function () {};
    const streams = new Map();
    let nextId = 1;
    let server = null;
    let finished = false;
    let drainTimer = null;

    const ws = new WebSocket(opts.wsUrl);
    ws.binaryType = 'arraybuffer';
    const send = (msg) => {
        if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    };
    const ping = setInterval(() => send({ type: 'ping' }), 25000);

    function flow(s) {
        if (!s.open || s.peerPaused || s.wsPaused) s.socket.pause();
        else s.socket.resume();
    }

    function watchDrain() {
        if (drainTimer) return;
        drainTimer = setInterval(() => {
            if (ws.bufferedAmount > LOW_WATER) return;
            clearInterval(drainTimer);
            drainTimer = null;
            for (const s of streams.values()) {
                if (s.wsPaused) {
                    s.wsPaused = false;
                    flow(s);
                }
            }
        }, 25);
    }

    function attach(id, socket) {
        const s = { socket, open: false, peerPaused: false, wsPaused: false, writeBlocked: false };
        streams.set(id, s);
        flow(s);
        socket.on('data', (chunk) => {
            if (ws.readyState !== 1) return;
            const header = Buffer.allocUnsafe(4);
            header.writeUInt32BE(id, 0);
            ws.send(Buffer.concat([header, chunk]));
            if (ws.bufferedAmount > HIGH_WATER) {
                s.wsPaused = true;
                flow(s);
                watchDrain();
            }
        });
        // Half-open sockets: one side finishing (EOF) doesn't end the other.
        socket.on('end', () => {
            if (streams.get(id) === s) send({ type: 'eof', id });
        });
        socket.on('error', () => {});
        socket.on('close', () => {
            if (streams.get(id) !== s) return;
            streams.delete(id);
            send({ type: 'close', id });
        });
        return s;
    }

    // ── SOCKS5 (dynamic mode) ──
    const SOCKS_OK = Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    const socksReply = (code) => Buffer.from([5, code, 0, 1, 0, 0, 0, 0, 0, 0]);

    function socks(socket) {
        let buf = Buffer.alloc(0);
        let greeted = false;
        const onData = (chunk) => {
            buf = Buffer.concat([buf, chunk]);
            if (buf.length > 1024) return socket.destroy();
            if (!greeted) {
                if (buf.length < 2) return;
                if (buf[0] !== 5) return socket.destroy();
                if (buf.length < 2 + buf[1]) return;
                const methods = buf.subarray(2, 2 + buf[1]);
                buf = buf.subarray(2 + buf[1]);
                if (!methods.includes(0)) return socket.end(Buffer.from([5, 0xff]));
                socket.write(Buffer.from([5, 0]));
                greeted = true;
            }
            if (buf.length < 4) return;
            if (buf[0] !== 5) return socket.destroy();
            if (buf[1] !== 1) return socket.end(socksReply(7)); // CONNECT only
            let host;
            let offset;
            if (buf[3] === 1) {
                if (buf.length < 10) return;
                host = Array.from(buf.subarray(4, 8)).join('.');
                offset = 8;
            } else if (buf[3] === 3) {
                if (buf.length < 5 || buf.length < 5 + buf[4] + 2) return;
                host = buf.subarray(5, 5 + buf[4]).toString('latin1');
                offset = 5 + buf[4];
            } else if (buf[3] === 4) {
                if (buf.length < 22) return;
                const groups = [];
                for (let i = 0; i < 8; i++) groups.push(buf.readUInt16BE(4 + i * 2).toString(16));
                host = groups.join(':');
                offset = 20;
            } else {
                return socket.end(socksReply(8)); // address type not supported
            }
            const port = buf.readUInt16BE(offset);
            const early = buf.subarray(offset + 2);
            socket.removeListener('data', onData);
            socket.pause();

            const id = nextId++;
            const s = attach(id, socket);
            s.onOpened = () => {
                socket.write(SOCKS_OK);
                if (early.length) socket.unshift(early);
            };
            s.onFailed = (message) => {
                const code = /refused/i.test(message) ? 5 : /unreachable|not found|ENOTFOUND/i.test(message) ? 4 : 1;
                socket.end(socksReply(code));
            };
            send({ type: 'open', id, host, port });
        };
        socket.on('data', onData);
        socket.on('error', () => {});
    }

    // ── Remote mode: the server accepted a connection ──
    function incoming(id, from) {
        const socket = net.connect({
            port: opts.target.port,
            host: opts.target.host,
            allowHalfOpen: true,
        });
        const s = attach(id, socket);
        socket.once('connect', () => {
            s.open = true;
            flow(s);
            send({ type: 'accept', id });
        });
        socket.once('error', (err) => {
            if (s.open) return;
            streams.delete(id);
            send({ type: 'close', id });
            log('Could not reach ' + opts.target.host + ':' + opts.target.port + ' for ' + from + ': ' + err.message);
        });
    }

    function onTunnelReady(msg) {
        if (opts.mode === 'remote') {
            if (opts.onReady) opts.onReady({ bindPort: msg.bindPort });
            return;
        }
        server = net.createServer({ allowHalfOpen: true }, (socket) => {
            if (opts.mode === 'dynamic') return socks(socket);
            socket.pause();
            const id = nextId++;
            attach(id, socket);
            send({ type: 'open', id });
        });
        server.on('error', (err) => finish(err.message));
        server.listen(opts.listenPort || 0, opts.listenHost || '127.0.0.1', () => {
            if (opts.onReady) opts.onReady({ localPort: server.address().port });
        });
    }

    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'auth', token: opts.token })));
    ws.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') {
            const data = Buffer.from(ev.data);
            if (data.length < 4) return;
            const id = data.readUInt32BE(0);
            const s = streams.get(id);
            if (!s) return;
            if (!s.socket.write(data.subarray(4)) && !s.writeBlocked) {
                s.writeBlocked = true;
                send({ type: 'pause', id });
                s.socket.once('drain', () => {
                    s.writeBlocked = false;
                    if (streams.get(id) === s) send({ type: 'resume', id });
                });
            }
            return;
        }
        let msg;
        try {
            msg = JSON.parse(ev.data);
        } catch (_) {
            return;
        }
        const s = typeof msg.id === 'number' ? streams.get(msg.id) : undefined;
        switch (msg.type) {
            case 'tunnel-ready':
                onTunnelReady(msg);
                break;
            case 'opened':
                if (!s) break;
                s.open = true;
                if (s.onOpened) s.onOpened();
                flow(s);
                break;
            case 'open-failed':
                if (!s) break;
                streams.delete(msg.id);
                log(msg.message);
                if (s.onFailed) s.onFailed(msg.message);
                else s.socket.destroy();
                break;
            case 'eof':
                if (s) s.socket.end();
                break;
            case 'closed':
                if (!s) break;
                streams.delete(msg.id);
                s.socket.end();
                s.socket.once('finish', () => s.socket.destroy());
                break;
            case 'pause':
            case 'resume':
                if (!s) break;
                s.peerPaused = msg.type === 'pause';
                flow(s);
                break;
            case 'incoming':
                if (opts.mode === 'remote' && typeof msg.id === 'number') incoming(msg.id, msg.from);
                break;
            case 'error':
                finish(msg.message);
                break;
            case 'disconnected':
                finish('The SSH connection closed');
                break;
        }
    });
    ws.addEventListener('close', () => finish('The connection to Termi closed'));
    ws.addEventListener('error', () => finish('Could not connect to Termi'));

    function finish(reason, quiet) {
        if (finished) return;
        finished = true;
        clearInterval(ping);
        if (drainTimer) clearInterval(drainTimer);
        if (server) server.close();
        for (const s of streams.values()) s.socket.destroy();
        streams.clear();
        try {
            ws.close();
        } catch (_) {}
        if (!quiet && opts.onClose) opts.onClose(reason);
    }

    return { close: () => finish('closed', true) };
}
// ── RUNTIME END ──

module.exports = { runTunnel };
