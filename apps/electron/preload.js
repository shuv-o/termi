const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    localTerminal: {
        create: (id, opts) =>
            ipcRenderer.invoke('local-terminal:create', id, opts),
        write: (id, data) =>
            ipcRenderer.send('local-terminal:write', id, data),
        resize: (id, cols, rows) =>
            ipcRenderer.send('local-terminal:resize', id, cols, rows),
        kill: (id) =>
            ipcRenderer.send('local-terminal:kill', id),
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
});
