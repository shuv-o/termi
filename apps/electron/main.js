const { app, BrowserWindow, shell, ipcMain, session, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { initAutoUpdater, checkForUpdatesInteractive } = require('./updater');
const { getWindowState, trackWindowState } = require('./window-state');
const { attachContextMenu } = require('./context-menu');

const IS_DEV = !app.isPackaged || process.env.ELECTRON_DEV === '1';

let win;

//   Remote server URL (baked at build time)                ─

// The hosted Termi deployment serves the web UI and proxies SSH/SCP/RDP/VNC
// through its own gateway + guacd. This desktop app is just a native shell
// around that remote app, plus a local terminal. Resolution order:
//   1. TERMI_REMOTE_URL env var (used by the dev scripts)
//   2. build-config.json written next to main.js at build time
//   3. the hardcoded default below
function getRemoteUrl() {
    if (process.env.TERMI_REMOTE_URL) return process.env.TERMI_REMOTE_URL;
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'build-config.json'), 'utf8'));
        if (cfg.remoteUrl) return cfg.remoteUrl;
    } catch (_) {}
    return 'https://termi.shuvoo.com';
}

const REMOTE_URL = getRemoteUrl();

//   node-pty (optional native module)                      ─

let nodePty;
try {
    nodePty = require('node-pty');
} catch (e) {
    console.warn('[main] node-pty unavailable — local terminal disabled:', e.message);
    if (!app.isPackaged) {
        console.warn(
            '[main] Run "npm run setup:electron" to rebuild node-pty for this Electron version.',
        );
    }
}

const localPtys = new Map();

//   Native passkey / WebAuthn (macOS only)                 ─

// Chromium's navigator.credentials is broken inside Electron on macOS, so we
// bridge passkey ceremonies to Apple's AuthenticationServices via the native
// `electron-webauthn` addon (an ESM-only package backed by an N-API binary, so
// it needs no electron-rebuild). On Windows/Linux the renderer uses the browser's
// own WebAuthn and this module is never loaded.
let electronWebauthnPromise;
function loadElectronWebauthn() {
    if (process.platform !== 'darwin') return Promise.resolve(null);
    if (!electronWebauthnPromise) {
        // Dynamic import: the package is ESM, so a synchronous require() would be
        // fragile across Electron/Node versions.
        electronWebauthnPromise = import('electron-webauthn')
            .then((m) => m.default ?? m)
            .catch((e) => {
                console.warn(
                    '[main] electron-webauthn unavailable — native macOS passkeys disabled:',
                    e.message,
                );
                return null;
            });
    }
    return electronWebauthnPromise;
}

/** base64url string → Uint8Array (WebAuthn options use base64url). */
function b64urlToBytes(s) {
    return new Uint8Array(Buffer.from(String(s), 'base64url'));
}

/** The origin the page is actually served from — must match the server's
 * expectedOrigin / rpID when it verifies the ceremony. */
function currentPageOrigin() {
    try {
        const url = win && !win.isDestroyed() ? win.webContents.getURL() : '';
        if (url) return new URL(url).origin;
    } catch (_) {}
    try {
        return new URL(REMOTE_URL).origin;
    } catch (_) {
        return REMOTE_URL;
    }
}

