import { useEffect, useRef, useState } from 'react';
import {
  Phone, PhoneOff, PhoneMissed, Mic, MicOff, Volume2, VolumeX,
  Minimize2, Check, X, ShieldAlert,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppStore } from '@/store/use-app-store';
import { useAuth } from '@workspace/replit-auth-web';
import { getInitials, cn } from '@/lib/utils';
import { sendDmCallSignal } from '@/hooks/use-realtime';
import { stopCallRinging } from '@/lib/notification-sound';

const CALL_TIMEOUT_MS = 30_000;

export function DmCallOverlay() {
  const {
    dmCall,
    setDmCallState,
    endDmCall,
    approveCallsFrom,
    revokeCallsFrom,
  } = useAppStore();

  const { user } = useAuth();
  const micMuted = useAppStore((s) => s.micMuted);
  const toggleMicMuted = useAppStore((s) => s.toggleMicMuted);

  const [speakerOn, setSpeakerOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start/stop call timer
  useEffect(() => {
    if (dmCall.state === 'connected' && dmCall.startedAt) {
      setElapsed(Math.floor((Date.now() - dmCall.startedAt) / 1000));
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - dmCall.startedAt!) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [dmCall.state, dmCall.startedAt]);

  // Auto-cancel outgoing call after 30 seconds (no answer)
  useEffect(() => {
    if (dmCall.state === 'outgoing_ringing') {
      timeoutRef.current = setTimeout(() => {
        sendDmCallSignal({ type: 'call_end', targetId: dmCall.targetUserId, callerId: user?.id });
        endDmCall();
      }, CALL_TIMEOUT_MS);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [dmCall.state]);

  // Stop ringing when call leaves incoming states
  useEffect(() => {
    if (dmCall.state !== 'incoming_ringing' && dmCall.state !== 'incoming_request') {
      stopCallRinging();
    }
  }, [dmCall.state]);

  if (dmCall.state === 'idle') return null;

  const { state, targetUserId, targetDisplayName, targetAvatarUrl, dmThreadId, minimized } = dmCall;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleEnd = () => {
    sendDmCallSignal({
      type: 'call_end',
      targetId: targetUserId,
      callerId: user?.id,
    });
    endDmCall();
  };

  const handleAccept = () => {
    sendDmCallSignal({
      type: 'call_accept',
      targetId: targetUserId,
      callerId: user?.id,
    });
    setDmCallState({ state: 'connected', startedAt: Date.now() });
  };

  const handleDecline = () => {
    sendDmCallSignal({
      type: 'call_decline',
      targetId: targetUserId,
      callerId: user?.id,
    });
    endDmCall();
  };

  const handleAllowAndAccept = () => {
    if (targetUserId) approveCallsFrom(targetUserId);
    handleAccept();
  };

  const handleDenyRequest = () => {
    sendDmCallSignal({
      type: 'call_decline',
      targetId: targetUserId,
      callerId: user?.id,
    });
    endDmCall();
  };

  const handleBlockRequest = () => {
    if (targetUserId) revokeCallsFrom(targetUserId);
    sendDmCallSignal({
      type: 'call_decline',
      targetId: targetUserId,
      callerId: user?.id,
    });
    endDmCall();
  };

  // ── Minimized: compact call bar (rendered in DmChatArea header area) ──
  if (minimized && state === 'connected') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9000] flex items-center gap-3 px-4 py-2 bg-emerald-600/95 backdrop-blur-md shadow-lg">
        <div className="relative shrink-0">
          <Avatar className="h-7 w-7">
            <AvatarImage src={targetAvatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-white text-xs">
              {getInitials(targetDisplayName ?? '')}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-300 border-2 border-emerald-600 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold truncate">{targetDisplayName}</p>
          <p className="text-emerald-200 text-[10px] font-mono">{formatTime(elapsed)}</p>
        </div>
        <button
          onClick={() => setDmCallState({ minimized: false })}
          className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          title="Expand call"
        >
          <Phone size={14} />
        </button>
        <button
          onClick={toggleMicMuted}
          className={cn('p-1.5 rounded-lg transition-colors shrink-0', micMuted ? 'text-red-300 bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/10')}
          title={micMuted ? 'Unmute' : 'Mute'}
        >
          {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button
          onClick={handleEnd}
          className="p-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors shrink-0"
          title="End call"
        >
          <PhoneOff size={14} />
        </button>
      </div>
    );
  }

  // ── Full-screen overlay ──
  return (
    <div
      className={cn(
        'fixed inset-0 z-[9000] flex flex-col items-center justify-between',
        'bg-gradient-to-b from-surface-0 via-surface-0/95 to-black/80',
        'pb-safe'
      )}
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
    >
      {/* Top bar */}
      <div className="w-full flex items-center justify-between px-6 pt-14 shrink-0">
        <div className="text-center w-full">
          {state === 'outgoing_ringing' && (
            <p className="text-muted-foreground text-sm font-medium animate-pulse">Calling…</p>
          )}
          {state === 'incoming_ringing' && (
            <p className="text-emerald-400 text-sm font-semibold tracking-wide uppercase">Incoming Call</p>
          )}
          {state === 'incoming_request' && (
            <p className="text-yellow-400 text-sm font-semibold tracking-wide uppercase flex items-center justify-center gap-1.5">
              <ShieldAlert size={14} /> Call Request
            </p>
          )}
          {state === 'connected' && (
            <p className="text-emerald-400 text-sm font-semibold tracking-wide">
              {formatTime(elapsed)}
            </p>
          )}
        </div>

        {/* Minimize (only in connected state) */}
        {state === 'connected' && (
          <button
            onClick={() => setDmCallState({ minimized: true })}
            className="absolute top-14 right-6 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title="Minimize"
          >
            <Minimize2 size={18} />
          </button>
        )}
      </div>

      {/* Center: avatar + name */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        {/* Animated ring for ringing states */}
        <div className="relative flex items-center justify-center">
          {(state === 'outgoing_ringing' || state === 'incoming_ringing') && (
            <>
              <span className="absolute h-44 w-44 rounded-full bg-primary/10 animate-[ping_1.5s_ease-in-out_infinite]" />
              <span className="absolute h-36 w-36 rounded-full bg-primary/15 animate-[ping_1.5s_ease-in-out_0.3s_infinite]" />
            </>
          )}
          <Avatar className="h-28 w-28 ring-4 ring-surface-1 shadow-2xl">
            <AvatarImage src={targetAvatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-white text-3xl font-bold">
              {getInitials(targetDisplayName ?? '')}
            </AvatarFallback>
          </Avatar>
          {state === 'connected' && (
            <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 border-2 border-surface-0 shadow-md" />
          )}
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">{targetDisplayName}</h2>
          {state === 'incoming_request' && (
            <p className="mt-2 text-sm text-muted-foreground max-w-xs">
              This person wants to call you. Allow them?
            </p>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="w-full px-8 shrink-0">

        {/* ── Outgoing ringing ── */}
        {state === 'outgoing_ringing' && (
          <div className="flex justify-center pb-8">
            <button
              onClick={handleEnd}
              className="flex flex-col items-center gap-2"
            >
              <span className="h-18 w-18 flex items-center justify-center rounded-full bg-destructive shadow-lg active:scale-95 transition-transform" style={{ width: 72, height: 72 }}>
                <PhoneOff size={28} className="text-white" />
              </span>
              <span className="text-xs text-muted-foreground font-medium">Cancel</span>
            </button>
          </div>
        )}

        {/* ── Incoming ringing ── */}
        {state === 'incoming_ringing' && (
          <div className="flex justify-center gap-20 pb-8">
            <button onClick={handleDecline} className="flex flex-col items-center gap-2">
              <span className="flex items-center justify-center rounded-full bg-destructive shadow-lg active:scale-95 transition-transform" style={{ width: 72, height: 72 }}>
                <PhoneOff size={28} className="text-white" />
              </span>
              <span className="text-xs text-muted-foreground font-medium">Decline</span>
            </button>
            <button onClick={handleAccept} className="flex flex-col items-center gap-2">
              <span className="flex items-center justify-center rounded-full bg-emerald-500 shadow-lg active:scale-95 transition-transform" style={{ width: 72, height: 72 }}>
                <Phone size={28} className="text-white" />
              </span>
              <span className="text-xs text-muted-foreground font-medium">Accept</span>
            </button>
          </div>
        )}

        {/* ── Incoming call request (Signal-style) ── */}
        {state === 'incoming_request' && (
          <div className="flex flex-col gap-3 pb-8">
            <button
              onClick={handleAllowAndAccept}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-base transition-colors active:scale-[0.98]"
            >
              <Check size={20} /> Allow & Answer
            </button>
            <button
              onClick={handleDenyRequest}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-surface-1 hover:bg-accent text-foreground font-semibold text-base transition-colors active:scale-[0.98]"
            >
              <PhoneMissed size={20} /> Decline
            </button>
            <button
              onClick={handleBlockRequest}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-destructive/70 hover:text-destructive hover:bg-destructive/10 font-medium text-sm transition-colors"
            >
              <ShieldAlert size={16} /> Block future calls
            </button>
          </div>
        )}

        {/* ── Connected: call controls grid ── */}
        {state === 'connected' && (
          <div className="flex flex-col gap-8 pb-8">
            {/* Row 1: Mute + Speaker */}
            <div className="flex justify-center gap-12">
              <button
                onClick={toggleMicMuted}
                className="flex flex-col items-center gap-2"
              >
                <span className={cn(
                  'flex items-center justify-center rounded-full transition-all active:scale-95',
                  micMuted ? 'bg-white text-surface-0' : 'bg-white/15 text-white'
                )} style={{ width: 60, height: 60 }}>
                  {micMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </span>
                <span className="text-xs text-muted-foreground font-medium">{micMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button
                onClick={() => setSpeakerOn(!speakerOn)}
                className="flex flex-col items-center gap-2"
              >
                <span className={cn(
                  'flex items-center justify-center rounded-full transition-all active:scale-95',
                  speakerOn ? 'bg-white text-surface-0' : 'bg-white/15 text-white'
                )} style={{ width: 60, height: 60 }}>
                  {speakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
                </span>
                <span className="text-xs text-muted-foreground font-medium">Speaker</span>
              </button>
            </div>

            {/* Row 2: End call (red, big center) */}
            <div className="flex justify-center">
              <button onClick={handleEnd} className="flex flex-col items-center gap-2">
                <span className="flex items-center justify-center rounded-full bg-destructive shadow-xl active:scale-95 transition-transform" style={{ width: 72, height: 72 }}>
                  <PhoneOff size={28} className="text-white" />
                </span>
                <span className="text-xs text-muted-foreground font-medium">End</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
