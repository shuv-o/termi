// Device mode: SSH, file transfer and port forwarding to the user's own
// servers straight from this computer, through a copy of the Termi gateway
// that runs inside the app.
//
// - The gateway runs in a utility process, listens on 127.0.0.1 on a random
//   port, and refuses any connection without the secret made at launch.
// - The page never learns that port or secret: it asks the main process over
//   IPC, which opens the WebSocket itself and relays frames to that page only.
// - The device keys (one to receive sealed connection tokens, one to sign
//   requests) are made here, kept encrypted with the OS keychain
//   (safeStorage), and handed to the gateway over its message port. Only the
//   public halves ever leave the process.

const { app, safeStorage, utilityProcess } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KEY_FILE = 'device-keys.bin';
const GATEWAY_ENTRY = path.join(__dirname, 'gateway', 'index.mjs');
/** Open relays a single page may hold (terminals, file panes, tunnels). */
const MAX_SOCKETS_PER_PAGE = 64;

let keysCache = null;

function newKeyPair() {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    return privateKey.export({ format: 'jwk' });
}

const publicHalf = ({ kty, crv, x, y }) => ({ kty, crv, x, y });

/**
 * This computer's device keys, created on first use. Null when the OS can't
 * encrypt them at rest (e.g. Linux without a keyring): device mode stays off
 * rather than writing private keys in the clear.
 */
function deviceKeys() {
    if (keysCache) return keysCache;
    if (!safeStorage.isEncryptionAvailable()) return null;
    if (
        process.platform === 'linux' &&
        safeStorage.getSelectedStorageBackend?.() === 'basic_text'
    ) {
        return null;
    }
    const file = path.join(app.getPath('userData'), KEY_FILE);
    try {
        const stored = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
        if (stored?.enc?.d && stored?.sig?.d) keysCache = stored;
    } catch (_) {
        /* missing or unreadable: make new keys */
    }
    if (!keysCache) {
        keysCache = { enc: newKeyPair(), sig: newKeyPair() };
        fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(keysCache)), {
            mode: 0o600,
        });
    }
    return keysCache;
}

let gateway = null; // { proc, secret, port: Promise<number> }

function startGateway(remoteUrl) {
    if (gateway) return gateway.port;
    const keys = deviceKeys();
    if (!keys) return Promise.reject(new Error('This computer cannot store device keys securely'));
    if (!fs.existsSync(GATEWAY_ENTRY)) {
        return Promise.reject(new Error('This build has no local gateway'));
    }
    const secret = crypto.randomBytes(32).toString('base64url');
    const proc = utilityProcess.fork(GATEWAY_ENTRY, [], {
        serviceName: 'Termi gateway',
        stdio: 'inherit',
        // Only what the gateway needs; nothing else from this process's environment.
        env: {
            LOCAL_GATEWAY: '1',
            NODE_ENV: 'production',
            GATEWAY_PORT: '0',
            // Reaching servers on the user's own network is the point of device mode.
            ALLOW_PRIVATE_NETWORKS: 'true',
            WEB_INTERNAL_URL: remoteUrl,
            ALLOWED_ORIGINS: new URL(remoteUrl).origin,
            HOME: os.homedir(),
            PATH: process.env.PATH || '',
        },
    });
    const port = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The local gateway did not start')), 15000);
        proc.on('message', (m) => {
            if (m?.type === 'ready' && Number.isInteger(m.port)) {
                clearTimeout(timer);
                resolve(m.port);
            }
        });
        proc.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`The local gateway stopped (${code})`));
        });
    });
    proc.once('spawn', () =>
        proc.postMessage({ type: 'config', secret, enc: keys.enc, sig: keys.sig }),
    );
    proc.once('exit', () => {
        if (gateway?.proc === proc) gateway = null;
    });
    gateway = { proc, secret, port };
    port.catch(() => {
        if (gateway?.proc === proc) {
            gateway = null;
            proc.kill();
        }
    });
    return port;
}

