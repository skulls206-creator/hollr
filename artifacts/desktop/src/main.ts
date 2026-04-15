import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  screen,
  shell,
  net,
  session,
  protocol,
} from 'electron';
import path from 'path';

const isDev = process.env.HOLLR_DEV === 'true';
const HOLLR_URL = process.env.HOLLR_URL ?? 'https://hollr.chat';
const OVERLAY_DEV_URL = 'http://localhost:6000';
const POLL_INTERVAL_MS = 5000;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let overlayVisible = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function getIconPath(): string {
  return path.join(__dirname, '..', 'assets', 'icon.png');
}

function getOverlayUrl(): string {
  if (isDev) return OVERLAY_DEV_URL;
  return `file://${path.join(__dirname, '..', 'dist-overlay', 'index.html')}`;
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'hollr',
    icon: getIconPath(),
    backgroundColor: '#0d0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      session: session.defaultSession,
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
    app.quit();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', () => {
    startPolling();
  });
}

function createOverlayWindow(): void {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
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
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      session: session.defaultSession,
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

function toggleOverlay(): void {
  if (!overlayWindow) return;

  if (overlayVisible) {
    overlayWindow.hide();
    overlayVisible = false;
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setFocusable(false);
    overlayWindow.show();
    overlayVisible = true;
    sendOverlayData();
  }
  updateTrayMenu();
}

function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function fetchNotificationCount(): Promise<number> {
  return new Promise((resolve) => {
    const cookies = session.defaultSession.cookies;
    cookies.get({ url: HOLLR_URL }).then((allCookies) => {
      const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join('; ');

      const req = net.request({
        url: `${HOLLR_URL}/api/notifications`,
        method: 'GET',
        session: session.defaultSession,
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
            const list: Array<{ read: boolean }> = Array.isArray(data)
              ? data
              : data.notifications ?? [];
            const unread = list.filter((n) => !n.read).length;
            resolve(unread);
          } catch {
            resolve(0);
          }
        });
      });

      req.on('error', () => resolve(0));
      req.end();
    });
  });
}

interface OverlayPayload {
  unreadCount: number;
  isLoggedIn: boolean;
  appUrl: string;
}

async function buildOverlayPayload(): Promise<OverlayPayload> {
  const cookies = await session.defaultSession.cookies.get({ url: HOLLR_URL });
  const isLoggedIn = cookies.some(
    (c) => c.name === 'hollr_session' || c.name === 'connect.sid' || c.name === 'session',
  );
  const unreadCount = isLoggedIn ? await fetchNotificationCount() : 0;

  return { unreadCount, isLoggedIn, appUrl: HOLLR_URL };
}

function sendOverlayData(): void {
  if (!overlayWindow || !overlayVisible) return;

  buildOverlayPayload().then((payload) => {
    overlayWindow?.webContents.send('overlay:data', payload);
    updateTrayBadge(payload.unreadCount);
  });
}

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => sendOverlayData(), POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function updateTrayBadge(count: number): void {
  if (!tray) return;
  if (process.platform === 'win32' && mainWindow) {
    if (count > 0) {
      mainWindow.setOverlayIcon(null, `${count} unread`);
    } else {
      mainWindow.setOverlayIcon(null, '');
    }
  }
}

function updateTrayMenu(): void {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
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
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray(): void {
  const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('hollr');
  tray.on('double-click', () => showMainWindow());
  updateTrayMenu();
}

app.on('ready', () => {
  protocol.handle('hollr-overlay', (req) => {
    const url = req.url.replace('hollr-overlay://', '');
    return new Response(url);
  });

  createMainWindow();
  createOverlayWindow();
  createTray();

  const registered = globalShortcut.register('CommandOrControl+Shift+H', () => {
    toggleOverlay();
  });

  if (!registered) {
    console.warn('[hollr] Could not register global shortcut Ctrl+Shift+H');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopPolling();
});

ipcMain.on('overlay:toggle', () => toggleOverlay());

ipcMain.on('overlay:set-clickthrough', (_event, enabled: boolean) => {
  if (!overlayWindow) return;
  overlayWindow.setIgnoreMouseEvents(enabled, { forward: true });
  if (enabled) {
    overlayWindow.setFocusable(false);
  } else {
    overlayWindow.setFocusable(true);
  }
});

ipcMain.on('overlay:open-app', () => {
  showMainWindow();
});

ipcMain.handle('overlay:request-data', async () => {
  return buildOverlayPayload();
});
