"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const isDev = process.env.HOLLR_DEV === 'true';
const HOLLR_URL = process.env.HOLLR_URL ?? 'https://hollr.chat';
const OVERLAY_DEV_URL = 'http://localhost:6000';
const POLL_INTERVAL_MS = 5000;
let mainWindow = null;
let overlayWindow = null;
let tray = null;
let overlayVisible = false;
let pollTimer = null;
function getIconPath() {
    return path_1.default.join(__dirname, '..', 'assets', 'icon.png');
}
function getOverlayUrl() {
    if (isDev)
        return OVERLAY_DEV_URL;
    return `file://${path_1.default.join(__dirname, '..', 'dist-overlay', 'index.html')}`;
}
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        title: 'hollr',
        icon: getIconPath(),
        backgroundColor: '#0d0d14',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            session: electron_1.session.defaultSession,
        },
        show: false,
    });
    mainWindow.loadURL(HOLLR_URL);
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
        stopPolling();
        electron_1.app.quit();
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('did-finish-load', () => {
        startPolling();
    });
}
function createOverlayWindow() {
    const { width: screenW, height: screenH } = electron_1.screen.getPrimaryDisplay().workAreaSize;
    overlayWindow = new electron_1.BrowserWindow({
        width: 300,
        height: 420,
        x: screenW - 320,
        y: Math.floor(screenH / 2) - 210,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        movable: true,
        hasShadow: false,
        focusable: false,
        type: 'toolbar',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'overlay-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            session: electron_1.session.defaultSession,
        },
        show: false,
    });
    overlayWindow.loadURL(getOverlayUrl());
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.on('closed', () => {
        overlayWindow = null;
        overlayVisible = false;
    });
    overlayWindow.webContents.on('did-finish-load', () => {
        sendOverlayData();
    });
}
function toggleOverlay() {
    if (!overlayWindow)
        return;
    if (overlayVisible) {
        overlayWindow.hide();
        overlayVisible = false;
    }
    else {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        overlayWindow.setFocusable(false);
        overlayWindow.show();
        overlayVisible = true;
        sendOverlayData();
    }
    updateTrayMenu();
}
function showMainWindow() {
    if (!mainWindow) {
        createMainWindow();
        return;
    }
    if (mainWindow.isMinimized())
        mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}
async function fetchNotificationCount() {
    return new Promise((resolve) => {
        const cookies = electron_1.session.defaultSession.cookies;
        cookies.get({ url: HOLLR_URL }).then((allCookies) => {
            const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join('; ');
            const req = electron_1.net.request({
                url: `${HOLLR_URL}/api/notifications`,
                method: 'GET',
                session: electron_1.session.defaultSession,
            });
            req.setHeader('Cookie', cookieHeader);
            req.setHeader('Accept', 'application/json');
            let body = '';
            req.on('response', (res) => {
                res.on('data', (chunk) => {
                    body += chunk.toString();
                });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        const list = Array.isArray(data)
                            ? data
                            : data.notifications ?? [];
                        const unread = list.filter((n) => !n.read).length;
                        resolve(unread);
                    }
                    catch {
                        resolve(0);
                    }
                });
            });
            req.on('error', () => resolve(0));
            req.end();
        });
    });
}
async function buildOverlayPayload() {
    const cookies = await electron_1.session.defaultSession.cookies.get({ url: HOLLR_URL });
    const isLoggedIn = cookies.some((c) => c.name === 'hollr_session' || c.name === 'connect.sid' || c.name === 'session');
    const unreadCount = isLoggedIn ? await fetchNotificationCount() : 0;
    return { unreadCount, isLoggedIn, appUrl: HOLLR_URL };
}
function sendOverlayData() {
    if (!overlayWindow || !overlayVisible)
        return;
    buildOverlayPayload().then((payload) => {
        overlayWindow?.webContents.send('overlay:data', payload);
        updateTrayBadge(payload.unreadCount);
    });
}
function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => sendOverlayData(), POLL_INTERVAL_MS);
}
function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}
function updateTrayBadge(count) {
    if (!tray)
        return;
    if (process.platform === 'win32' && mainWindow) {
        if (count > 0) {
            mainWindow.setOverlayIcon(null, `${count} unread`);
        }
        else {
            mainWindow.setOverlayIcon(null, '');
        }
    }
}
function updateTrayMenu() {
    if (!tray)
        return;
    const menu = electron_1.Menu.buildFromTemplate([
        {
            label: 'Open hollr',
            click: () => showMainWindow(),
        },
        {
            label: overlayVisible ? 'Hide Overlay' : 'Show Overlay  Ctrl+Shift+H',
            click: () => toggleOverlay(),
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(menu);
}
function createTray() {
    const icon = electron_1.nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
    tray = new electron_1.Tray(icon);
    tray.setToolTip('hollr');
    tray.on('double-click', () => showMainWindow());
    updateTrayMenu();
}
electron_1.app.on('ready', () => {
    electron_1.protocol.handle('hollr-overlay', (req) => {
        const url = req.url.replace('hollr-overlay://', '');
        return new Response(url);
    });
    createMainWindow();
    createOverlayWindow();
    createTray();
    const registered = electron_1.globalShortcut.register('CommandOrControl+Shift+H', () => {
        toggleOverlay();
    });
    if (!registered) {
        console.warn('[hollr] Could not register global shortcut Ctrl+Shift+H');
    }
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (mainWindow === null)
        createMainWindow();
});
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
    stopPolling();
});
electron_1.ipcMain.on('overlay:toggle', () => toggleOverlay());
electron_1.ipcMain.on('overlay:set-clickthrough', (_event, enabled) => {
    if (!overlayWindow)
        return;
    overlayWindow.setIgnoreMouseEvents(enabled, { forward: true });
    if (enabled) {
        overlayWindow.setFocusable(false);
    }
    else {
        overlayWindow.setFocusable(true);
    }
});
electron_1.ipcMain.on('overlay:open-app', () => {
    showMainWindow();
});
electron_1.ipcMain.handle('overlay:request-data', async () => {
    return buildOverlayPayload();
});
