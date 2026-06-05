const { app, BrowserWindow, shell, ipcMain, session, Menu } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// ── Environment loading ───────────────────────────────────────────────────────

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
    try { parseEnvFile(fs.readFileSync(rootEnvPath, 'utf8')); } catch (_) {}
}

const IS_DEV = !app.isPackaged || process.env.ELECTRON_DEV === '1';

let guacdProcess, gatewayProcess, nextProcess, win, setupWin;

let nodePty;
try {
    nodePty = require('node-pty');
} catch (e) {
    console.warn('[main] node-pty unavailable — local terminal disabled:', e.message);
    if (!app.isPackaged) {
        console.warn('[main] Run "npm run setup:electron" to rebuild node-pty for this Electron version.');
    }
}

const localPtys = new Map();

// ── Config loading ────────────────────────────────────────────────────────────

function getConfigPath() {
    return path.join(app.getPath('userData'), 'termi.config.json');
}

function loadConfig() {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return;

    if (process.platform !== 'win32') {
        try { fs.chmodSync(configPath, 0o600); } catch (_) {}
    } else {
        try {
            const { execSync } = require('child_process');
            const username = os.userInfo().username;
            execSync(`icacls "${configPath}" /inheritance:r /grant:r "${username}:F"`, { stdio: 'ignore' });
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

// ── Service helpers ───────────────────────────────────────────────────────────

function getPaths() {
    if (app.isPackaged) {
        const r = process.resourcesPath;
        return {
            nextServer: path.join(r, 'web-standalone', 'apps', 'web', 'server.js'),
            gateway: path.join(r, 'gateway.cjs'),
            nodePath: path.join(r, 'web-standalone', 'node_modules'),
        };
    }
    return {
        nextServer: path.join(__dirname, '../web/.next/standalone/apps/web/server.js'),
        gateway: path.join(__dirname, 'gateway.cjs'),
        nodePath: path.join(__dirname, '../web/.next/standalone/node_modules'),
    };
}

function waitForDevServer(port = 22080, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        console.log(`[electron-dev] Waiting for Next.js dev server on :${port}…`);
        const poll = setInterval(() => {
            const req = http.get(`http://127.0.0.1:${port}`, res => {
                if (res.statusCode < 500) {
                    clearInterval(poll);
                    clearTimeout(timeout);
                    console.log(`[electron-dev] Next.js dev server is up on :${port}`);
                    resolve();
                }
                res.resume();
            });
            req.on('error', () => {});
        }, 500);

        const timeout = setTimeout(() => {
            clearInterval(poll);
            reject(new Error(`Dev server on :${port} did not start within ${timeoutMs / 1000} s`));
        }, timeoutMs);
    });
}

function startGuacd() {
    guacdProcess = spawn('docker', [
        'run', '--rm', '-p', '4822:4822', '--name', 'guacd-desktop',
        'guacamole/guacd:1.5.5',
    ]);
    guacdProcess.stderr.on('data', d => console.log('[guacd]', d.toString().trim()));
    guacdProcess.on('error', err =>
        console.warn('[guacd] Docker not available — RDP/VNC disabled:', err.message)
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
    gatewayProcess.stdout.on('data', d => console.log('[gateway]', d.toString().trim()));
    gatewayProcess.stderr.on('data', d => console.error('[gateway]', d.toString().trim()));
    gatewayProcess.on('error', err => console.error('[gateway] Failed to start:', err.message));
}

function startNextServer(paths) {
    return new Promise((resolve, reject) => {
        nextProcess = spawn(process.execPath, [paths.nextServer], {
            env: {
                ...process.env,
                PORT: '22080',
                HOSTNAME: '127.0.0.1',
                NODE_ENV: 'production',
                NEXT_PUBLIC_GATEWAY_URL: 'ws://127.0.0.1:22081',
                NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:22080',
            },
        });
        nextProcess.stdout.on('data', d => console.log('[next]', d.toString().trim()));
        nextProcess.stderr.on('data', d => console.error('[next]', d.toString().trim()));
        nextProcess.on('error', reject);

        const poll = setInterval(() => {
            const req = http.get('http://127.0.0.1:22080', res => {
                if (res.statusCode < 500) {
                    clearInterval(poll);
                    clearTimeout(timeout);
                    resolve();
                }
                res.resume();
            });
            req.on('error', () => {});
        }, 500);

        const timeout = setTimeout(() => {
            clearInterval(poll);
            reject(new Error('Next.js server did not start within 30 s'));
        }, 30000);
    });
}

// ── Windows ───────────────────────────────────────────────────────────────────

function buildAppMenu() {
    const isMac = process.platform === 'darwin';
    const reconfigureItem = {
        label: 'Reconfigure…',
        click: () => { app.relaunch(); app.quit(); },
    };

    const template = [
        ...(isMac ? [{
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
        }] : [{
            label: 'Termi',
            submenu: [
                reconfigureItem,
                { type: 'separator' },
                { role: 'quit' },
            ],
        }]),
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
                ...(isMac
                    ? [{ type: 'separator' }, { role: 'front' }]
                    : [{ role: 'close' }]),
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
    setupWin.on('closed', () => { setupWin = null; });
}

function createWindow(appUrl) {
    Menu.setApplicationMenu(buildAppMenu());

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
            }
        );
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

// ── Startup logic ─────────────────────────────────────────────────────────────

async function startApp(mode) {
    if (mode === 'local') {
        if (IS_DEV) {
            console.log('[electron-dev] Running in development mode.');
            console.log('[electron-dev] Expecting Next.js on :22080 and gateway on :22081.');
            startGuacd();
            try {
                await waitForDevServer(22080);
            } catch (err) {
                console.error('[electron-dev] Could not reach Next.js dev server:', err.message);
                app.quit();
                return;
            }
        } else {
            const paths = getPaths();
            startGuacd();
            startGateway(paths);
            try {
                await startNextServer(paths);
            } catch (err) {
                console.error('Failed to start Next.js server:', err.message);
                app.quit();
                return;
            }
        }
        createWindow(IS_DEV ? 'http://localhost:22080' : 'http://127.0.0.1:22080');
    } else if (mode === 'online') {
        const remoteUrl = process.env.TERMI_REMOTE_URL;
        if (!remoteUrl) {
            createSetupWindow('TERMI_REMOTE_URL is required for online mode');
            return;
        }
        if (process.env.RUN_LOCAL_GATEWAY === 'true') startGateway(getPaths());
        if (process.env.RUN_LOCAL_GUACD === 'true') startGuacd();
        createWindow(remoteUrl);
    }
}

// ── Setup IPC handlers ────────────────────────────────────────────────────────

ipcMain.handle('setup:generate-secret', () =>
    crypto.randomBytes(32).toString('base64')
);

ipcMain.handle('setup:check-docker', () => {
    const r = spawnSync('docker', ['info'], { timeout: 5000 });
    return { available: r.status === 0 };
});

ipcMain.handle('setup:get-config-path', () => getConfigPath());

ipcMain.handle('setup:open-config-folder', () =>
    shell.openPath(app.getPath('userData'))
);

ipcMain.handle('setup:save-config', (_e, config) => {
    const p = getConfigPath();
    fs.writeFileSync(p, JSON.stringify(config, null, 2), { mode: 0o600 });
    if (process.platform !== 'win32') {
        try { fs.chmodSync(p, 0o600); } catch (_) {}
    }
    return { ok: true };
});

ipcMain.handle('setup:launch', async () => {
    if (setupWin && !setupWin.isDestroyed()) setupWin.close();
    // Reload config that was just saved into process.env
    loadConfig();
    await startApp(process.env.TERMI_MODE);
});

// ── Local terminal IPC ────────────────────────────────────────────────────────

ipcMain.handle('local-terminal:create', (event, id, { cols, rows, cwd } = {}) => {
    if (!nodePty) return { success: false, error: 'node-pty not available — run: npm run setup:electron' };

    if (!id || typeof id !== 'string' || id.length > 255) {
        return { success: false, error: 'Invalid terminal ID' };
    }
    if (localPtys.has(id)) {
        return { success: false, error: 'Terminal already exists with that ID' };
    }

    const shell =
        process.platform === 'win32'
            ? 'powershell.exe'
            : (process.env.SHELL || '/bin/zsh');

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

        term.onData(data => {
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
        try { term.kill(); } catch (_) {}
        localPtys.delete(id);
    }
});

// ─────────────────────────────────────────────────────────────────────────────

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

    const mode = process.env.TERMI_MODE;

    if (!mode) {
        createSetupWindow();
        return;
    }

    if (mode === 'local') {
        const required = ['DATABASE_URL', 'SESSION_SECRET', 'ENCRYPTION_KEY', 'GATEWAY_JWT_SECRET'];
        const missing = required.filter(k => !process.env[k]);
        if (missing.length) {
            createSetupWindow(`Missing: ${missing.join(', ')}`);
            return;
        }
    }

    await startApp(mode);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && process.env.TERMI_MODE) {
        startApp(process.env.TERMI_MODE);
    }
});

app.on('before-quit', () => {
    for (const [, term] of localPtys) {
        try { term.kill(); } catch (_) {}
    }
    localPtys.clear();
    if (!IS_DEV) {
        nextProcess?.kill();
        gatewayProcess?.kill();
    }
    guacdProcess?.kill();
    try { spawnSync('docker', ['stop', 'guacd-desktop']); } catch (_) {}
});
