const { contextBridge } = require('electron');

// Expone una API segura al proceso de renderizado si es necesario en el futuro
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform
});
