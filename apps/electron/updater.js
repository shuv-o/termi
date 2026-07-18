// Auto-update for the desktop shell, backed by GitHub Releases.
//
// This updates the NATIVE shell only (this main.js/preload.js, the bundled
// Electron runtime, and native modules like node-pty / electron-webauthn).
// The web UI is served remotely, so UI changes already reach users without an
// app update — auto-update exists for everything that ships inside the binary.
//
// Flow: on launch (and every few hours) the app asks GitHub for the latest
// release's metadata (latest.yml / latest-mac.yml / latest-linux.yml). If a
// newer version exists it downloads the installer in the background, then
// prompts the user to restart and apply it.
//
// Platform notes:
//   • Windows (NSIS) and Linux (AppImage) update without code signing.
//   • macOS REQUIRES a code-signed + notarized build with a matching signature;
//     Squirrel.Mac silently refuses unsigned updates. Unsigned mac builds still
//     run — they just never self-update (see apps/electron/PASSKEYS.md for the
//     same signing setup).

const { app, dialog, ipcMain, BrowserWindow } = require('electron');

// How often to re-check while the app stays open.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

let autoUpdater;
let updateDownloaded = false;
let checkTimer;

function mainWindow() {
    return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
}

/** Push a status update to the renderer so an in-app UI can react (optional). */
function emit(channel, payload) {
    const w = mainWindow();
    if (w) w.webContents.send(channel, payload);
}

/** Ask the user whether to restart now, once an update is fully downloaded. */
function promptInstall(info) {
    const w = mainWindow();
    const opts = {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Termi ${info?.version || ''} is ready to install.`,
        detail: 'The update will be applied the next time you restart. Restart now?',
    };
    const choice = w ? dialog.showMessageBox(w, opts) : dialog.showMessageBox(opts);
    choice.then(({ response }) => {
        if (response === 0) {
            // isSilent=false shows the installer UI on Windows; isForceRunAfter
            // relaunches the app after the update lands.
            autoUpdater.quitAndInstall(false, true);
        }
    });
}

/**
 * Wire up electron-updater. No-op in dev / unpackaged builds (there is no
 * app-update.yml and no signed artifact to compare against).
 *
 * @param {{ isDev?: boolean }} [options]
 */
function initAutoUpdater({ isDev } = {}) {
    if (isDev || !app.isPackaged) {
        console.log('[updater] disabled (dev / unpackaged build)');
        registerIpc(); // still expose IPC so the renderer gets clean "unsupported" answers
        return;
    }

    try {
        ({ autoUpdater } = require('electron-updater'));
    } catch (e) {
        console.warn('[updater] electron-updater not installed — auto-update disabled:', e.message);
        registerIpc();
        return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // We prompt the user ourselves, so don't let electron-updater relaunch on its own.
    autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };

    autoUpdater.on('checking-for-update', () => emit('updater:status', { state: 'checking' }));
    autoUpdater.on('update-available', (info) => {
        log('update available:', info.version);
        emit('updater:status', { state: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => emit('updater:status', { state: 'none' }));
    autoUpdater.on('download-progress', (p) =>
        emit('updater:progress', {
            percent: p.percent,
            transferred: p.transferred,
            total: p.total,
            bytesPerSecond: p.bytesPerSecond,
        }),
    );
    autoUpdater.on('error', (err) => {
        log('error:', err?.stack || err);
        emit('updater:status', { state: 'error', message: String(err?.message || err) });
    });
    autoUpdater.on('update-downloaded', (info) => {
        updateDownloaded = true;
        log('update downloaded:', info.version);
        emit('updater:status', { state: 'downloaded', version: info.version });
        promptInstall(info);
    });

    registerIpc();

    // Initial check shortly after launch, then on an interval.
    autoUpdater.checkForUpdates().catch((e) => log('initial check failed:', e.message));
    checkTimer = setInterval(() => {
        autoUpdater.checkForUpdates().catch((e) => log('periodic check failed:', e.message));
    }, CHECK_INTERVAL_MS);
    if (checkTimer.unref) checkTimer.unref();
}

let ipcRegistered = false;
function registerIpc() {
    if (ipcRegistered) return;
    ipcRegistered = true;

    // Manual "Check for updates" trigger from the app menu or renderer.
    ipcMain.handle('updater:check', async () => {
        if (!autoUpdater) return { success: false, error: 'Auto-update not available' };
        try {
            const r = await autoUpdater.checkForUpdates();
            return { success: true, version: r?.updateInfo?.version };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // Apply a downloaded update immediately.
    ipcMain.handle('updater:install', () => {
        if (autoUpdater && updateDownloaded) {
            autoUpdater.quitAndInstall(false, true);
            return true;
        }
        return false;
    });

    ipcMain.handle('updater:getVersion', () => app.getVersion());
}

/**
 * Manual check from the native menu. Unlike the silent background check, this
 * tells the user when they're already up to date.
 */
async function checkForUpdatesInteractive() {
    if (!autoUpdater) {
        const w = mainWindow();
        const opts = {
            type: 'info',
            title: 'Updates',
            message: 'Auto-update is unavailable in this build.',
            detail: app.isPackaged
                ? 'This build was not configured for automatic updates.'
                : 'Auto-update is disabled while running in development.',
        };
        return w ? dialog.showMessageBox(w, opts) : dialog.showMessageBox(opts);
    }
    try {
        const r = await autoUpdater.checkForUpdates();
        const latest = r?.updateInfo?.version;
        // If an update was found, the 'update-available'/'update-downloaded'
        // handlers drive the UX. Only announce the "already current" case here.
        if (latest && latest === app.getVersion()) {
            const w = mainWindow();
            const opts = {
                type: 'info',
                title: 'Updates',
                message: 'Termi is up to date.',
                detail: `You’re running the latest version (${app.getVersion()}).`,
            };
            if (w) dialog.showMessageBox(w, opts);
            else dialog.showMessageBox(opts);
        }
    } catch (e) {
        const w = mainWindow();
        const opts = {
            type: 'error',
            title: 'Updates',
            message: 'Could not check for updates.',
            detail: e.message,
        };
        if (w) dialog.showMessageBox(w, opts);
        else dialog.showMessageBox(opts);
    }
}

function log(...args) {
    console.log('[updater]', ...args);
}

module.exports = { initAutoUpdater, checkForUpdatesInteractive };
