const { app, BrowserWindow, shell, ipcMain, session, Menu } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

//   Environment loading                            ─

function parseEnvFile(content) {
    for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (/^["'][\s\S]*["']$/.test(val)) val = val.slice(1, -1);
        if (key && !(key in process.env)) process.env[key] = val;
    }
}

// Dev: load the monorepo root .env
const rootEnvPath = path.join(__dirname, '../../.env');
if (fs.existsSync(rootEnvPath)) {
    try {
        parseEnvFile(fs.readFileSync(rootEnvPath, 'utf8'));
    } catch (_) {}
}

const IS_DEV = !app.isPackaged || process.env.ELECTRON_DEV === '1';

let guacdProcess, gatewayProcess, win, setupWin;

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

//   Config loading

function getConfigPath() {
    return path.join(app.getPath('userData'), 'termi.config.json');
}

function loadConfig() {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return;

    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(configPath, 0o600);
        } catch (_) {}
    } else {
        try {
            const { execSync } = require('child_process');
            const username = os.userInfo().username;
            execSync(`icacls "${configPath}" /inheritance:r /grant:r "${username}:F"`, {
                stdio: 'ignore',
            });
        } catch (_) {}
    }

    try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        for (const [k, v] of Object.entries(cfg)) {
            if (typeof v === 'string' && !(k in process.env)) process.env[k] = v;
        }
    } catch (e) {
        console.error('[config] Failed to parse termi.config.json:', e.message);
    }
}

//   Service helpers                              ─

function getPaths() {
    if (app.isPackaged) {
        const r = process.resourcesPath;
        return {
            gateway: path.join(r, 'gateway.cjs'),
            // Native modules (node-pty, ssh2) are unpacked from the asar here
            nodePath: path.join(r, 'app.asar.unpacked', 'node_modules'),
        };
    }
    return {
        gateway: path.join(__dirname, 'gateway.cjs'),
        // In dev, use the workspace root node_modules (workspaces hoist deps)
        nodePath: path.join(__dirname, '../../node_modules'),
    };
}

function startGuacd() {
    guacdProcess = spawn('docker', [
        'run',
        '--rm',
        '-p',
        '4822:4822',
        '--name',
        'guacd-desktop',
        'guacamole/guacd: 1.6.0',
    ]);
    guacdProcess.stderr.on('data', (d) => console.log('[guacd]', d.toString().trim()));
    guacdProcess.on('error', (err) =>
        console.warn('[guacd] Docker not available — RDP/VNC disabled:', err.message),
    );
}

function startGateway(paths) {
    gatewayProcess = spawn(process.execPath, [paths.gateway], {
        env: {
            ...process.env,
            NODE_PATH: paths.nodePath,
            GATEWAY_PORT: process.env.GATEWAY_PORT || '22081',
            GATEWAY_HOST: '127.0.0.1',
            ALLOWED_ORIGINS: 'http://localhost:22080,http://127.0.0.1:22080',
        },
    });
    gatewayProcess.stdout.on('data', (d) => console.log('[gateway]', d.toString().trim()));
    gatewayProcess.stderr.on('data', (d) => console.error('[gateway]', d.toString().trim()));
    gatewayProcess.on('error', (err) => console.error('[gateway] Failed to start:', err.message));
}

//   Windows                                  ─

/** Tell the renderer (SPA) to navigate without a full page reload. */
function navigateTo(routePath) {
    const target = win && !win.isDestroyed() ? win : BrowserWindow.getAllWindows()[0];
    if (target && !target.isDestroyed()) {
        target.webContents.send('app:navigate', routePath);
    }
}

function buildAppMenu() {
    const isMac = process.platform === 'darwin';
    const reconfigureItem = {
        label: 'Reconfigure…',
        click: () => {
            app.relaunch();
            app.quit();
        },
    };

    const template = [
        ...(isMac
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: 'about' },
                          reconfigureItem,
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
            : [
                  {
                      label: 'Termi',
                      submenu: [reconfigureItem, { type: 'separator' }, { role: 'quit' }],
                  },
              ]),
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

function createSetupWindow(errorMsg) {
    setupWin = new BrowserWindow({
        width: 700,
        height: 580,
        resizable: false,
        title: 'Termi Setup',
        icon: path.join(__dirname, '../../build/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'setup-preload.js'),
        },
    });

    const fileUrl = new URL(`file://${path.join(__dirname, 'setup.html')}`);
    if (errorMsg) fileUrl.searchParams.set('error', errorMsg);
    setupWin.loadURL(fileUrl.toString());
    setupWin.on('closed', () => {
        setupWin = null;
    });
}

//   Static asset caching

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

    win = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'Termi',
        icon: path.join(__dirname, '../../build/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
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

//   Startup logic                               ─

async function startApp() {
    const remoteUrl = process.env.TERMI_REMOTE_URL;
    if (!remoteUrl) {
        createSetupWindow('TERMI_REMOTE_URL is not set');
        return;
    }

    if (process.env.RUN_LOCAL_GATEWAY === 'true') startGateway(getPaths());
    if (process.env.RUN_LOCAL_GUACD === 'true') startGuacd();

    // The desktop app has no use for the marketing landing page — open straight
    // to login. (The login page redirects already-authenticated users to /panel.)
    const startUrl = new URL('/login', remoteUrl).toString();
    createWindow(startUrl);
}

//   Setup IPC handlers

ipcMain.handle('setup:generate-secret', () => crypto.randomBytes(32).toString('base64'));

ipcMain.handle('setup:check-docker', () => {
    const r = spawnSync('docker', ['info'], { timeout: 5000 });
    return { available: r.status === 0 };
});

ipcMain.handle('setup:get-config-path', () => getConfigPath());

ipcMain.handle('setup:open-config-folder', () => shell.openPath(app.getPath('userData')));

ipcMain.handle('setup:save-config', (_e, config) => {
    const p = getConfigPath();
    fs.writeFileSync(p, JSON.stringify(config, null, 2), { mode: 0o600 });
    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(p, 0o600);
        } catch (_) {}
    }
    return { ok: true };
});

ipcMain.handle('setup:launch', async () => {
    if (setupWin && !setupWin.isDestroyed()) setupWin.close();
    // Reload config that was just saved into process.env
    loadConfig();
    await startApp();
});

//   Local terminal IPC

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

//                                       ─

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

app.whenReady().then(async () => {
    loadConfig();

    if (!process.env.TERMI_REMOTE_URL) {
        createSetupWindow();
        return;
    }

    await startApp();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && process.env.TERMI_REMOTE_URL) {
        startApp();
    }
});

app.on('before-quit', () => {
    for (const [, term] of localPtys) {
        try {
            term.kill();
        } catch (_) {}
    }
    localPtys.clear();
    gatewayProcess?.kill();
    guacdProcess?.kill();
    try {
        spawnSync('docker', ['stop', 'guacd-desktop']);
    } catch (_) {}
});
