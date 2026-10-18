const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),
});
