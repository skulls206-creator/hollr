import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('hollrDesktop', {
  toggleOverlay: () => ipcRenderer.send('overlay:toggle'),
  platform: process.platform,
  version: process.env.npm_package_version ?? '1.0.0',
});
