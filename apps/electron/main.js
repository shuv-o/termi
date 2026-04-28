const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const os = require('os');

let guacdProcess, gatewayProcess, nextProcess, win;

// node-pty provides real PTY (pseudo-terminal) for the local terminal feature.
// Loaded lazily so the app still starts if node-pty hasn't been rebuilt for this
// Electron version — local terminal will show an error but nothing else breaks.
let nodePty;
try {
    nodePty = require('node-pty');
} catch (e) {
    console.warn('[main] node-pty unavailable — local terminal disabled:', e.message);
}

// tabId → IPty instance
const localPtys = new Map();

function getPaths() {
    if (app.isPackaged) {
        const r = process.resourcesPath;
        return {
            nextServer: path.join(r, 'web-standalone', 'apps', 'web', 'server.js'),
            gateway: path.join(r, 'gateway.cjs'),
            nodePath: path.join(r, 'web-standalone', 'node_modules'),
        };
    }
    // Development: __dirname = apps/electron
    return {
        nextServer: path.join(__dirname, '../web/.next/standalone/apps/web/server.js'),
        gateway: path.join(__dirname, 'gateway.cjs'),
        nodePath: path.join(__dirname, '../web/.next/standalone/node_modules'),
    };
}

function startGuacd() {
    guacdProcess = spawn('docker', [
        'run', '--rm', '-p', '4822:4822', '--name', 'guacd-desktop',
        'guacamole/guacd:1.5.4',
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
            GATEWAY_PORT: '8080',
            GATEWAY_HOST: '127.0.0.1',
            ALLOWED_ORIGINS: 'http://localhost:8847,http://127.0.0.1:8847',
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
                PORT: '8847',
                HOSTNAME: '127.0.0.1',
                NODE_ENV: 'production',
                // Tells the token API route to hand the local gateway URL to the browser
                NEXT_PUBLIC_GATEWAY_URL: 'ws://127.0.0.1:8080',
            },
        });
        nextProcess.stdout.on('data', d => console.log('[next]', d.toString().trim()));
        nextProcess.stderr.on('data', d => console.error('[next]', d.toString().trim()));
        nextProcess.on('error', reject);

        const poll = setInterval(() => {
            const req = http.get('http://127.0.0.1:8847', res => {
                // Any response (including redirects) means the server is up
                if (res.statusCode < 500) {
                    clearInterval(poll);
                    clearTimeout(timeout);
                    resolve();
                }
                res.resume();
            });
            req.on('error', () => {}); // not ready yet
        }, 500);

        const timeout = setTimeout(() => {
            clearInterval(poll);
            reject(new Error('Next.js server did not start within 30 s'));
        }, 30000);
    });
}

function createWindow() {
    win = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'Termi',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    win.loadURL('http://127.0.0.1:8847');

    // Open external links in default browser rather than a new Electron window
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

// ── Local terminal IPC ────────────────────────────────────────────────────────

ipcMain.handle('local-terminal:create', (event, id, { cols, rows, cwd } = {}) => {
    if (!nodePty) return { success: false, error: 'node-pty not available — run: npm run setup:electron' };

    const shell =
        process.platform === 'win32'
            ? 'powershell.exe'
            : (process.env.SHELL || '/bin/zsh');

    try {
        const term = nodePty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: cols || 80,
            rows: rows || 24,
            cwd: cwd || os.homedir(),
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

app.whenReady().then(async () => {
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

    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
    for (const [, term] of localPtys) {
        try { term.kill(); } catch (_) {}
    }
    localPtys.clear();
    nextProcess?.kill();
    gatewayProcess?.kill();
    guacdProcess?.kill();
    // Best-effort synchronous stop so the named container is released
    try { spawnSync('docker', ['stop', 'guacd-desktop']); } catch (_) {}
});
