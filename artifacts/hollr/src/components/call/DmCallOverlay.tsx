import { useEffect, useRef, useState } from 'react';
import {
  Phone, PhoneOff, PhoneMissed, Mic, MicOff, Volume2, VolumeX,
  Minimize2, Check, ShieldAlert,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAppStore } from '@/store/use-app-store';
import { useAuth } from '@workspace/replit-auth-web';
import { getInitials, cn } from '@/lib/utils';
import { sendDmCallSignal } from '@/hooks/use-realtime';
import { stopCallRinging } from '@/lib/notification-sound';
import { useDmCallAudio } from '@/hooks/use-dm-audio';

const CALL_TIMEOUT_MS = 30_000;

function CallTimer({ startedAt }: { startedAt: number | null }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setSecs(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return <span className="text-emerald-400 text-sm font-semibold tabular-nums">{m}:{s}</span>;
}

export function DmCallOverlay() {
  const {
    dmCall, setDmCallState, endDmCall,
    approveCallsFrom, revokeCallsFrom,
  } = useAppStore();

  const { user } = useAuth();
  const micMuted = useAppStore((s) => s.micMuted);

  const [speakerOn, setSpeakerOn] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { startCallerAudio, startCalleeAudio, toggleMic, toggleSpeaker, cleanupAudio } = useDmCallAudio();

  const { state, targetUserId, targetDisplayName, targetAvatarUrl, dmThreadId, minimized, startedAt } = dmCall;

  // Auto-cancel outgoing call after 30 s
  useEffect(() => {
    if (state === 'outgoing_ringing') {
      timeoutRef.current = setTimeout(() => {
        sendDmCallSignal({ type: 'call_end', targetId: targetUserId, callerId: user?.id });
        endDmCall();
      }, CALL_TIMEOUT_MS);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [state]);

  // Stop ringing when call leaves incoming states
  useEffect(() => {
    if (state !== 'incoming_ringing' && state !== 'incoming_request') {
      stopCallRinging();
    }
  }, [state]);

  // When CALLER receives call_accept → start caller audio
  const prevState = useRef(state);
  useEffect(() => {
    if (prevState.current !== 'connected' && state === 'connected' && targetUserId) {
      // Determine role by checking who was outgoing vs incoming
      const wasOutgoing = prevState.current === 'outgoing_ringing';
      if (wasOutgoing) {
        startCallerAudio(targetUserId);
      }
    }
    prevState.current = state;
  }, [state, targetUserId, startCallerAudio]);

  // Cleanup audio when call ends
  useEffect(() => {
    if (state === 'idle') cleanupAudio();
  }, [state, cleanupAudio]);

  if (state === 'idle') return null;

  const displayName = targetDisplayName ?? 'Unknown';

  const handleEnd = () => {
    sendDmCallSignal({ type: 'call_end', targetId: targetUserId, callerId: user?.id });
    cleanupAudio();
    endDmCall();
  };

  const handleAccept = () => {
    sendDmCallSignal({ type: 'call_accept', targetId: targetUserId, callerId: user?.id });
    setDmCallState({ state: 'connected', startedAt: Date.now() });
    if (targetUserId) startCalleeAudio(targetUserId);
  };

  const handleDecline = () => {
    sendDmCallSignal({ type: 'call_decline', targetId: targetUserId, callerId: user?.id });
    cleanupAudio();
    endDmCall();
  };

  const handleAllowAndAccept = () => {
    if (targetUserId) approveCallsFrom(targetUserId);
    handleAccept();
  };

  const handleBlockRequest = () => {
    if (targetUserId) revokeCallsFrom(targetUserId);
    sendDmCallSignal({ type: 'call_decline', targetId: targetUserId, callerId: user?.id });
    cleanupAudio();
    endDmCall();
  };

  const handleSpeakerToggle = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    toggleSpeaker(next);
  };

  // ── Minimized call bar ──────────────────────────────────────────────────
  if (minimized && state === 'connected') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9000] flex items-center gap-3 px-4 py-2 bg-emerald-600/95 backdrop-blur-md shadow-lg">
        <div className="relative shrink-0">
          <Avatar className="h-7 w-7">
            <AvatarImage src={targetAvatarUrl || undefined} />
            <AvatarFallback className="bg-emerald-800 text-white text-xs">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-300 border-2 border-emerald-600 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold truncate">{displayName}</p>
          <CallTimer startedAt={startedAt} />
        </div>
        <button
          onClick={() => setDmCallState({ minimized: false })}
          className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <Phone size={14} />
        </button>
        <button
          onClick={toggleMic}
          className={cn('p-1.5 rounded-lg transition-colors shrink-0', micMuted ? 'text-red-300 bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/10')}
        >
          {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
        <button
          onClick={handleEnd}
          className="p-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors shrink-0"
        >
          <PhoneOff size={14} />
        </button>
      </div>
    );
  }

  // ── Full-screen overlay ─────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[9000] flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0d1b2a 0%, #1a1a2e 40%, #16213e 100%)' }}
    >
      {/* Blurred avatar backdrop */}
      {targetAvatarUrl && (
        <img
          src={targetAvatarUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.07] blur-3xl scale-110 pointer-events-none select-none"
        />
      )}

      {/* Top status pill */}
      <div className="relative z-10 flex justify-center pt-14 pb-2">
        {state === 'outgoing_ringing' && (
          <span className="px-4 py-1 rounded-full bg-white/10 text-white/70 text-sm font-medium animate-pulse">
            Calling…
          </span>
        )}
        {state === 'incoming_ringing' && (
          <span className="px-4 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm font-semibold tracking-wide uppercase">
            Incoming Call
          </span>
        )}
        {state === 'incoming_request' && (
          <span className="px-4 py-1 rounded-full bg-yellow-500/20 text-yellow-300 text-sm font-semibold flex items-center gap-1.5">
            <ShieldAlert size={13} /> Call Request
          </span>
        )}
        {state === 'connected' && (
          <span className="flex items-center gap-2 px-4 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <CallTimer startedAt={startedAt} />
          </span>
        )}

        {/* Minimize button */}
        {state === 'connected' && (
          <button
            onClick={() => setDmCallState({ minimized: true })}
            className="absolute right-5 top-0 p-2 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          >
            <Minimize2 size={18} />
          </button>
        )}
      </div>

      {/* Center avatar */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-5">
        <div className="relative flex items-center justify-center">
          {(state === 'outgoing_ringing' || state === 'incoming_ringing') && (
            <>
              <span className="absolute h-52 w-52 rounded-full border border-white/10 animate-[ping_2s_ease-in-out_infinite]" />
              <span className="absolute h-40 w-40 rounded-full border border-white/15 animate-[ping_2s_ease-in-out_0.4s_infinite]" />
              <span className="absolute h-52 w-52 rounded-full bg-white/[0.03]" />
              <span className="absolute h-40 w-40 rounded-full bg-white/[0.05]" />
            </>
          )}
          {state === 'connected' && (
            <span className="absolute h-44 w-44 rounded-full bg-emerald-500/10 animate-pulse" />
          )}
          <Avatar className="h-32 w-32 ring-4 ring-white/10 shadow-2xl">
            <AvatarImage src={targetAvatarUrl || undefined} />
            <AvatarFallback
              className="text-white text-4xl font-bold"
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
            >
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          {state === 'connected' && (
            <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-400 border-2 border-[#1a1a2e] shadow" />
          )}
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white tracking-tight">{displayName}</h2>
          {state === 'incoming_request' && (
            <p className="mt-2 text-sm text-white/50 max-w-[240px]">
              This person wants to call you. Allow them?
            </p>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 w-full px-8 pb-safe" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 40px)' }}>

        {/* ── Outgoing ringing ── */}
        {state === 'outgoing_ringing' && (
          <div className="flex justify-center pb-4">
            <CallBtn icon={<PhoneOff size={26} />} label="Cancel" color="red" onClick={handleEnd} />
          </div>
        )}

        {/* ── Incoming ringing ── */}
        {state === 'incoming_ringing' && (
          <div className="flex justify-center gap-24 pb-4">
            <CallBtn icon={<PhoneOff size={26} />} label="Decline" color="red" onClick={handleDecline} />
            <CallBtn icon={<Phone size={26} />} label="Accept" color="green" onClick={handleAccept} />
          </div>
        )}

        {/* ── Incoming request ── */}
        {state === 'incoming_request' && (
          <div className="flex flex-col gap-3 pb-4">
            <button
              onClick={handleAllowAndAccept}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-base transition-colors active:scale-[0.98]"
            >
              <Check size={20} /> Allow & Answer
            </button>
            <button
              onClick={handleDecline}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-base transition-colors active:scale-[0.98]"
            >
              <PhoneMissed size={20} /> Decline
            </button>
            <button
              onClick={handleBlockRequest}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-red-400/70 hover:text-red-400 hover:bg-red-500/10 font-medium text-sm transition-colors"
            >
              <ShieldAlert size={15} /> Block future calls
            </button>
          </div>
        )}

        {/* ── Connected ── */}
        {state === 'connected' && (
          <div className="flex flex-col gap-6 pb-4">
            <div className="flex justify-center gap-10">
              <CallBtn
                icon={micMuted ? <MicOff size={22} /> : <Mic size={22} />}
                label={micMuted ? 'Unmute' : 'Mute'}
                color={micMuted ? 'active' : 'ghost'}
                onClick={toggleMic}
                size="md"
              />
              <CallBtn
                icon={speakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
                label="Speaker"
                color={speakerOn ? 'active' : 'ghost'}
                onClick={handleSpeakerToggle}
                size="md"
              />
            </div>
            <div className="flex justify-center">
              <CallBtn icon={<PhoneOff size={26} />} label="End" color="red" onClick={handleEnd} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable call button ──────────────────────────────────────────────────────
type CallBtnColor = 'red' | 'green' | 'ghost' | 'active';
function CallBtn({
  icon, label, color, onClick, size = 'lg',
}: {
  icon: React.ReactNode;
  label: string;
  color: CallBtnColor;
  onClick: () => void;
  size?: 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 72 : 60;
  const bg: Record<CallBtnColor, string> = {
    red: 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-900/40',
    green: 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-900/40',
    ghost: 'bg-white/10 hover:bg-white/20 text-white/80',
    active: 'bg-white text-gray-900',
  };
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2">
      <span
        className={cn('flex items-center justify-center rounded-full transition-all active:scale-95', bg[color])}
        style={{ width: dim, height: dim }}
      >
        {icon}
      </span>
      <span className="text-xs text-white/50 font-medium">{label}</span>
    </button>
  );
}
