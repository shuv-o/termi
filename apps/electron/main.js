const { app, BrowserWindow, shell, ipcMain, session, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

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

function buildAppMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: 'about' },
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
    ];
    return Menu.buildFromTemplate(template);
}

//   Static asset caching                                   ─

let cachingConfigured = false;

/**
 * Next.js serves everything under /_next/static/ with a content hash in the
 * filename, so those bytes never change. Rewrite their response headers to be
 * permanently cacheable; Chromium's on-disk HTTP cache (persisted in userData)
 * then serves them on later launches without hitting the network again.
 *
 * Skipped in dev so HMR / fast-refresh chunks aren't frozen.
 */
function setupStaticAssetCaching() {
    if (IS_DEV || cachingConfigured) return;
    cachingConfigured = true;

    session.defaultSession.webRequest.onHeadersReceived(
        { urls: ['*://*/_next/static/*'] },
        (details, callback) => {
            const headers = {};
            for (const [k, v] of Object.entries(details.responseHeaders || {})) {
                // Drop any existing cache directives; we set our own below.
                const lk = k.toLowerCase();
                if (lk === 'cache-control' || lk === 'expires' || lk === 'pragma') continue;
                headers[k] = v;
            }
            headers['Cache-Control'] = ['public, max-age=31536000, immutable'];
            callback({ responseHeaders: headers });
        },
    );
}

function createWindow(appUrl) {
    Menu.setApplicationMenu(buildAppMenu());
    setupStaticAssetCaching();
    const iconPath = getWindowIconPath();

    win = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'Termi',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        ...(iconPath ? { icon: iconPath } : {}),
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

    const shell =
        process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

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

    try {
        const term = nodePty.spawn(shell, [], {
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
    startApp();
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
