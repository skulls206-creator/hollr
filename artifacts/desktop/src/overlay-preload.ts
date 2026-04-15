import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('overlayBridge', {
  onData: (cb: (data: unknown) => void) => {
    ipcRenderer.on('overlay:data', (_event, data) => cb(data));
  },
  requestData: () => ipcRenderer.invoke('overlay:request-data'),
  openApp: () => ipcRenderer.send('overlay:open-app'),
  setClickThrough: (enabled: boolean) =>
    ipcRenderer.send('overlay:set-clickthrough', enabled),
});
