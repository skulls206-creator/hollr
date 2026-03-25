import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useVideoCall, registerVideoCallStarter } from '@/hooks/use-video-call';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import {
  Mic, MicOff, Video, VideoOff, RotateCcw, PhoneOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Callback-ref pattern: fires both on stream change AND on element mount/unmount.
// This prevents the race where the stream arrives before the element is in the DOM.
function useVideoCallbackRef(stream: MediaStream | null, muted: boolean) {
  const streamRef = useRef(stream);
  streamRef.current = stream;
  const elRef = useRef<HTMLVideoElement | null>(null);

  const attachStream = useCallback((el: HTMLVideoElement | null) => {
    elRef.current = el;
    if (!el) return;
    if (streamRef.current) {
      el.srcObject = streamRef.current;
      el.muted = muted;
      el.play().catch(() => {});
    }
  }, [muted]);

  // When stream changes, update the already-mounted element (if any)
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      el.muted = muted;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream, muted]);

  return attachStream;
}

function CallTimer({ startedAt }: { startedAt: number | null }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setSecs(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return <span className="text-xs text-emerald-400 font-medium tabular-nums">{m}:{s}</span>;
}

export function VideoCallOverlay() {
  const videoCall = useAppStore(s => s.videoCall);
  const {
    localStream, remoteStream,
    isMicMuted, isVideoEnabled, facingMode,
    startCall, acceptCall, declineCall, endCall,
    toggleMic, toggleVideo, flipCamera,
  } = useVideoCall();

  const localRef = useVideoCallbackRef(localStream, true);
  const remoteRef = useVideoCallbackRef(remoteStream, false);

  const { state, targetUserId, targetDisplayName, targetAvatarUrl, startedAt } = videoCall;

  // Register startCall globally so DmChatArea can trigger it without mounting the hook
  useEffect(() => {
    registerVideoCallStarter(startCall);
    return () => registerVideoCallStarter(null);
  }, [startCall]);

  const [pipSwapped, setPipSwapped] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = () => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (state === 'connected') {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    }
  };

  useEffect(() => {
    if (state === 'connected') {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
    } else {
      setControlsVisible(true);
    }
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [state]);

  if (state === 'idle') return null;

  const displayName = targetDisplayName ?? 'Unknown';

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      onClick={showControls}
    >
      {/* ── Remote video (full screen) ── */}
      {state === 'connected' && (
        <div className={cn('absolute inset-0', pipSwapped && 'hidden')}>
          {remoteStream ? (
            <video
              ref={remoteRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
              <Avatar className="h-24 w-24 ring-4 ring-white/10">
                <AvatarImage src={targetAvatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary text-white text-3xl">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
      )}

      {/* ── Background when not connected ── */}
      {state !== 'connected' && (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 via-zinc-800 to-zinc-950">
          {targetAvatarUrl && (
            <img
              src={targetAvatarUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-10 blur-xl scale-110"
            />
          )}
        </div>
      )}

      {/* ── Top bar ── */}
      <div
        className={cn(
          'relative z-10 flex flex-col items-center pt-safe pt-12 pb-4 transition-opacity duration-300',
          state === 'connected' && !controlsVisible && 'opacity-0 pointer-events-none',
        )}
      >
        <Avatar className="h-16 w-16 ring-2 ring-white/20 mb-3">
          <AvatarImage src={targetAvatarUrl ?? undefined} />
          <AvatarFallback className="bg-primary text-white text-xl">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <p className="text-white font-semibold text-lg">{displayName}</p>
        {state === 'outgoing_ringing' && (
          <p className="text-zinc-400 text-sm mt-1 animate-pulse">Calling…</p>
        )}
        {state === 'incoming_ringing' && (
          <p className="text-zinc-400 text-sm mt-1">Incoming Video Call</p>
        )}
        {state === 'connected' && (
          <div className="flex items-center gap-2 mt-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <CallTimer startedAt={startedAt} />
          </div>
        )}
      </div>

      {/* ── Self-view (PiP) — shown during all states ── */}
      {localStream && (
        <div
          className={cn(
            'absolute z-20 rounded-2xl overflow-hidden shadow-2xl border border-white/10 cursor-pointer',
            state === 'connected'
              ? pipSwapped
                ? 'inset-0 w-full h-full rounded-none'
                : 'top-20 right-4 w-28 h-40'
              : 'bottom-40 left-1/2 -translate-x-1/2 w-48 h-64 rounded-3xl',
          )}
          onClick={(e) => { if (state === 'connected') { e.stopPropagation(); setPipSwapped(p => !p); } }}
        >
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className={cn(
              'w-full h-full object-cover',
              facingMode === 'user' && '-scale-x-100',
            )}
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
              <VideoOff size={24} className="text-zinc-500" />
            </div>
          )}
        </div>
      )}

      {/* ── Outgoing ringing bottom ── */}
      {state === 'outgoing_ringing' && (
        <div className="relative z-10 mt-auto pb-safe pb-16 flex flex-col items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); if (targetUserId) declineCall(targetUserId); }}
            className="flex flex-col items-center gap-2"
          >
            <span
              className="flex items-center justify-center rounded-full bg-red-500 shadow-lg active:scale-95 transition-transform"
              style={{ width: 72, height: 72 }}
            >
              <PhoneOff size={28} className="text-white" />
            </span>
            <span className="text-xs text-zinc-400 font-medium">Cancel</span>
          </button>
        </div>
      )}

      {/* ── Incoming ringing bottom ── */}
      {state === 'incoming_ringing' && (
        <div className="relative z-10 mt-auto pb-safe pb-16 flex justify-center gap-20">
          <button
            onClick={(e) => { e.stopPropagation(); if (targetUserId) declineCall(targetUserId); }}
            className="flex flex-col items-center gap-2"
          >
            <span
              className="flex items-center justify-center rounded-full bg-red-500 shadow-lg active:scale-95 transition-transform"
              style={{ width: 72, height: 72 }}
            >
              <PhoneOff size={28} className="text-white" />
            </span>
            <span className="text-xs text-zinc-400 font-medium">Decline</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (targetUserId) acceptCall(targetUserId); }}
            className="flex flex-col items-center gap-2"
          >
            <span
              className="flex items-center justify-center rounded-full bg-emerald-500 shadow-lg active:scale-95 transition-transform"
              style={{ width: 72, height: 72 }}
            >
              <Video size={28} className="text-white" />
            </span>
            <span className="text-xs text-zinc-400 font-medium">Accept</span>
          </button>
        </div>
      )}

      {/* ── Connected call controls ── */}
      {state === 'connected' && (
        <div
          className={cn(
            'relative z-20 mt-auto pb-safe transition-opacity duration-300',
            !controlsVisible && 'opacity-0 pointer-events-none',
          )}
        >
          <div className="mx-4 mb-10 rounded-3xl bg-black/60 backdrop-blur-xl border border-white/10 px-6 py-5">
            <div className="flex justify-between items-center">
              {/* Mute mic */}
              <ControlButton
                icon={isMicMuted ? <MicOff size={22} /> : <Mic size={22} />}
                label={isMicMuted ? 'Unmute' : 'Mute'}
                active={isMicMuted}
                onClick={(e) => { e.stopPropagation(); toggleMic(); }}
              />
              {/* Toggle camera */}
              <ControlButton
                icon={isVideoEnabled ? <Video size={22} /> : <VideoOff size={22} />}
                label={isVideoEnabled ? 'Camera' : 'No Cam'}
                active={!isVideoEnabled}
                onClick={(e) => { e.stopPropagation(); toggleVideo(); }}
              />
              {/* Flip camera */}
              <ControlButton
                icon={<RotateCcw size={22} />}
                label="Flip"
                onClick={(e) => { e.stopPropagation(); flipCamera(); }}
              />
              {/* End call */}
              <ControlButton
                icon={<PhoneOff size={22} />}
                label="End"
                danger
                onClick={(e) => { e.stopPropagation(); endCall(); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ControlButton({
  icon, label, active, danger, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span
        className={cn(
          'flex items-center justify-center rounded-full transition-all active:scale-90',
          danger
            ? 'bg-red-500 text-white w-14 h-14'
            : active
            ? 'bg-white text-zinc-900 w-12 h-12'
            : 'bg-white/20 text-white w-12 h-12',
        )}
      >
        {icon}
      </span>
      <span className="text-[10px] text-zinc-300 font-medium">{label}</span>
    </button>
  );
}
