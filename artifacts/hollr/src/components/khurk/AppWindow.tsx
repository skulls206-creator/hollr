import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon } from '@/lib/khurk-apps';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { useToast } from '@/hooks/use-toast';
import { X, RefreshCw, ExternalLink, PictureInPicture2, Loader2, PanelLeft, PanelLeftClose, MessageSquare, FolderOpen, FolderCheck, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── IndexedDB helpers (shared with PiPWindow) ────────────────────────────────
import { saveHandleToIdb, loadHandleFromIdb } from '@/lib/khurk-fs-idb';

// ── Recursive directory reader ──────────────────────────────────────────────
// Used only for iframe-based apps (vault protocol). Native panels read directly.
async function readDirRecursive(
  handle: FileSystemDirectoryHandle,
  prefix = '',
  out: { name: string; content: string; lastModified: number }[] = [],
): Promise<{ name: string; content: string; lastModified: number }[]> {
  for await (const entry of handle.values()) {
    if (entry.name.startsWith('.')) continue;
    if (entry.kind === 'file') {
      if (/\.(md|txt|json)$/i.test(entry.name)) {
        const file = await entry.getFile();
        out.push({ name: prefix + entry.name, content: await file.text(), lastModified: file.lastModified });
      }
    } else if (entry.kind === 'directory') {
      await readDirRecursive(entry, `${prefix}${entry.name}/`, out);
    }
  }
  return out;
}

const MAX_PIP = 4;

export function AppWindow() {
  const {
    activeKhurkAppId, setActiveKhurkAppId, setKhurkPipMode,
    pipWindows, addPipWindow,
    layoutMode, toggleMobileSidebar, toggleClassicChannel,
    appWindowSidebarHidden, toggleAppWindowSidebar,
    dmCall,
  } = useAppStore();

  // When the minimized call bar is visible (fixed top-0), push the window below it
  // so the header/close controls are always accessible.
  const callBarVisible = dmCall.minimized && dmCall.state === 'connected';
  const CALL_BAR_H = 44; // px — matches DmCallOverlay minimized bar height
  const { toast } = useToast();
  const { show: showMenu } = useContextMenu();
  const [refreshCount, setRefreshCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connectedFolderName, setConnectedFolderName] = useState<string | null>(null);

  // Native panel: the actual FileSystemDirectoryHandle, passed directly as a prop.
  const [nativeDirHandle, setNativeDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const vaultListenerRef = useRef<((e: MessageEvent) => void) | null>(null);
  const pendingVaultRef = useRef<{
    name: string;
    files: { name: string; content: string; lastModified: number }[];
    handle?: FileSystemDirectoryHandle;
  } | null>(null);
  const pendingProtocolRef = useRef<'vault' | 'fs-directory'>('vault');

  const app = KHURK_APPS.find((a) => a.id === activeKhurkAppId);
  const isNative = !!app?.nativePanel;

  // ── Handle persistence: save to IndexedDB whenever a native handle is connected ─
  useEffect(() => {
    if (!app || !isNative || !nativeDirHandle) return;
    saveHandleToIdb(app.id, nativeDirHandle);
  }, [app, isNative, nativeDirHandle]);

  // ── Auto-reconnect: restore handle from IndexedDB on native app open ─────────
  useEffect(() => {
    if (!app?.id || !isNative) return;
    let cancelled = false;
    loadHandleFromIdb(app.id).then(async (stored) => {
      if (cancelled || !stored) return;
      try {
        const perm = await stored.requestPermission({ mode: 'readwrite' });
        if (!cancelled && perm === 'granted') {
          setNativeDirHandle(stored);
          setConnectedFolderName(stored.name);
        }
      } catch { /* permission denied or unsupported — user can pick manually */ }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, isNative]);

  // Posts the current pending vault payload to the iframe (iframe apps only).
  const sendVault = useCallback((delayMs = 0) => {
    const go = () => {
      const payload = pendingVaultRef.current;
      const win = iframeRef.current?.contentWindow;
      if (!payload || !win) return;

      if (pendingProtocolRef.current === 'fs-directory') {
        win.postMessage({ type: 'khurk:fs-directory', handle: payload.handle }, '*');
        return;
      }

      let isSameOrigin = false;
      try {
        const appOrigin = new URL(iframeRef.current!.src).origin;
        isSameOrigin = appOrigin === window.location.origin;
      } catch { /* cross-origin */ }
      const { handle: _handle, ...safePayload } = payload;
      win.postMessage(
        { type: 'khurk:vault-open', ...(isSameOrigin ? payload : safePayload) },
        '*',
      );
    };
    if (delayMs > 0) setTimeout(go, delayMs); else go();
  }, []);

  // Reset all state when the active app changes.
  useEffect(() => {
    setRefreshCount(0);
    setLoading(true);
    setConnectedFolderName(null);
    setNativeDirHandle(null);
    if (vaultListenerRef.current) {
      window.removeEventListener('message', vaultListenerRef.current);
      vaultListenerRef.current = null;
    }
    dirHandleRef.current = null;
    pendingVaultRef.current = null;
    pendingProtocolRef.current = 'vault';
  }, [activeKhurkAppId]);

  // Listen for ballpoint:ready (iframe apps only — native panels don't need it).
  useEffect(() => {
    const onReady = (e: MessageEvent) => {
      if (e.data?.type !== 'ballpoint:ready') return;
      sendVault();
    };
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, [sendVault]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      if (vaultListenerRef.current) {
        window.removeEventListener('message', vaultListenerRef.current);
      }
    };
  }, []);

  const refresh = useCallback(() => {
    if (isNative) {
      // For native panels, re-mount by clearing and restoring the handle.
      const h = nativeDirHandle;
      setNativeDirHandle(null);
      setTimeout(() => setNativeDirHandle(h), 50);
    } else {
      setRefreshCount((c) => c + 1);
      setLoading(true);
      setConnectedFolderName(null);
    }
  }, [isNative, nativeDirHandle]);

  const handleClose = useCallback(() => {
    setActiveKhurkAppId(null);
    setKhurkPipMode(false);
  }, [setActiveKhurkAppId, setKhurkPipMode]);

  const handlePip = useCallback(() => {
    if (!activeKhurkAppId) return;
    if (pipWindows.length >= MAX_PIP) {
      toast({ title: 'Maximum 4 PiP windows open', description: 'Close one before opening another.', variant: 'destructive' });
      return;
    }
    addPipWindow(activeKhurkAppId);
    setActiveKhurkAppId(null);
  }, [activeKhurkAppId, pipWindows.length, addPipWindow, setActiveKhurkAppId, toast]);

  // ── Folder picker ──────────────────────────────────────────────────────────
  // For native panels: just pick the folder and pass the handle as a prop.
  // For iframe apps: read files and send via postMessage (existing vault-proxy logic).
  const handlePickFolder = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      toast({
        title: 'Not supported in this browser',
        description: 'File System Access requires Chrome or Edge on desktop.',
        variant: 'destructive',
      });
      return;
    }

    let dir: FileSystemDirectoryHandle;
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Could not open folder', description: msg, variant: 'destructive' });
      return;
    }

    // ── Native panel path ────────────────────────────────────────────────────
    if (isNative) {
      setNativeDirHandle(dir);
      setConnectedFolderName(dir.name);
      toast({ title: `Folder connected: ${dir.name}` });
      return;
    }

    // ── Iframe path (existing logic) ─────────────────────────────────────────
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      toast({ title: 'App not ready', description: 'Wait for the app to finish loading first.', variant: 'destructive' });
      return;
    }

    const protocol = app?.folderProtocol ?? 'vault';

    if (protocol === 'fs-directory') {
      pendingProtocolRef.current = 'fs-directory';
      dirHandleRef.current = dir;
      pendingVaultRef.current = { name: dir.name, files: [], handle: dir };
      iframe.contentWindow.postMessage({ type: 'khurk:fs-directory', handle: dir }, '*');
      setConnectedFolderName(dir.name);
      toast({
        title: `Folder connected: ${dir.name}`,
        description: 'The app will ask for permission to access it.',
      });
      return;
    }

    // Vault protocol: read all text files and send them.
    let files: { name: string; content: string; lastModified: number }[] = [];
    try {
      files = await readDirRecursive(dir);
    } catch (err: any) {
      toast({ title: 'Could not read folder', description: String(err?.message ?? err), variant: 'destructive' });
      return;
    }

    dirHandleRef.current = dir;
    if (vaultListenerRef.current) window.removeEventListener('message', vaultListenerRef.current);

    const listener = async (e: MessageEvent) => {
      const d = e.data;
      const handle = dirHandleRef.current;
      if (!handle || !d?.type?.startsWith('ballpoint:')) return;
      try {
        if (d.type === 'ballpoint:write-file') {
          const fh = await handle.getFileHandle(d.name, { create: true });
          const w = await fh.createWritable(); await w.write(d.content); await w.close();
        } else if (d.type === 'ballpoint:create-file') {
          const fh = await handle.getFileHandle(d.name, { create: true });
          const w = await fh.createWritable(); await w.write(''); await w.close();
        } else if (d.type === 'ballpoint:delete-file') {
          await handle.removeEntry(d.name);
        } else if (d.type === 'ballpoint:rename-file') {
          const oldFh = await handle.getFileHandle(d.oldName);
          const content = d.content ?? await (await oldFh.getFile()).text();
          const newFh = await handle.getFileHandle(d.newName, { create: true });
          const w = await newFh.createWritable(); await w.write(content); await w.close();
          await handle.removeEntry(d.oldName);
        }
      } catch (err: unknown) { console.warn('[vault-proxy] write failed:', err); }
    };

    pendingProtocolRef.current = 'vault';
    vaultListenerRef.current = listener;
    window.addEventListener('message', listener);
    pendingVaultRef.current = { name: dir.name, files, handle: dir };

    let isSameOrigin = false;
    try { isSameOrigin = new URL(iframe.src).origin === window.location.origin; } catch {}
    iframe.contentWindow.postMessage(
      { type: 'khurk:vault-open', name: dir.name, files, ...(isSameOrigin ? { handle: dir } : {}) },
      '*',
    );

    setConnectedFolderName(dir.name);
    toast({
      title: `Vault opened: ${dir.name}`,
      description: `${files.length} note${files.length !== 1 ? 's' : ''} loaded.`,
    });
  }, [app, isNative, toast]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!app) return;
      e.preventDefault();
      showMenu({
        x: e.clientX,
        y: e.clientY,
        title: app.name,
        subtitle: app.tagline,
        titleIcon: app.imageSrc,
        actions: [
          {
            id: 'refresh',
            label: 'Refresh App',
            icon: <RefreshCw size={14} />,
            onClick: refresh,
          },
          {
            id: 'pick-folder',
            label: connectedFolderName ? `Change Folder (${connectedFolderName})` : 'Connect a Folder…',
            icon: <FolderOpen size={14} />,
            onClick: handlePickFolder,
          },
          ...(!isNative && connectedFolderName ? [{
            id: 'resync-vault',
            label: `Re-sync "${connectedFolderName}"`,
            icon: <RotateCcw size={14} />,
            onClick: () => sendVault(),
          }] : []),
          {
            id: 'pip',
            label: pipWindows.length >= MAX_PIP ? 'PiP (max 4 reached)' : 'Picture in Picture',
            icon: <PictureInPicture2 size={14} />,
            onClick: handlePip,
            disabled: pipWindows.length >= MAX_PIP,
          },
          {
            id: 'open-tab',
            label: 'Open in New Tab',
            icon: <ExternalLink size={14} />,
            onClick: () => window.open(app.url, '_blank', 'noopener'),
            dividerBefore: true,
          },
          {
            id: 'close',
            label: 'Close App',
            icon: <X size={14} />,
            onClick: handleClose,
            dividerBefore: true,
          },
        ],
      });
    },
    [app, isNative, showMenu, refresh, handlePickFolder, handlePip, handleClose, connectedFolderName, sendVault, pipWindows.length]
  );

  if (!app) return null;

  const NativePanel = app.nativePanel;

  return (
    <div
      className="flex flex-col flex-1 min-h-0 h-full overflow-hidden bg-background transition-[padding-top]"
      style={{ paddingTop: callBarVisible ? CALL_BAR_H : 0 }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-surface-1 border-b border-border/30 shrink-0 select-none cursor-default"
        onContextMenu={handleContextMenu}
      >
        {/* Toggle icon rail */}
        <button
          title={appWindowSidebarHidden ? 'Show side icons' : 'Hide side icons'}
          onClick={toggleAppWindowSidebar}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
        >
          {appWindowSidebarHidden ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>

        {/* Toggle DM / channel panel */}
        <button
          title="Toggle messages panel"
          onClick={() => layoutMode === 'classic' ? toggleClassicChannel() : toggleMobileSidebar()}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors shrink-0 mr-0.5"
        >
          <MessageSquare size={16} />
        </button>

        {/* App icon */}
        <div
          className="w-7 h-7 rounded-lg overflow-hidden shrink-0 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)` }}
        >
          {app.imageSrc ? (
            <img src={app.imageSrc} alt={app.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HollrIcon size={16} />
            </div>
          )}
        </div>

        {/* App name + tagline */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight truncate">{app.name}</p>
          <p className="text-[10px] text-muted-foreground/60 leading-tight truncate">{app.tagline}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Connect Folder */}
          <button
            title={connectedFolderName ? `Connected: ${connectedFolderName} — click to change` : 'Connect a folder of files'}
            onClick={handlePickFolder}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              connectedFolderName
                ? 'text-emerald-400 hover:text-emerald-300 hover:bg-white/5'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
            )}
          >
            {connectedFolderName ? <FolderCheck size={13} /> : <FolderOpen size={13} />}
          </button>

          {/* Re-sync (iframe apps only) */}
          {!isNative && connectedFolderName && (
            <button
              title={`Re-sync "${connectedFolderName}" into app`}
              onClick={() => sendVault()}
              className="p-1.5 rounded-md text-emerald-400 hover:text-emerald-300 hover:bg-white/5 transition-colors"
            >
              <RotateCcw size={13} />
            </button>
          )}

          <button
            title="Refresh"
            onClick={refresh}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={13} />
          </button>
          <button
            title="Open in New Tab"
            onClick={() => window.open(app.url, '_blank', 'noopener')}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <ExternalLink size={13} />
          </button>
          <button
            title={pipWindows.length >= MAX_PIP ? 'Max 4 PiP windows open' : 'Picture in Picture'}
            onClick={handlePip}
            disabled={pipWindows.length >= MAX_PIP}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PictureInPicture2 size={13} />
          </button>
          <button
            title="Close"
            onClick={handleClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-0.5"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
        {NativePanel ? (
          /* Native panel — renders a real React component, no iframe */
          <Suspense fallback={
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg"
                style={{ background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)` }}
              >
                {app.imageSrc
                  ? <img src={app.imageSrc} alt={app.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><HollrIcon size={28} /></div>
                }
              </div>
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          }>
            <NativePanel
              storagePrefix={app.id}
              dirHandle={nativeDirHandle}
              onPickFolder={handlePickFolder}
            />
          </Suspense>
        ) : (
          /* Iframe — used for all non-native apps */
          <>
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-4 pointer-events-none">
                <div
                  className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)` }}
                >
                  {app.imageSrc
                    ? <img src={app.imageSrc} alt={app.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><HollrIcon size={28} /></div>
                  }
                </div>
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading {app.name}…</p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={`${app.id}-${refreshCount}`}
              src={app.url}
              title={app.name}
              className="w-full h-full border-none flex-1"
              style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.35s ease' }}
              onLoad={() => {
                setLoading(false);
                sendVault(900);
              }}
              allow="camera; microphone; fullscreen; clipboard-read; clipboard-write; autoplay; file-system-access"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-presentation"
            />
          </>
        )}
      </div>
    </div>
  );
}
