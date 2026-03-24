import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon } from '@/lib/khurk-apps';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { X, RefreshCw, ExternalLink, PictureInPicture2, Loader2 } from 'lucide-react';

export function AppWindow() {
  const { activeKhurkAppId, setActiveKhurkAppId, setKhurkPipMode } = useAppStore();
  const { show: showMenu } = useContextMenu();
  const [refreshCount, setRefreshCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const app = KHURK_APPS.find((a) => a.id === activeKhurkAppId);

  // Reset iframe and loading state whenever the active app changes
  useEffect(() => {
    setRefreshCount(0);
    setLoading(true);
  }, [activeKhurkAppId]);

  const refresh = useCallback(() => {
    setRefreshCount((c) => c + 1);
    setLoading(true);
  }, []);

  const handleClose = useCallback(() => {
    setActiveKhurkAppId(null);
    setKhurkPipMode(false);
  }, [setActiveKhurkAppId, setKhurkPipMode]);

  const handlePip = useCallback(() => {
    setKhurkPipMode(true);
  }, [setKhurkPipMode]);

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
            id: 'pip',
            label: 'Picture in Picture',
            icon: <PictureInPicture2 size={14} />,
            onClick: handlePip,
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
    [app, showMenu, refresh, handlePip, handleClose]
  );

  if (!app) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden bg-background">
      {/* ── Header ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-surface-1 border-b border-border/30 shrink-0 select-none cursor-default"
        onContextMenu={handleContextMenu}
      >
        {/* App icon */}
        <div
          className="w-7 h-7 rounded-lg overflow-hidden shrink-0 shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
          }}
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
          <p className="text-sm font-semibold text-foreground leading-tight truncate">
            {app.name}
          </p>
          <p className="text-[10px] text-muted-foreground/60 leading-tight truncate">{app.tagline}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
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
            title="Picture in Picture"
            onClick={handlePip}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
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

      {/* ── Iframe area ── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Loading overlay — fades out when iframe fires onLoad */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-4 pointer-events-none">
            <div
              className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
              }}
            >
              {app.imageSrc ? (
                <img src={app.imageSrc} alt={app.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <HollrIcon size={28} />
                </div>
              )}
            </div>
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading {app.name}…</p>
          </div>
        )}

        <iframe
          key={`${app.id}-${refreshCount}`}
          src={app.url}
          title={app.name}
          className="w-full h-full border-none"
          style={{
            opacity: loading ? 0 : 1,
            transition: 'opacity 0.35s ease',
          }}
          onLoad={() => setLoading(false)}
          allow="camera; microphone; fullscreen; clipboard-read; clipboard-write; autoplay"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-presentation"
        />
      </div>
    </div>
  );
}