function getWindowIconPath() {
    const candidates = [
        path.join(__dirname, '../../apps/web/public/icons/icon-512x512.png'),
        path.join(__dirname, '../../apps/web/public/favicon.png'),
        path.join(__dirname, '../../build/icon.png'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || undefined;
}

//   Windows                                                ─

/** Tell the renderer (SPA) to navigate without a full page reload. */
function navigateTo(routePath) {
    const target = win && !win.isDestroyed() ? win : BrowserWindow.getAllWindows()[0];
    if (target && !target.isDestroyed()) {
        target.webContents.send('app:navigate', routePath);
    }
}

/**
 * Fire an app-level command in the renderer (new shell, close shell, …).
 *
 * These live in the native menu rather than as renderer key handlers so they
 * appear next to their shortcut in the menu bar — how a desktop user discovers
 * them — and so they keep working while focus is inside a terminal, which
 * swallows most keystrokes.
 */
function sendCommand(command) {
    const target = win && !win.isDestroyed() ? win : BrowserWindow.getAllWindows()[0];
    if (target && !target.isDestroyed()) {
        target.webContents.send('app:command', command);
    }
}

function buildAppMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: 'about' },
                          {
                              label: 'Check for Updates…',
                              click: () => checkForUpdatesInteractive(),
                          },
                          { type: 'separator' },
                          { role: 'services' },
                          { type: 'separator' },
                          { role: 'hide' },
                          { role: 'hideOthers' },
                          { role: 'unhide' },
                          { type: 'separator' },
                          { role: 'quit' },
                      ],
                  },
              ]
            : []),
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                ...(isMac
                    ? [{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }]
                    : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
            ],
        },
        {
            // Terminal-centric commands, handled by the renderer. Cmd/Ctrl+1-4
            // are already bound to page navigation in "Go" below, so shell tabs
            // cycle with bracket keys instead of numbers, and closing a shell is
            // Shift+W so it doesn't shadow the standard "close window".
            label: 'Shell',
            submenu: [
                {
                    label: 'New Shell',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => sendCommand('shell:new'),
                },
                {
                    label: 'Close Shell',
                    accelerator: 'CmdOrCtrl+Shift+W',
                    click: () => sendCommand('shell:close'),
                },
                { type: 'separator' },
                {
                    label: 'Next Shell',
                    accelerator: 'CmdOrCtrl+Shift+]',
                    click: () => sendCommand('shell:next'),
                },
                {
                    label: 'Previous Shell',
                    accelerator: 'CmdOrCtrl+Shift+[',
                    click: () => sendCommand('shell:prev'),
                },
                { type: 'separator' },
                {
                    label: 'Quick Open Server…',
                    accelerator: 'CmdOrCtrl+K',
                    click: () => sendCommand('palette:open'),
                },
            ],
        },
        {
            label: 'Go',
            submenu: [
                {
                    label: 'Back',
                    accelerator: isMac ? 'Cmd+[' : 'Alt+Left',
                    click: () => {
                        const wc = win && !win.isDestroyed() ? win.webContents : undefined;
                        if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
                    },
                },
                {
                    label: 'Forward',
                    accelerator: isMac ? 'Cmd+]' : 'Alt+Right',
                    click: () => {
                        const wc = win && !win.isDestroyed() ? win.webContents : undefined;
                        if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
                    },
                },
                { type: 'separator' },
                { label: 'Servers', accelerator: 'CmdOrCtrl+1', click: () => navigateTo('/panel') },
                {
                    label: 'Groups',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => navigateTo('/panel/groups'),
                },
                {
                    label: 'Sessions',
                    accelerator: 'CmdOrCtrl+3',
                    click: () => navigateTo('/panel/sessions'),
                },
                {
                    label: 'Local Terminal',
                    accelerator: 'CmdOrCtrl+4',
                    click: () => navigateTo('/panel/local'),
                },
                { type: 'separator' },
                {
                    label: 'Settings',
                    accelerator: isMac ? 'Cmd+,' : 'Ctrl+,',
                    click: () => navigateTo('/panel/settings'),
                },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
            ],
        },
        // macOS puts "Check for Updates…" in the app menu above; other platforms
        // get a Help menu with the same action.
        ...(isMac
            ? []
            : [
                  {
                      label: 'Help',
                      submenu: [
                          {
                              label: 'Check for Updates…',
                              click: () => checkForUpdatesInteractive(),
                          },
                      ],
                  },
              ]),
    ];
    return Menu.buildFromTemplate(template);
}

//   Static asset caching                                   ─

let cachingConfigured = false;

/**
 * Static asset URL patterns and how long each may be cached.
 *
 * `immutable` is reserved for content-addressed files — anything under
 * /_next/static/ carries a hash in its name, so the bytes behind a given URL
 * never change and can be frozen forever. Everything else (icons, fonts,
 * optimised images) keeps a stable URL across deploys, so it gets a long but
 * finite TTL: cached hard for a day, then revalidated. That is the difference
 * between "instant on every request" and "never picks up a changed logo".
 */
