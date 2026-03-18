import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useWebRTC } from '@/hooks/use-webrtc';
import { Mic, MicOff, Headphones, VolumeX, MonitorUp, PhoneOff } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { cn, getInitials } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function VoiceOverlay() {
  const { voiceConnection, setVoiceConnection } = useAppStore();
  const {
    localStream, remoteStreams, volumes, setParticipantVolume,
    toggleMute, startScreenShare, stopScreenShare, screenStream
  } = useWebRTC(voiceConnection.channelId);

  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [showVolumeFor, setShowVolumeFor] = useState<string | null>(null);

  // Apply deafen: set all incoming gain nodes to 0 (or restore)
  useEffect(() => {
    Object.keys(remoteStreams).forEach(peerId => {
      const current = volumes[peerId] ?? 1;
      setParticipantVolume(peerId, isDeafened ? 0 : current === 0 ? 1 : current);
    });
  }, [isDeafened]);

  if (voiceConnection.status === 'disconnected') return null;

  const handleToggleMute = () => {
    toggleMute();
    setIsMuted(prev => !prev);
  };

  const handleToggleDeafen = () => {
    setIsDeafened(prev => {
      const next = !prev;
      // Also mute mic when deafening (Discord-like behavior)
      if (next && !isMuted) {
        toggleMute();
        setIsMuted(true);
      }
      return next;
    });
  };

  const disconnect = () => {
    setVoiceConnection({ status: 'disconnected', channelId: null, serverId: null });
  };

  const handleScreenShare = () => {
    if (screenStream) stopScreenShare();
    else startScreenShare();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="absolute bottom-20 left-[320px] right-8 bg-[#000000]/90 backdrop-blur-md rounded-2xl border border-border/50 shadow-2xl z-50 flex flex-col overflow-hidden"
        style={{ minHeight: '300px' }}
      >
        {/* Screen share banner */}
        {screenStream && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/50 text-emerald-400 py-1.5 px-4 text-center text-sm font-semibold flex items-center justify-center gap-2">
            <MonitorUp size={16} />
            You are currently sharing your screen.
            <button onClick={stopScreenShare} className="ml-4 underline text-white hover:text-emerald-200">Stop</button>
          </div>
        )}

        {/* Participant grid */}
        <div className="flex-1 p-4 grid grid-cols-2 gap-4 auto-rows-fr">

          {/* Local user tile */}
          <div className={cn(
            "relative bg-[#1E1F22] rounded-xl flex items-center justify-center overflow-hidden border transition-colors",
            isMuted ? "border-destructive/40" : "border-border/20"
          )}>
            <Avatar className="h-20 w-20 shadow-xl">
              <AvatarFallback className="bg-indigo-600 text-white text-2xl">ME</AvatarFallback>
            </Avatar>
            <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm flex items-center gap-1">
              {isMuted && <MicOff size={12} className="text-destructive" />}
              You
            </div>
            {isDeafened && (
              <div className="absolute top-3 right-3 bg-destructive/90 p-1.5 rounded-full">
                <VolumeX size={16} className="text-white" />
              </div>
            )}
          </div>

          {/* Remote user tiles */}
          {Object.keys(remoteStreams).map(peerId => (
            <div key={peerId} className="relative bg-[#1E1F22] rounded-xl flex items-center justify-center overflow-hidden border border-border/20 group">
              <audio autoPlay muted ref={(el) => { if (el) el.srcObject = remoteStreams[peerId]; }} />

              <button
                onClick={() => setShowVolumeFor(showVolumeFor === peerId ? null : peerId)}
                className="absolute inset-0 w-full h-full flex flex-col items-center justify-center hover:bg-black/20 transition-colors z-10"
              >
                <Avatar className="h-20 w-20 shadow-xl border-2 border-transparent group-hover:border-primary/50 transition-colors">
                  <AvatarFallback className="bg-slate-700 text-white text-2xl">{getInitials(peerId)}</AvatarFallback>
                </Avatar>
              </button>

              <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm z-20 pointer-events-none">
                {peerId.substring(0, 8)}…
              </div>

              <AnimatePresence>
                {showVolumeFor === peerId && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute inset-x-4 bottom-12 bg-[#2B2D31] p-4 rounded-lg shadow-xl border border-border/50 z-30 flex flex-col gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1">
                      <span>User Volume</span>
                      <span>{Math.round((volumes[peerId] ?? 1) * 100)}%</span>
                    </div>
                    <Slider
                      value={[volumes[peerId] ?? 1]}
                      max={2}
                      step={0.05}
                      onValueChange={(val) => setParticipantVolume(peerId, val[0])}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="h-16 bg-[#1E1F22] border-t border-border/20 flex items-center justify-center gap-3 px-6 shrink-0">
          {/* Mic */}
          <button
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              isMuted ? "bg-destructive text-white hover:bg-destructive/90" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
            )}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          {/* Deafen */}
          <button
            onClick={handleToggleDeafen}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              isDeafened ? "bg-destructive text-white hover:bg-destructive/90" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
            )}
          >
            {isDeafened ? <VolumeX size={22} /> : <Headphones size={22} />}
          </button>

          {/* Screen share */}
          <button
            onClick={handleScreenShare}
            title={screenStream ? 'Stop sharing' : 'Share screen'}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              screenStream ? "bg-emerald-500 text-white" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
            )}
          >
            <MonitorUp size={22} />
          </button>

          <div className="w-[1px] h-8 bg-border/50 mx-1" />

          {/* Disconnect */}
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
