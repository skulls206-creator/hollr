"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('overlayBridge', {
    onData: (cb) => {
        electron_1.ipcRenderer.on('overlay:data', (_event, data) => cb(data));
    },
    requestData: () => electron_1.ipcRenderer.invoke('overlay:request-data'),
    openApp: () => electron_1.ipcRenderer.send('overlay:open-app'),
    setClickThrough: (enabled) => electron_1.ipcRenderer.send('overlay:set-clickthrough', enabled),
});
