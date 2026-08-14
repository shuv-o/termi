const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    platform: process.platform,
    // Native passkey bridge — used on macOS where Chromium's WebAuthn is broken
    // inside Electron. On Windows/Linux the renderer uses the browser WebAuthn.
    passkey: {
        isAvailable: () => ipcRenderer.invoke('passkey:isAvailable'),
        create: (optionsJSON) => ipcRenderer.invoke('passkey:create', optionsJSON),
        get: (optionsJSON) => ipcRenderer.invoke('passkey:get', optionsJSON),
    },
    // Auto-update bridge — lets an in-app UI trigger/observe shell updates.
    // The core UX (download + restart prompt) is handled natively in the main
    // process, so wiring these in the renderer is optional.
    updater: {
        check: () => ipcRenderer.invoke('updater:check'),
        install: () => ipcRenderer.invoke('updater:install'),
        getVersion: () => ipcRenderer.invoke('updater:getVersion'),
        onStatus: (cb) => {
            const handler = (_e, status) => cb(status);
            ipcRenderer.on('updater:status', handler);
            return () => ipcRenderer.removeListener('updater:status', handler);
        },
        onProgress: (cb) => {
            const handler = (_e, progress) => cb(progress);
            ipcRenderer.on('updater:progress', handler);
            return () => ipcRenderer.removeListener('updater:progress', handler);
        },
    },
    // Native menu → renderer navigation (see "Go" menu in main.js)
    onNavigate: (cb) => {
        const handler = (_e, routePath) => cb(routePath);
        ipcRenderer.on('app:navigate', handler);
        return () => ipcRenderer.removeListener('app:navigate', handler);
    },
    // Native menu → app commands (see "Shell" menu in main.js): 'shell:new',
    // 'shell:close', 'shell:next', 'shell:prev', 'palette:open'.
    onCommand: (cb) => {
        const handler = (_e, command) => cb(command);
        ipcRenderer.on('app:command', handler);
        return () => ipcRenderer.removeListener('app:command', handler);
    },
    localTerminal: {
        create: (id, opts) => ipcRenderer.invoke('local-terminal:create', id, opts),
        write: (id, data) => ipcRenderer.send('local-terminal:write', id, data),
        resize: (id, cols, rows) => ipcRenderer.send('local-terminal:resize', id, cols, rows),
        kill: (id) => ipcRenderer.send('local-terminal:kill', id),
        onData: (id, cb) => {
            const handler = (_e, termId, data) => {
                if (termId === id) cb(data);
            };
            ipcRenderer.on('local-terminal:data', handler);
            return () => ipcRenderer.removeListener('local-terminal:data', handler);
        },
        onExit: (id, cb) => {
            const handler = (_e, termId, code) => {
                if (termId === id) cb(code);
            };
            ipcRenderer.on('local-terminal:exit', handler);
            return () => ipcRenderer.removeListener('local-terminal:exit', handler);
        },
    },
    tunnel: {
        open: (opts) => ipcRenderer.invoke('tunnel:open', opts),
        close: (id) => ipcRenderer.send('tunnel:close', id),
    },
});
