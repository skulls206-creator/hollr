import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/use-app-store';
import { KHURK_APPS, HollrIcon } from '@/lib/khurk-apps';
import { X, Maximize2, GripHorizontal } from 'lucide-react';

const PIP_W = 380;
const PIP_H = 240;
const HEADER_H = 30;
const MARGIN = 24;
const DOCK_CLEARANCE = 88;

function getInitialPos() {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return {
    x: window.innerWidth - PIP_W - MARGIN,
    y: window.innerHeight - PIP_H - DOCK_CLEARANCE,
  };
}

export function PiPWindow() {
  const { activeKhurkAppId, setActiveKhurkAppId, setKhurkPipMode, khurkPipMode } = useAppStore();
  const [refreshCount, setRefreshCount] = useState(0);
  const [initialPos] = useState(getInitialPos);

  const app = KHURK_APPS.find((a) => a.id === activeKhurkAppId);

  // Reset iframe when app changes while in PiP
  useEffect(() => {
    setRefreshCount(0);
  }, [activeKhurkAppId]);

  const handleClose = () => {
    setActiveKhurkAppId(null);
    setKhurkPipMode(false);
  };

  const handleRestore = () => {
    setKhurkPipMode(false);
  };

  if (!app || !khurkPipMode) return null;

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0}
        initial={{ opacity: 0, scale: 0.85, x: initialPos.x, y: initialPos.y }}
        animate={{ opacity: 1, scale: 1, x: initialPos.x, y: initialPos.y }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="fixed left-0 top-0 z-[200] rounded-xl overflow-hidden shadow-2xl border border-border/40 bg-black select-none"
        style={{ width: PIP_W, height: PIP_H + HEADER_H }}
      >
        {/* ── Drag handle / header ── */}
        <div
          className="flex items-center gap-2 px-2 py-1 bg-surface-1/95 backdrop-blur-sm border-b border-border/20 cursor-grab active:cursor-grabbing"
          style={{ height: HEADER_H }}
        >
          <GripHorizontal size={11} className="text-muted-foreground/50 shrink-0" />

          {/* App mini-icon */}
          <div
            className="w-4 h-4 rounded-md overflow-hidden shrink-0"
            style={{
              background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
            }}
          >
            {app.imageSrc ? (
              <img src={app.imageSrc} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <HollrIcon size={9} />
              </div>
            )}
          </div>

          <p className="flex-1 text-[11px] font-semibold text-foreground truncate leading-none">
            {app.name}
          </p>

          <button
            title="Restore to window"
            onClick={handleRestore}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <Maximize2 size={10} />
          </button>
          <button
            title="Close"
            onClick={handleClose}
            className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
          >
            <X size={10} />
          </button>
        </div>

        {/* ── Iframe ── */}
        <iframe
          key={`pip-${app.id}-${refreshCount}`}
          src={app.url}
          title={`${app.name} — Picture in Picture`}
          className="w-full border-none"
          style={{ height: PIP_H, display: 'block' }}
          allow="camera; microphone; fullscreen; clipboard-read; clipboard-write; autoplay"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-presentation"
        />
      </motion.div>
    </AnimatePresence>
  );
}
