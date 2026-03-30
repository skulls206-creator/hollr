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

/**
 * Floating screenshare mini-preview widget.
 * Mount this inside a `position: relative` chat container. The widget
 * defaults to `absolute bottom-20 right-4` (above the composer pill) and can
 * be freely dragged within the parent container's bounds.
 */
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

  // First remote participant who is streaming (not the local user)
  const firstStreamer = channelUsers.find(
    u => u.streaming && u.userId !== user?.id
  ) ?? null;

  // Per-session dismiss — resets when the streamer changes
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

  // Attach MediaStream to <video> element
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = videoStream ?? null;
  }, [videoStream]);

  // ── Draggable position ─────────────────────────────────────────────────────
  // `pos` is null → use CSS default (bottom/right). Once the user drags, we
  // capture the element's position relative to its offsetParent (the chat
  // container) and track it as { left, top } from that moment on.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);

  const dragState = useRef<{
    startMx: number;
    startMy: number;
    startLeft: number;
    startTop: number;
    containerW: number;
    containerH: number;
  } | null>(null);

  const beginDrag = useCallback((clientX: number, clientY: number) => {
    const el = widgetRef.current;
    const container = el?.parentElement;
    if (!el || !container) return;

    // Convert element's viewport rect to container-relative coordinates
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relLeft = elRect.left - containerRect.left + container.scrollLeft;
    const relTop = elRect.top - containerRect.top + container.scrollTop;

    dragState.current = {
      startMx: clientX,
      startMy: clientY,
      startLeft: relLeft,
      startTop: relTop,
      containerW: containerRect.width,
      containerH: containerRect.height,
    };
  }, []);

  const applyDrag = useCallback((clientX: number, clientY: number) => {
    const d = dragState.current;
    if (!d) return;
    const dx = clientX - d.startMx;
    const dy = clientY - d.startMy;
    const maxLeft = d.containerW - WIDGET_W - MARGIN;
    const maxTop = d.containerH - WIDGET_H - MARGIN;
    setPos({
      left: Math.max(MARGIN, Math.min(maxLeft, d.startLeft + dx)),
      top: Math.max(MARGIN, Math.min(maxTop, d.startTop + dy)),
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    beginDrag(e.clientX, e.clientY);

    const onMove = (mv: MouseEvent) => applyDrag(mv.clientX, mv.clientY);
    const onUp = () => {
      dragState.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [beginDrag, applyDrag]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const touch = e.touches[0];
    if (!touch) return;
    beginDrag(touch.clientX, touch.clientY);

    const onMove = (mv: TouchEvent) => {
      const t = mv.touches[0];
      if (t) applyDrag(t.clientX, t.clientY);
    };
    const onEnd = () => {
      dragState.current = null;
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
  }, [beginDrag, applyDrag]);

  const show = !!(
    firstStreamer &&
    !dismissed &&
    voiceConnection.status !== 'disconnected'
  );

  // CSS position: default anchors to bottom-right; after drag uses left/top
  const posStyle: React.CSSProperties = pos
    ? { position: 'absolute', left: pos.left, top: pos.top }
    : { position: 'absolute', bottom: 80, right: MARGIN };

  // Pill position mirrors widget: when dragged, offset below widget; otherwise bottom-right
  const pillStyle: React.CSSProperties = pos
    ? { position: 'absolute', left: pos.left, top: pos.top }
    : { position: 'absolute', bottom: 80, right: MARGIN };

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
          style={{ ...posStyle, width: WIDGET_W, zIndex: 55 }}
          className="rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-black cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {/* Video / connecting shimmer area */}
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
              <button
                onClick={() => {
                  if (firstStreamer) setPendingTheaterUserId(firstStreamer.userId);
                }}
                title="Watch full screen"
                className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur flex items-center justify-center text-white transition-colors"
              >
                <Maximize2 size={11} />
              </button>

              <button
                onClick={() => setMinimized(true)}
                title="Minimize"
                className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/80 backdrop-blur flex items-center justify-center text-white transition-colors"
              >
                <Minimize2 size={11} />
              </button>

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
          style={{ ...pillStyle, zIndex: 55 }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full',
            'bg-black/80 border border-white/10 backdrop-blur-sm shadow-xl',
            'text-white text-[11px] font-medium',
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
