import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppStore } from '@/store/use-app-store';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const WIDGET_W = 240;
const WIDGET_H = 135;
const MARGIN = 16;

export function ScreenShareMiniPreview() {
  const { user } = useAuth();
  const {
    voiceConnection,
    voiceChannelUsers,
    remoteScreenStreams,
    setPendingTheaterUserId,
  } = useAppStore();

  const channelId = voiceConnection.channelId;
  const channelUsers = channelId ? (voiceChannelUsers[channelId] ?? []) : [];

  const firstStreamer = channelUsers.find(
    u => u.streaming && u.userId !== user?.id
  ) ?? null;

  // Per-session dismiss state — reset when the streamer changes
  const [dismissed, setDismissed] = useState(false);
  const prevStreamerIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (firstStreamer?.userId !== prevStreamerIdRef.current) {
      setDismissed(false);
      prevStreamerIdRef.current = firstStreamer?.userId ?? null;
    }
  }, [firstStreamer?.userId]);

  const [minimized, setMinimized] = useState(false);

  const videoStream = firstStreamer
    ? (remoteScreenStreams[firstStreamer.userId] ?? null)
    : null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (videoStream) {
      el.srcObject = videoStream;
    } else {
      el.srcObject = null;
    }
  }, [videoStream]);

  // Draggable position — null means CSS-default (bottom-right corner)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    startMx: number;
    startMy: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const el = widgetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragState.current = {
      startMx: e.clientX,
      startMy: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };

    const onMove = (mv: MouseEvent) => {
      if (!dragState.current) return;
      const dx = mv.clientX - dragState.current.startMx;
      const dy = mv.clientY - dragState.current.startMy;
      const newLeft = dragState.current.startLeft + dx;
      const newTop = dragState.current.startTop + dy;
      const clampedLeft = Math.max(MARGIN, Math.min(window.innerWidth - WIDGET_W - MARGIN, newLeft));
      const clampedTop = Math.max(MARGIN, Math.min(window.innerHeight - WIDGET_H - MARGIN, newTop));
      setPos({ left: clampedLeft, top: clampedTop });
    };

    const onUp = () => {
      dragState.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const touch = e.touches[0];
    const el = widgetRef.current;
    if (!el || !touch) return;
    const rect = el.getBoundingClientRect();
    dragState.current = {
      startMx: touch.clientX,
      startMy: touch.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };

    const onMove = (mv: TouchEvent) => {
      if (!dragState.current) return;
      const t = mv.touches[0];
      if (!t) return;
      const dx = t.clientX - dragState.current.startMx;
      const dy = t.clientY - dragState.current.startMy;
      const newLeft = dragState.current.startLeft + dx;
      const newTop = dragState.current.startTop + dy;
      const clampedLeft = Math.max(MARGIN, Math.min(window.innerWidth - WIDGET_W - MARGIN, newLeft));
      const clampedTop = Math.max(MARGIN, Math.min(window.innerHeight - WIDGET_H - MARGIN, newTop));
      setPos({ left: clampedLeft, top: clampedTop });
    };

    const onEnd = () => {
      dragState.current = null;
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  }, []);

  const show = !!(
    firstStreamer &&
    !dismissed &&
    voiceConnection.status !== 'disconnected'
  );

  const posStyle: React.CSSProperties = pos
    ? { position: 'absolute', left: pos.left, top: pos.top }
    : { position: 'absolute', bottom: 96, right: MARGIN };

  return (
    <AnimatePresence>
      {show && !minimized && (
        <motion.div
          ref={widgetRef}
          key={`mini-preview-${firstStreamer?.userId}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.88 }}
          transition={{ duration: 0.18 }}
          style={{ ...posStyle, width: WIDGET_W, zIndex: 60 }}
          className="rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-black cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {/* Video / shimmer area */}
          <div className="relative" style={{ height: WIDGET_H }}>
            {videoStream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              /* Connecting shimmer */
              <div className="w-full h-full bg-black flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
                <span className="text-[11px] text-white/50 animate-pulse">Connecting…</span>
              </div>
            )}

            {/* LIVE badge */}
            <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-rose-600/90 backdrop-blur-sm rounded px-1.5 py-0.5">
              <Radio size={8} className="text-white animate-pulse" />
              <span className="text-[9px] font-bold text-white tracking-wide">LIVE</span>
            </div>

            {/* Action buttons */}
            <div className="absolute top-1 right-1 flex gap-1">
              {/* Expand to theater */}
              <button
                onClick={() => {
                  if (firstStreamer) setPendingTheaterUserId(firstStreamer.userId);
                }}
                title="Watch full screen"
                className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur flex items-center justify-center text-white transition-colors"
              >
                <Maximize2 size={11} />
              </button>

              {/* Minimize to pill */}
              <button
                onClick={() => setMinimized(true)}
                title="Minimize"
                className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur flex items-center justify-center text-white transition-colors"
              >
                <Minimize2 size={11} />
              </button>

              {/* Dismiss */}
              <button
                onClick={() => setDismissed(true)}
                title="Close"
                className="w-6 h-6 rounded-md bg-black/60 hover:bg-rose-600/80 backdrop-blur flex items-center justify-center text-white transition-colors"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Footer bar */}
          <div className="bg-black/80 px-2 py-1.5 flex items-center gap-1.5">
            <Avatar className="h-4 w-4 shrink-0">
              <AvatarImage src={firstStreamer?.avatarUrl || undefined} />
              <AvatarFallback className="bg-indigo-600 text-white text-[8px]">
                {getInitials(firstStreamer?.displayName ?? '?')}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-white/80 font-medium truncate">
              {firstStreamer?.displayName ?? 'Unknown'}
            </span>
            <span className="text-[10px] text-white/40 ml-auto shrink-0">screenshare</span>
          </div>
        </motion.div>
      )}

      {/* Minimized pill */}
      {show && minimized && (
        <motion.button
          key={`mini-pill-${firstStreamer?.userId}`}
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.88 }}
          transition={{ duration: 0.15 }}
          onClick={() => setMinimized(false)}
          style={pos ? { position: 'absolute', left: pos.left, top: pos.top + WIDGET_H } : { position: 'absolute', bottom: 96, right: MARGIN }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full',
            'bg-black/80 border border-white/10 backdrop-blur-sm shadow-xl',
            'text-white text-[11px] font-medium z-[60]',
            'hover:bg-black/90 transition-colors cursor-pointer',
          )}
          title="Restore screenshare preview"
        >
          <Radio size={9} className="text-rose-400 animate-pulse shrink-0" />
          <span className="truncate max-w-[100px]">{firstStreamer?.displayName}</span>
          <span className="text-white/40 text-[9px] shrink-0">LIVE</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
