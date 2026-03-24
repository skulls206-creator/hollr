import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useDragControls } from 'framer-motion';
import { useAppStore, type PipWindowEntry } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon } from '@/lib/khurk-apps';
import { X, Maximize2, GripHorizontal, RefreshCw, ChevronsUpDown, ChevronsDownUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContextMenu } from '@/contexts/ContextMenuContext';

const DEFAULT_W  = 380;
const DEFAULT_H  = 240;
const HEADER_H   = 32;
const MARGIN     = 20;
const STAGGER    = 44;
const DOCK_CLEAR = 88;
const MIN_W      = 240;
const MIN_H      = 150;
const MAX_W      = 960;
const MAX_H      = 720;

// ─── Single floating window ────────────────────────────────────────────────────
function SinglePipWindow({
  entry,
  spawnIndex,
  isFocused,
  onFocus,
}: {
  entry: PipWindowEntry;
  spawnIndex: number;
  isFocused: boolean;
  onFocus: () => void;
}) {
  const { removePipWindow, restorePipWindow } = useAppStore();
  const { show: showMenu } = useContextMenu();
  const [refreshCount, setRefreshCount] = useState(0);
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  // Snap-to-min state: remembers the last "real" size so we can restore it
  const [isSnapped, setIsSnapped] = useState(false);
  const savedSize = useRef({ w: DEFAULT_W, h: DEFAULT_H });

  // isResizing ref: when true we skip CSS transition so resize feels instant
  const isResizing = useRef(false);
  const [, forceRender] = useState(0);

  // Initial position staggered from bottom-right
  const initX = Math.max(MARGIN, window.innerWidth  - DEFAULT_W - MARGIN - spawnIndex * STAGGER);
  const initY = Math.max(MARGIN, window.innerHeight - DEFAULT_H - HEADER_H - DOCK_CLEAR - spawnIndex * STAGGER);
  const x = useMotionValue(initX);
  const y = useMotionValue(initY);

  const dragControls = useDragControls();

  const app = KHURK_APPS.find(a => a.id === entry.appId);
  if (!app) return null;

  // ── Window-level right-click menu ──────────────────────────────────────────
  const handleWindowContextMenu = useCallback((e: React.MouseEvent) => {
    if (!app) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu({
      x: e.clientX, y: e.clientY,
      title: app.name,
      subtitle: app.tagline,
      titleIcon: app.imageSrc,
      actions: [
        {
          id: 'refresh',
          label: 'Refresh',
          icon: <RefreshCw size={14} />,
          onClick: () => setRefreshCount(c => c + 1),
        },
        {
          id: 'snap',
          label: isSnapped ? 'Restore Size' : 'Snap to Smallest',
          icon: isSnapped ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />,
          onClick: () => {
            if (isSnapped) {
              setSize({ w: savedSize.current.w, h: savedSize.current.h });
              setIsSnapped(false);
            } else {
              savedSize.current = { w: size.w, h: size.h };
              setSize({ w: MIN_W, h: MIN_H });
              setIsSnapped(true);
            }
          },
        },
        {
          id: 'restore',
          label: 'Restore to Full Window',
          icon: <Maximize2 size={14} />,
          onClick: () => restorePipWindow(entry.id),
          dividerBefore: true,
        },
        {
          id: 'open-tab',
          label: 'Open in New Tab',
          icon: <ExternalLink size={14} />,
          onClick: () => window.open(app.url, '_blank', 'noopener'),
        },
        {
          id: 'close',
          label: 'Close',
          icon: <X size={14} />,
          onClick: () => removePipWindow(entry.id),
          dividerBefore: true,
          danger: true,
        },
      ],
    });
  }, [app, entry.id, isSnapped, size.w, size.h, showMenu, restorePipWindow, removePipWindow]);

  // ── Snap toggle ────────────────────────────────────────────────────────────
  const handleSnapToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSnapped) {
      // Restore to remembered size
      setSize({ w: savedSize.current.w, h: savedSize.current.h });
      setIsSnapped(false);
    } else {
      // Save current size then collapse to minimum
      savedSize.current = { w: size.w, h: size.h };
      setSize({ w: MIN_W, h: MIN_H });
      setIsSnapped(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSnapped, size.w, size.h]);

  // ── Resize via raw pointer events on the bottom-right handle ──────────────
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Exit snap mode when user manually resizes — they're taking control again
    setIsSnapped(false);

    isResizing.current = true;
    forceRender(n => n + 1); // re-render to remove CSS transition immediately

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;

    const onMove = (ev: PointerEvent) => {
      const newW = Math.max(MIN_W, Math.min(MAX_W, startW + (ev.clientX - startX)));
      const newH = Math.max(MIN_H, Math.min(MAX_H, startH + (ev.clientY - startY)));
      setSize({ w: newW, h: newH });
      // Keep savedSize in sync so a subsequent snap restores to where the user landed
      savedSize.current = { w: newW, h: newH };
    };
    const onUp = () => {
      isResizing.current = false;
      forceRender(n => n + 1); // re-render to restore CSS transition
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  const totalH = size.h + HEADER_H;

  return (
    <motion.div
      key={entry.id}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      style={{
        x,
        y,
        width: size.w,
        height: totalH,
        // Animate size changes (snap/restore) but skip transition during live resize
        transition: isResizing.current
          ? 'none'
          : 'width 0.22s cubic-bezier(0.16,1,0.3,1), height 0.22s cubic-bezier(0.16,1,0.3,1)',
      }}
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.82 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'fixed left-0 top-0 rounded-xl overflow-hidden shadow-2xl border border-border/40 bg-black select-none flex flex-col',
        isFocused ? 'z-[210]' : 'z-[200]',
      )}
      onPointerDown={onFocus}
    >
      {/* ── Drag handle / header ── */}
      <div
        className="flex items-center gap-1.5 px-2 bg-surface-1/95 backdrop-blur-sm border-b border-border/20 cursor-grab active:cursor-grabbing shrink-0"
        style={{ height: HEADER_H }}
        onPointerDown={(e) => dragControls.start(e)}
        onDoubleClick={handleSnapToggle}
        onContextMenu={handleWindowContextMenu}
      >
        <GripHorizontal size={11} className="text-muted-foreground/50 shrink-0" />

        {/* App mini-icon */}
        <div
          className="w-4 h-4 rounded-md overflow-hidden shrink-0"
          style={{ background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)` }}
        >
          {app.imageSrc
            ? <img src={app.imageSrc} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><HollrIcon size={9} /></div>
          }
        </div>

        <p className="flex-1 text-[11px] font-semibold text-foreground truncate leading-none">{app.name}</p>

        {/* Live size readout */}
        <span className="text-[9px] text-muted-foreground/40 font-mono shrink-0 tabular-nums">
          {size.w}×{size.h}
        </span>

        {/* Snap to min / Restore size */}
        <button
          title={isSnapped ? 'Restore size' : 'Snap to smallest'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleSnapToggle}
          className={cn(
            'p-1 rounded transition-colors',
            isSnapped
              ? 'text-primary hover:text-primary/70'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {isSnapped
            ? <ChevronsUpDown size={9} />
            : <ChevronsDownUp size={9} />
          }
        </button>

        <button
          title="Refresh"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setRefreshCount(c => c + 1); }}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={9} />
        </button>
        <button
          title="Restore to full window"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); restorePipWindow(entry.id); }}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <Maximize2 size={10} />
        </button>
        <button
          title="Close"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); removePipWindow(entry.id); }}
          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
        >
          <X size={10} />
        </button>
      </div>

      {/* ── Iframe (fills remaining height, hidden when snapped to save resources) ── */}
      <div className="relative flex-1 min-h-0" onContextMenu={handleWindowContextMenu}>
        <iframe
          key={`pip-${entry.id}-${refreshCount}`}
          src={app.url}
          title={`${app.name} — PiP`}
          className="absolute inset-0 w-full h-full border-none block"
          allow="camera; microphone; fullscreen; clipboard-read; clipboard-write; autoplay"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-presentation"
        />
      </div>

      {/* ── Resize handle — bottom-right corner, hidden when snapped ── */}
      {!isSnapped && (
        <div
          className="absolute bottom-0 right-0 w-5 h-5 flex items-end justify-end pb-0.5 pr-0.5 cursor-nwse-resize z-10 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
          style={{ touchAction: 'none' }}
          onPointerDown={handleResizePointerDown}
        >
          <ChevronsUpDown size={11} className="rotate-45" />
        </div>
      )}
    </motion.div>
  );
}

// ─── Manager — renders all active PiP windows ──────────────────────────────────
export function PiPWindow() {
  const { pipWindows } = useAppStore();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const spawnIndexRef = useRef<Record<string, number>>({});
  pipWindows.forEach((entry) => {
    if (!(entry.id in spawnIndexRef.current)) {
      spawnIndexRef.current[entry.id] = Object.keys(spawnIndexRef.current).length;
    }
  });

  const handleFocus = useCallback((id: string) => setFocusedId(id), []);

  return (
    <AnimatePresence>
      {pipWindows.map((entry) => (
        <SinglePipWindow
          key={entry.id}
          entry={entry}
          spawnIndex={spawnIndexRef.current[entry.id] ?? 0}
          isFocused={
            focusedId === entry.id ||
            (focusedId === null && pipWindows[pipWindows.length - 1]?.id === entry.id)
          }
          onFocus={() => handleFocus(entry.id)}
        />
      ))}
    </AnimatePresence>
  );
}
