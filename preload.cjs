const { ipcRenderer, contextBridge } = require('electron');

const electronAPI = {
  sendNotification: (data) => {
    try {
      ipcRenderer.send('show-desktop-notification', data);
    } catch (e) {
      console.warn('[Preload] sendNotification IPC failed:', e);
    }
  },
  showNotification: async (data) => {
    try {
      return await ipcRenderer.invoke('show-desktop-notification', data);
    } catch (e) {
      console.warn('[Preload] showNotification invoke failed:', e);
      return { success: false, error: e.message };
    }
  },
  getVersion: () => ipcRenderer.invoke('paios:get-version'),
  getConfig: () => ipcRenderer.invoke('paios:get-config'),
  setConfig: (config) => ipcRenderer.invoke('paios:set-config', config),
  reload: () => ipcRenderer.invoke('paios:reload'),
  downloadUpdate: (params) => ipcRenderer.invoke('paios:download-update', params),
  applyUpdate: (params) => ipcRenderer.invoke('paios:apply-update', params),
  openExternal: (url) => ipcRenderer.invoke('paios:open-external', url),
};

try {
  if (process.contextIsolated && contextBridge) {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  } else {
    window.electronAPI = electronAPI;
  }
} catch (error) {
  window.electronAPI = electronAPI;
}

module.exports = { electronAPI };
