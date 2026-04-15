"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('hollrDesktop', {
    toggleOverlay: () => electron_1.ipcRenderer.send('overlay:toggle'),
    platform: process.platform,
    version: process.env.npm_package_version ?? '1.0.0',
});