const CACHE_RULES = [
    { urls: ['*://*/_next/static/*'], value: 'public, max-age=31536000, immutable' },
    {
        // Public assets and Next's optimised image endpoint. Long-lived but not
        // immutable, so a redeploy that changes one is still eventually seen.
        urls: [
            '*://*/_next/image*',
            '*://*/icons/*',
            '*://*/fonts/*',
            '*://*/favicon.ico',
            '*://*/favicon.png',
        ],
        value: 'public, max-age=86400, stale-while-revalidate=604800',
    },
];

/**
 * Rewrite response headers so Chromium's on-disk HTTP cache (persisted in
 * userData) serves static assets on later launches without hitting the network.
 * Next.js already sets good headers for /_next/static, but not for public files
 * like icons and fonts — this makes the whole static surface cache uniformly.
 *
 * Skipped in dev so HMR / fast-refresh chunks aren't frozen.
 */
function setupStaticAssetCaching() {
    if (IS_DEV || cachingConfigured) return;
    cachingConfigured = true;

    for (const rule of CACHE_RULES) {
        session.defaultSession.webRequest.onHeadersReceived(
            { urls: rule.urls },
            (details, callback) => {
                const headers = {};
                for (const [k, v] of Object.entries(details.responseHeaders || {})) {
                    // Drop any existing cache directives; we set our own below.
                    const lk = k.toLowerCase();
                    if (lk === 'cache-control' || lk === 'expires' || lk === 'pragma') continue;
                    headers[k] = v;
                }
                headers['Cache-Control'] = [rule.value];
                callback({ responseHeaders: headers });
            },
        );
    }
}

/**
 * Hosts this window may navigate to in place.
 *
 * The app's own origin, plus the identity providers whose sign-in flow is a
 * full-page redirect ("Sign in with Google" navigates the current window to
 * accounts.google.com and back). Sending those to the external browser would
 * strand the user there: they'd authenticate in Safari and the app would never
 * receive the session.
 */
const AUTH_NAV_HOSTS = new Set([
    'accounts.google.com',
    'accounts.youtube.com', // Google occasionally bounces consent through here
    'oauth2.googleapis.com',
]);

function isAllowedNavigation(target) {
    try {
        if (target.origin === new URL(REMOTE_URL).origin) return true;
    } catch {
        return false;
    }
    return AUTH_NAV_HOSTS.has(target.hostname);
}