/** ws:// URL of the local gateway for a renderer-supplied query, with our own secret. */
async function localUrl(remoteUrl, query) {
    const port = await startGateway(remoteUrl);
    if (typeof query !== 'string' || query.length > 2048) throw new Error('Bad connection query');
    const params = new URLSearchParams(query);
    params.delete('lk');
    params.delete('token'); // tokens go in the first message, never the URL
    params.set('lk', gateway.secret);
    return `ws://127.0.0.1:${port}/connect?${params}`;
}

const sockets = new Map(); // id -> { ws, sender }
const watchedPages = new WeakSet();

function closeSocketsOf(sender) {
    for (const [id, s] of sockets) {
        if (s.sender === sender) {
            sockets.delete(id);
            try {
                s.ws.close();
            } catch (_) {}
        }
    }
}

function emit(sender, event) {
    if (!sender.isDestroyed()) sender.send('localgw:event', event);
}

/**
 * Register the IPC handlers. `guard(event)` throws for anything but the
 * app's own top frame; `isTrusted(event)` is the non-throwing form.
 */
function registerLocalGateway(ipcMain, { remoteUrl, guard, isTrusted }) {
    ipcMain.handle('localgw:device', (event) => {
        guard(event);
        const keys = deviceKeys();
        if (!keys) return { error: 'This computer cannot store device keys securely' };
        return {
            name: os.hostname().slice(0, 100) || 'This computer',
            encKey: publicHalf(keys.enc),
            sigKey: publicHalf(keys.sig),
        };
    });

    ipcMain.handle('localgw:open', async (event, id, query) => {
        guard(event);
        if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || sockets.has(id)) {
            return { error: 'Bad connection id' };
        }
        const sender = event.sender;
        let count = 0;
        for (const s of sockets.values()) if (s.sender === sender) count++;
        if (count >= MAX_SOCKETS_PER_PAGE) return { error: 'Too many connections' };

        let url;
        try {
            url = await localUrl(remoteUrl, query);
        } catch (err) {
            return { error: err.message };
        }
        if (!watchedPages.has(sender)) {
            watchedPages.add(sender);
            sender.once('destroyed', () => closeSocketsOf(sender));
            // A reload or full navigation leaves no page to own these.
            sender.on('did-navigate', () => closeSocketsOf(sender));
        }

        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
        sockets.set(id, { ws, sender });
        ws.addEventListener('open', () => emit(sender, { id, type: 'open' }));
        ws.addEventListener('message', (ev) =>
            emit(sender, {
                id,
                type: 'message',
                data: typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data),
            }),
        );
        ws.addEventListener('error', () => emit(sender, { id, type: 'error' }));
        ws.addEventListener('close', (ev) => {
            sockets.delete(id);
            emit(sender, { id, type: 'close', code: ev.code, reason: ev.reason });
        });
        return { ok: true };
    });

    ipcMain.on('localgw:send', (event, id, data) => {
        if (!isTrusted(event)) return;
        const s = sockets.get(id);
        if (!s || s.sender !== event.sender || s.ws.readyState !== 1) return;
        if (typeof data === 'string') s.ws.send(data);
        else if (data instanceof Uint8Array || data instanceof ArrayBuffer) s.ws.send(data);
    });

    ipcMain.on('localgw:close', (event, id, code, reason) => {
        if (!isTrusted(event)) return;
        const s = sockets.get(id);
        if (!s || s.sender !== event.sender) return;
        sockets.delete(id);
        const valid = code === 1000 || (code >= 3000 && code <= 4999);
        try {
            s.ws.close(valid ? code : 1000, typeof reason === 'string' ? reason.slice(0, 120) : '');
        } catch (_) {}
        emit(s.sender, { id, type: 'close', code: valid ? code : 1000, reason: '' });
    });
}

/** The local gateway's WebSocket base URL with the launch secret, for tunnels. */
async function localTunnelBase(remoteUrl) {
    const port = await startGateway(remoteUrl);
    return { base: `ws://127.0.0.1:${port}`, secret: gateway.secret };
}

function stopLocalGateway() {
    for (const s of sockets.values()) {
        try {
            s.ws.close();
        } catch (_) {}
    }
    sockets.clear();
    gateway?.proc.kill();
    gateway = null;
}

module.exports = { registerLocalGateway, localTunnelBase, stopLocalGateway };
