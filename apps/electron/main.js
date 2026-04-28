const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');

// ── Environment loading ───────────────────────────────────────────────────────

// Minimal .env parser — avoids a dotenv dependency in the main process.
function parseEnvFile(content) {
    for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (/^["'][\s\S]*["']$/.test(val)) val = val.slice(1, -1);
        // Don't override vars already set in the OS environment
        if (key && !(key in process.env)) process.env[key] = val;
    }
}

// Dev: load the monorepo root .env (apps/electron/main.js is two levels below root)
const rootEnvPath = path.join(__dirname, '../../.env');
if (fs.existsSync(rootEnvPath)) {
    try { parseEnvFile(fs.readFileSync(rootEnvPath, 'utf8')); } catch (_) {}
}

let guacdProcess, gatewayProcess, nextProcess, win;

// node-pty provides real PTY (pseudo-terminal) for the local terminal feature.
// Loaded lazily so the app still starts if node-pty hasn't been rebuilt for this
// Electron version — local terminal will show an error but nothing else breaks.
let nodePty;
try {
    nodePty = require('node-pty');
} catch (e) {
    console.warn('[main] node-pty unavailable — local terminal disabled:', e.message);
    if (!app.isPackaged) {
        console.warn('[main] Run "npm run setup:electron" to rebuild node-pty for this Electron version.');
    }
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

    // Validate and sanitise the working directory supplied by the renderer.
    // Fall back to the user's home directory if the path is missing, not
    // absolute, or does not exist on disk.
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

app.whenReady().then(async () => {
    // Packaged builds: load termi.config.json from the OS user-data directory.
    // On macOS: ~/Library/Application Support/Termi/termi.config.json
    // On Windows: %APPDATA%\Termi\termi.config.json
    if (app.isPackaged) {
        const configPath = path.join(app.getPath('userData'), 'termi.config.json');

        // Restrict config file to owner-only access (defence-in-depth for secrets).
        // Unix/macOS: chmod 0600 (rw-------).
        // Windows: use icacls to remove inheritance and grant only the current user full control.
        if (process.platform !== 'win32') {
            try { fs.chmodSync(configPath, 0o600); } catch (e) {
                if (fs.existsSync(configPath)) console.warn('[config] Failed to set permissions:', e.message);
            }
        } else {
            try {
                const { execSync } = require('child_process');
                const username = os.userInfo().username;
                execSync(`icacls "${configPath}" /inheritance:r /grant:r "${username}:F"`, { stdio: 'ignore' });
            } catch (_) {}
        }

        if (fs.existsSync(configPath)) {
            try {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                for (const [k, v] of Object.entries(cfg)) {
                    if (typeof v === 'string' && !(k in process.env)) process.env[k] = v;
                }
            } catch (e) {
                console.error('[config] Failed to parse termi.config.json:', e.message);
            }
        }

        const required = ['DATABASE_URL', 'SESSION_SECRET', 'ENCRYPTION_KEY', 'GATEWAY_JWT_SECRET'];
        const missing = required.filter(k => !process.env[k]);
        if (missing.length > 0) {
            dialog.showErrorBox(
                'Termi — Configuration Required',
                `Missing required configuration: ${missing.join(', ')}\n\n` +
                `Create the file:\n${configPath}\n\n` +
                `with the following JSON:\n` +
                `{\n` +
                `  "DATABASE_URL": "postgresql://user:pass@host:5432/termi",\n` +
                `  "SESSION_SECRET": "<openssl rand -base64 32>",\n` +
                `  "ENCRYPTION_KEY": "<openssl rand -base64 32>",\n` +
                `  "GATEWAY_JWT_SECRET": "<openssl rand -base64 32>"\n` +
                `}`
            );
            app.quit();
            return;
        }
    }

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
