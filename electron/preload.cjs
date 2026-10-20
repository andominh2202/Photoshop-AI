const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),

  // Zero-copy binary buffer IPC for AI without JSON.stringify
  sendImageToAI: (jobId, layerId, buffer) =>
    ipcRenderer.invoke('ai:removeBackground', { jobId, layerId, buffer }),
  sendInpaintRequest: (jobId, layerId, imageBuffer, maskBuffer) =>
    ipcRenderer.invoke('ai:inpaint', { jobId, layerId, imageBuffer, maskBuffer }),
  cancelAIJob: (jobId) => ipcRenderer.invoke('ai:cancelJob', jobId),
  onAIProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('ai:progress', handler);
    return () => ipcRenderer.removeListener('ai:progress', handler);
  },
  reportReady: (frontendTimestamp) =>
    ipcRenderer.invoke('app:reportReady', { frontendTimestamp }),

  // Auto-Updater APIs
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('updater:available', handler);
    return () => ipcRenderer.removeListener('updater:available', handler);
  },
  onDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress.percent);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('updater:downloaded', handler);
    return () => ipcRenderer.removeListener('updater:downloaded', handler);
  },
});
