import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useDragControls } from 'framer-motion';
import { useAppStore, type PipWindowEntry } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon } from '@/lib/khurk-apps';
import { X, Maximize2, GripHorizontal, RefreshCw, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [refreshCount, setRefreshCount] = useState(0);
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  // Initial position staggered from bottom-right
  const initX = Math.max(MARGIN, window.innerWidth  - DEFAULT_W - MARGIN - spawnIndex * STAGGER);
  const initY = Math.max(MARGIN, window.innerHeight - DEFAULT_H - HEADER_H - DOCK_CLEAR - spawnIndex * STAGGER);
  const x = useMotionValue(initX);
  const y = useMotionValue(initY);

  // dragControls: FM only starts dragging when we explicitly call start() from
  // the header. The resize handle is completely isolated — it never touches FM.
  const dragControls = useDragControls();

  const app = KHURK_APPS.find(a => a.id === entry.appId);
  if (!app) return null;

  // ── Resize via raw pointer events on the bottom-right handle ──────────────
  // We capture the DELTA between mouse-down position and current position, then
  // add it to the size at the moment of mouse-down. FM drag is NOT involved here
  // because dragListener={false} means FM never intercepts pointer events globally.
  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    // Snapshot size at mouse-down — we don't close over the reactive `size` here
    // because we read it only once at the start of the drag.
    const startW = size.w;
    const startH = size.h;

    const onMove = (ev: PointerEvent) => {
      const newW = Math.max(MIN_W, Math.min(MAX_W, startW + (ev.clientX - startX)));
      const newH = Math.max(MIN_H, Math.min(MAX_H, startH + (ev.clientY - startY)));
      setSize({ w: newW, h: newH });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  // size.w / size.h are read once at drag-start; the snapshot is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  const totalH = size.h + HEADER_H;

  return (
    <motion.div
      key={entry.id}
      drag
      dragControls={dragControls}
      dragListener={false}   // FM never auto-starts drag — only fires when header calls dragControls.start()
      dragMomentum={false}
      dragElastic={0}
      style={{ x, y, width: size.w, height: totalH }}
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
      {/* ── Drag handle / header — the ONLY area that starts FM drag ── */}
      <div
        className="flex items-center gap-1.5 px-2 bg-surface-1/95 backdrop-blur-sm border-b border-border/20 cursor-grab active:cursor-grabbing shrink-0"
        style={{ height: HEADER_H }}
        onPointerDown={(e) => {
          // Only start drag from the header strip (not buttons inside it).
          // Buttons call e.stopPropagation() so this won't fire for them.
          dragControls.start(e);
        }}
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

      {/* ── Iframe (fills remaining height) ── */}
      <div className="relative flex-1 min-h-0">
        <iframe
          key={`pip-${entry.id}-${refreshCount}`}
          src={app.url}
          title={`${app.name} — PiP`}
          className="absolute inset-0 w-full h-full border-none block"
          allow="camera; microphone; fullscreen; clipboard-read; clipboard-write; autoplay"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-presentation"
        />
      </div>

      {/* ── Resize handle — bottom-right corner, completely FM-independent ── */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 flex items-end justify-end pb-0.5 pr-0.5 cursor-nwse-resize z-10 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
        style={{ touchAction: 'none' }}
        onPointerDown={handleResizePointerDown}
      >
        <ChevronsUpDown size={11} className="rotate-45" />
      </div>
    </motion.div>
  );
}

// ─── Manager — renders all active PiP windows ──────────────────────────────────
export function PiPWindow() {
  const { pipWindows } = useAppStore();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Stable spawn-index per window so positions don't jump when others close
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