function createWindow(appUrl) {
    Menu.setApplicationMenu(buildAppMenu());
    setupStaticAssetCaching();
    const iconPath = getWindowIconPath();

    // Reopen where the user left off, not at a fixed default in the middle of
    // the screen. `isMaximized` is applied after creation (see below).
    const { isMaximized, ...bounds } = getWindowState();

    win = new BrowserWindow({
        ...bounds,
        minWidth: 800,
        minHeight: 600,
        title: 'Termi',
        // Paint the window in the app's own dark background from the very first
        // frame. Electron's default is white, so without this the window flashes
        // white on launch and on every full reload before the page paints — the
        // "blinking" the app otherwise shows against a dark UI.
        backgroundColor: '#0f172a',
        // Don't show the window until the renderer has something to paint;
        // otherwise the empty (dark) frame appears a beat before the content.
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        ...(iconPath ? { icon: iconPath } : {}),
    });

    if (isMaximized) win.maximize();

    // Persist size/position/maximised state as the user changes them.
    trackWindowState(win);

    // Native right-click menu (copy/paste/select-all, link handling).
    attachContextMenu(win, { isDev: IS_DEV });

    // First paint is ready — reveal the window. macOS fades it in for us.
    win.once('ready-to-show', () => {
        if (win && !win.isDestroyed()) win.show();
    });

    win.loadURL(appUrl);

    if (IS_DEV) {
        win.webContents.openDevTools({ mode: 'detach' });

        session.defaultSession.webRequest.onBeforeSendHeaders(
            { urls: ['ws://localhost:22080/_next/*', 'http://localhost:22080/_next/*'] },
            (details, callback) => {
                details.requestHeaders['Origin'] = 'http://localhost:22080';
                callback({ requestHeaders: details.requestHeaders });
            },
        );
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Keep the shell pinned to its own origin.
    //
    // setWindowOpenHandler above only covers *new* windows. Without this, an
    // in-place navigation — a redirect, a target-less link, injected markup —
    // could move this window to an arbitrary site while the preload bridge
    // (passkeys, local terminal IPC) is still attached to it. Off-origin
    // destinations are handed to the real browser instead, where they belong.
    win.webContents.on('will-navigate', (event, url) => {
        let target;
        try {
            target = new URL(url);
        } catch {
            event.preventDefault();
            return;
        }

        if (isAllowedNavigation(target)) return;

        event.preventDefault();
        // Only hand real web pages to the browser; never custom schemes.
        if (target.protocol === 'https:' || target.protocol === 'http:') {
            shell.openExternal(url);
        }
    });

    // The preload bridge must never be attached to a page we didn't ship.
    win.webContents.on('will-attach-webview', (event) => event.preventDefault());
}

function startApp() {
    // The desktop app has no use for the marketing landing page — open straight
    // to login. (The login page redirects already-authenticated users to /panel.)
    const startUrl = new URL('/login', REMOTE_URL).toString();
    createWindow(startUrl);
}

//   Local terminal IPC                                     ─

ipcMain.handle('local-terminal:create', (event, id, { cols, rows, cwd } = {}) => {
    if (!nodePty)
        return { success: false, error: 'node-pty not available — run: npm run setup:electron' };

    if (!id || typeof id !== 'string' || id.length > 255) {
        return { success: false, error: 'Invalid terminal ID' };
    }
    if (localPtys.has(id)) {
        return { success: false, error: 'Terminal already exists with that ID' };
    }

    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

    const safeHome = os.homedir();
    let safeCwd = safeHome;
    if (cwd) {
        const resolved = path.resolve(cwd);
        if (fs.existsSync(resolved)) {
            safeCwd = resolved;
        } else {
            console.warn(`[local-terminal] cwd '${cwd}' does not exist — falling back to home`);
        }
    }

    // Login shell so profile files (~/.zprofile etc.) are sourced, giving the
    // full user PATH (Homebrew, nvm, npm globals, etc.) — apps launched from the
    // macOS Dock only inherit the minimal launchd PATH otherwise.
    const shellArgs = isWindows ? [] : ['-l'];

    try {
        const term = nodePty.spawn(shell, shellArgs, {
            name: 'xterm-256color',
            cols: cols || 80,
            rows: rows || 24,
            cwd: safeCwd,
            env: { ...process.env },
        });

        localPtys.set(id, term);

        term.onData((data) => {
            if (win && !win.isDestroyed()) {
                win.webContents.send('local-terminal:data', id, data);
            }
        });

        term.onExit(({ exitCode }) => {
            localPtys.delete(id);
            if (win && !win.isDestroyed()) {
                win.webContents.send('local-terminal:exit', id, exitCode);
            }
        });

        return { success: true };
    } catch (e) {
        console.error('[local-terminal] spawn failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.on('local-terminal:write', (event, id, data) => {
    const term = localPtys.get(id);
    if (term) term.write(data);
});

ipcMain.on('local-terminal:resize', (event, id, cols, rows) => {
    const term = localPtys.get(id);
    if (term) term.resize(cols, rows);
});

ipcMain.on('local-terminal:kill', (event, id) => {
    const term = localPtys.get(id);
    if (term) {
        try {
            term.kill();
        } catch (_) {}
        localPtys.delete(id);
    }
});

//   Native passkey IPC (macOS)                             ─

ipcMain.handle('passkey:isAvailable', async () => !!(await loadElectronWebauthn()));

ipcMain.handle('passkey:create', async (_event, optionsJSON) => {
    const electronWebauthn = await loadElectronWebauthn();
    if (!electronWebauthn) {
        return {
            success: false,
            error: 'NotSupportedError',
            message: 'Native passkeys unavailable',
        };
    }
    try {
        const o = optionsJSON || {};
        // Convert the server's base64url options JSON into W3C
        // PublicKeyCredentialCreationOptions (BufferSource fields).
        const publicKey = {
            challenge: b64urlToBytes(o.challenge),
            rp: o.rp,
            user: {
                id: b64urlToBytes(o.user.id),
                name: o.user.name,
                displayName: o.user.displayName,
            },
            pubKeyCredParams: o.pubKeyCredParams,
            timeout: o.timeout,
            attestation: o.attestation,
            authenticatorSelection: o.authenticatorSelection,
            excludeCredentials: (o.excludeCredentials || []).map((c) => ({
                type: c.type,
                id: b64urlToBytes(c.id),
                transports: c.transports,
            })),
            extensions: o.extensions,
        };
        const origin = currentPageOrigin();
        const result = await electronWebauthn.createCredential(publicKey, {
            currentOrigin: origin,
            topFrameOrigin: origin,
            nativeWindowHandle: win.getNativeWindowHandle(),
        });
        if (!result.success) {
            return { success: false, error: result.error, message: result.errorObject?.message };
        }
        const d = result.data;
        // Map the native (already base64url) result to RegistrationResponseJSON,
        // the exact shape @simplewebauthn/server expects.
        return {
            success: true,
            data: {
                id: d.credentialId,
                rawId: d.credentialId,
                type: 'public-key',
                authenticatorAttachment: 'platform',
                response: {
                    clientDataJSON: d.clientDataJSON,
                    attestationObject: d.attestationObject,
                    transports: d.transports,
                    authenticatorData: d.authData,
                    publicKey: d.publicKey,
                    publicKeyAlgorithm: d.publicKeyAlgorithm,
                },
                clientExtensionResults: d.extensions?.credProps
                    ? { credProps: d.extensions.credProps }
                    : {},
            },
        };
    } catch (e) {
        return { success: false, error: 'UnknownError', message: e.message };
    }
});

ipcMain.handle('passkey:get', async (_event, optionsJSON) => {
    const electronWebauthn = await loadElectronWebauthn();
    if (!electronWebauthn) {
        return {
            success: false,
            error: 'NotSupportedError',
            message: 'Native passkeys unavailable',
        };
    }
    try {
        const o = optionsJSON || {};
        const publicKey = {
            challenge: b64urlToBytes(o.challenge),
            rpId: o.rpId,
            timeout: o.timeout,
            userVerification: o.userVerification,
            allowCredentials: (o.allowCredentials || []).map((c) => ({
                type: c.type,
                id: b64urlToBytes(c.id),
                transports: c.transports,
            })),
            extensions: o.extensions,
        };
        const origin = currentPageOrigin();
        const result = await electronWebauthn.getCredential(publicKey, {
            currentOrigin: origin,
            topFrameOrigin: origin,
            nativeWindowHandle: win.getNativeWindowHandle(),
        });
        if (!result.success) {
            return { success: false, error: result.error, message: result.errorObject?.message };
        }
        const d = result.data;
        // Map to AuthenticationResponseJSON for @simplewebauthn/server.
        return {
            success: true,
            data: {
                id: d.credentialId,
                rawId: d.credentialId,
                type: 'public-key',
                authenticatorAttachment: 'platform',
                response: {
                    clientDataJSON: d.clientDataJSON,
                    authenticatorData: d.authenticatorData,
                    signature: d.signature,
                    userHandle: d.userHandle || undefined,
                },
                clientExtensionResults: {},
            },
        };
    } catch (e) {
        return { success: false, error: 'UnknownError', message: e.message };
    }
});

//   App lifecycle                                          ─

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

app.whenReady().then(() => {
    // Tag every request from the desktop app with a distinctive User-Agent.
    // The web server (session.ts / proxy.ts) recognises the "TermiDesktop"
    // marker and grants a 30-day rolling session instead of the 7-day web one.
    try {
        const baseUA = session.defaultSession.getUserAgent();
        if (!baseUA.includes('TermiDesktop')) {
            session.defaultSession.setUserAgent(`${baseUA} TermiDesktop/${app.getVersion()}`);
        }
    } catch (e) {
        console.warn('[main] failed to set desktop User-Agent:', e.message);
    }

    startApp();

    // Start checking GitHub Releases for shell updates (no-op in dev).
    initAutoUpdater({ isDev: IS_DEV });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) startApp();
});

app.on('before-quit', () => {
    for (const [, term] of localPtys) {
        try {
            term.kill();
        } catch (_) {}
    }
    localPtys.clear();
});
