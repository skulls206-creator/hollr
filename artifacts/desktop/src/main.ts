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
const HOLLR_URL = process.env.HOLLR_URL ?? 'https://app.hollr.chat';
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

interface VoiceUser {
  userId: string;
  displayName: string;
  username: string;
  muted: boolean;
  speaking: boolean;
  streaming: boolean;
}

interface VoiceRoom {
  channelId: string;
  users: VoiceUser[];
}

interface NotificationsResult {
  isLoggedIn: boolean;
  unreadCount: number;
  voiceRooms: VoiceRoom[];
  debugInfo: string;
}

async function fetchNotifications(): Promise<NotificationsResult> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { isLoggedIn: false, unreadCount: 0, voiceRooms: [], debugInfo: 'no main window' };
  }

  try {
    type FetchResult = { status: number; body: string };
    const [meResult, notifResult, rawVoice] = await mainWindow.webContents.executeJavaScript(`
      Promise.all([
        fetch('/api/users/me', { credentials: 'include' })
          .then(r => r.text().then(b => ({ status: r.status, body: b.slice(0, 120) })))
          .catch(e => ({ status: 0, body: e.message })),
        fetch('/api/notifications', { credentials: 'include' })
          .then(r => r.text().then(b => ({ status: r.status, body: b })))
          .catch(e => ({ status: 0, body: '[]' })),
        Promise.resolve(
          window.__hollrVoice
            ? JSON.stringify(window.__hollrVoice.rooms || [])
            : '[]'
        ),
      ])
    `) as [FetchResult, FetchResult, string];

    const debug = `JS /me: ${meResult.status} | ${meResult.body.replace(/\s+/g, ' ').slice(0, 80)}`;

    if (meResult.status === 401 || meResult.status === 403 || meResult.status === 0) {
      return { isLoggedIn: false, unreadCount: 0, voiceRooms: [], debugInfo: debug };
    }

    let unread = 0;
    try {
      const notifs: Array<{ read: boolean }> = JSON.parse(notifResult.body);
      unread = Array.isArray(notifs) ? notifs.filter(n => !n.read).length : 0;
    } catch { /* ignore */ }

    let voiceRooms: VoiceRoom[] = [];
    try {
      const parsed = JSON.parse(rawVoice);
      voiceRooms = Array.isArray(parsed) ? parsed : [];
    } catch { /* ignore */ }

    return { isLoggedIn: true, unreadCount: unread, voiceRooms, debugInfo: debug };
  } catch (err) {
    return { isLoggedIn: false, unreadCount: 0, voiceRooms: [], debugInfo: `execJS err: ${String(err).slice(0, 80)}` };
  }
}

interface OverlayPayload {
  unreadCount: number;
  isLoggedIn: boolean;
  appUrl: string;
  voiceRooms: VoiceRoom[];
  debugInfo: string;
}

async function buildOverlayPayload(): Promise<OverlayPayload> {
  const { isLoggedIn, unreadCount, voiceRooms, debugInfo } = await fetchNotifications();
  return { unreadCount, isLoggedIn, appUrl: HOLLR_URL, voiceRooms, debugInfo };
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
      label: 'Show',
      click: () => showMainWindow(),
    },
    {
      label: 'Toggle Overlay  Ctrl+Shift+H',
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
