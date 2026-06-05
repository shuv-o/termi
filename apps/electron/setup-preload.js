const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupAPI', {
    generateSecret:   ()  => ipcRenderer.invoke('setup:generate-secret'),
    checkDocker:      ()  => ipcRenderer.invoke('setup:check-docker'),
    saveConfig:       (c) => ipcRenderer.invoke('setup:save-config', c),
    getConfigPath:    ()  => ipcRenderer.invoke('setup:get-config-path'),
    openConfigFolder: ()  => ipcRenderer.invoke('setup:open-config-folder'),
    launch:           ()  => ipcRenderer.invoke('setup:launch'),
});
