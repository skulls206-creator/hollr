import { useState } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useWebRTC } from '@/hooks/use-webrtc';
import { useAuth } from '@workspace/replit-auth-web';
import { Mic, MicOff, Headphones, VolumeX, MonitorUp, PhoneOff, Monitor, AppWindow, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { cn, getInitials } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function VoiceOverlay() {
  const { user } = useAuth();
  const {
    voiceConnection, setVoiceConnection, voiceChannelUsers,
    micMuted, deafened, toggleMicMuted, toggleDeafened,
  } = useAppStore();
  const {
    localStream, remoteStreams, volumes,
    setParticipantVolume, startScreenShare, stopScreenShare, screenStream,
  } = useWebRTC(voiceConnection.channelId);

  const [showVolumeFor, setShowVolumeFor] = useState<string | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  const channelUsers = voiceConnection.channelId
    ? (voiceChannelUsers[voiceConnection.channelId] ?? [])
    : [];

  const myUserId = user?.id;
  const localUserData = channelUsers.find(u => u.userId === myUserId);
  const remoteUsers = channelUsers.filter(u => u.userId !== myUserId);

  if (voiceConnection.status === 'disconnected') return null;

  const handleToggleDeafen = () => {
    if (!deafened && !micMuted) toggleMicMuted();
    toggleDeafened();
  };

  const disconnect = () => {
    setVoiceConnection({ status: 'disconnected', channelId: null, serverId: null });
  };

  const handleShare = (surface: 'monitor' | 'window' | 'browser') => {
    setShareMenuOpen(false);
    startScreenShare(surface);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="absolute bottom-20 left-[320px] right-8 bg-[#000000]/90 backdrop-blur-md rounded-2xl border border-border/50 shadow-2xl z-50 flex flex-col overflow-hidden"
        style={{ minHeight: '280px' }}
      >
        {screenStream && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/50 text-emerald-400 py-1.5 px-4 text-center text-sm font-semibold flex items-center justify-center gap-2">
            <MonitorUp size={16} />
            You are currently sharing your screen.
            <button onClick={stopScreenShare} className="ml-4 underline text-white hover:text-emerald-200">Stop</button>
          </div>
        )}

        <div className="flex-1 p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 auto-rows-fr">
          <LocalUserTile
            isMuted={micMuted}
            isDeafened={deafened}
            speaking={localUserData?.speaking ?? false}
            displayName={localUserData?.displayName}
            avatarUrl={localUserData?.avatarUrl ?? null}
          />

          {remoteUsers.map(u => {
            const stream = remoteStreams[u.userId];
            return (
              <RemoteUserTile
                key={u.userId}
                peerId={u.userId}
                displayName={u.displayName}
                avatarUrl={u.avatarUrl}
                muted={u.muted}
                speaking={u.speaking}
                stream={stream ?? null}
                volume={volumes[u.userId] ?? 1}
                showVolume={showVolumeFor === u.userId}
                onToggleVolume={() => setShowVolumeFor(showVolumeFor === u.userId ? null : u.userId)}
                onVolumeChange={(v) => setParticipantVolume(u.userId, v)}
              />
            );
          })}
        </div>

        <div className="h-16 bg-[#1E1F22] border-t border-border/20 flex items-center justify-center gap-3 px-6 shrink-0">
          <button
            onClick={toggleMicMuted}
            title={micMuted ? 'Unmute' : 'Mute'}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              micMuted ? "bg-destructive text-white hover:bg-destructive/90" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
            )}
          >
            {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          <button
            onClick={handleToggleDeafen}
            title={deafened ? 'Undeafen' : 'Deafen'}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              deafened ? "bg-destructive text-white hover:bg-destructive/90" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
            )}
          >
            {deafened ? <VolumeX size={22} /> : <Headphones size={22} />}
          </button>

          {screenStream ? (
            <button
              onClick={stopScreenShare}
              title="Stop sharing"
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <MonitorUp size={22} />
            </button>
          ) : (
            <Popover open={shareMenuOpen} onOpenChange={setShareMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  title="Share Screen"
                  className="h-12 px-3 rounded-full flex items-center gap-1.5 transition-colors bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
                >
                  <MonitorUp size={20} />
                  <ChevronDown size={14} className="opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-52 p-1.5 bg-[#111214] border-border/50" sideOffset={8}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1 pb-1.5">Share Your Screen</p>
                <button
                  onClick={() => handleShare('monitor')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-white/10 transition-colors"
                >
                  <Monitor size={16} className="text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">Entire Screen</div>
                    <div className="text-[11px] text-muted-foreground">Share your full desktop</div>
                  </div>
                </button>
                <button
                  onClick={() => handleShare('window')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-white/10 transition-colors"
                >
                  <AppWindow size={16} className="text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">Application Window</div>
                    <div className="text-[11px] text-muted-foreground">Share a specific app</div>
                  </div>
                </button>
                <button
                  onClick={() => handleShare('browser')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-white/10 transition-colors"
                >
                  <MonitorUp size={16} className="text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">Browser Tab</div>
                    <div className="text-[11px] text-muted-foreground">Share a tab with audio</div>
                  </div>
                </button>
              </PopoverContent>
            </Popover>
          )}

          <div className="w-[1px] h-8 bg-border/50 mx-1" />

          <button
            onClick={disconnect}
            title="Leave voice"
            className="w-16 h-12 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 transition-colors text-white shadow-lg shadow-destructive/20"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function SpeakingRing({ speaking, children }: { speaking: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(
      'rounded-full transition-all duration-150',
      speaking
        ? 'ring-[3px] ring-emerald-400 shadow-[0_0_12px_3px_rgba(52,211,153,0.5)]'
        : 'ring-[3px] ring-transparent'
    )}>
      {children}
    </div>
  );
}

function LocalUserTile({
  isMuted, isDeafened, speaking, displayName, avatarUrl,
}: {
  isMuted: boolean; isDeafened: boolean; speaking: boolean;
  displayName?: string; avatarUrl: string | null;
}) {
  const label = displayName ?? 'You';
  return (
    <div className={cn(
      "relative bg-[#1E1F22] rounded-xl flex items-center justify-center overflow-hidden border transition-colors",
      isMuted ? "border-destructive/40" : speaking ? "border-emerald-500/60" : "border-border/20"
    )}>
      <SpeakingRing speaking={speaking}>
        <Avatar className="h-20 w-20 shadow-xl">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback className="bg-indigo-600 text-white text-2xl">
            {getInitials(label)}
          </AvatarFallback>
        </Avatar>
      </SpeakingRing>
      <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm flex items-center gap-1">
        {isMuted && <MicOff size={12} className="text-destructive" />}
        <span className="truncate max-w-[90px]">{label} (You)</span>
      </div>
      {isDeafened && (
        <div className="absolute top-3 right-3 bg-destructive/90 p-1.5 rounded-full">
          <VolumeX size={16} className="text-white" />
        </div>
      )}
    </div>
  );
}

function RemoteUserTile({
  displayName, avatarUrl, muted, speaking, stream, volume, showVolume, onToggleVolume, onVolumeChange,
}: {
  peerId: string;
  displayName: string;
  avatarUrl: string | null;
  muted: boolean;
  speaking: boolean;
  stream: MediaStream | null;
  volume: number;
  showVolume: boolean;
  onToggleVolume: () => void;
  onVolumeChange: (v: number) => void;
}) {
  return (
    <div className={cn(
      "relative bg-[#1E1F22] rounded-xl flex items-center justify-center overflow-hidden border group transition-colors",
      speaking ? "border-emerald-500/60" : "border-border/20"
    )}>
      {stream && (
        <audio autoPlay muted ref={(el) => { if (el) el.srcObject = stream; }} />
      )}

      <button
        onClick={onToggleVolume}
        className="absolute inset-0 w-full h-full flex flex-col items-center justify-center hover:bg-black/20 transition-colors z-10"
      >
        <SpeakingRing speaking={speaking}>
          <Avatar className="h-20 w-20 shadow-xl border-2 border-transparent group-hover:border-primary/50 transition-colors">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="bg-slate-700 text-white text-2xl">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
        </SpeakingRing>
      </button>

      <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm z-20 pointer-events-none flex items-center gap-1">
        {muted && <MicOff size={11} className="text-destructive shrink-0" />}
        <span className="truncate max-w-[90px]">{displayName}</span>
      </div>

      <AnimatePresence>
        {showVolume && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-x-4 bottom-12 bg-[#2B2D31] p-4 rounded-lg shadow-xl border border-border/50 z-30 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1">
              <span>Volume</span>
              <span>{Math.round(volume * 100)}%</span>
            </div>
            <Slider
              value={[volume]}
              max={2}
              step={0.05}
              onValueChange={(val) => onVolumeChange(val[0])}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
