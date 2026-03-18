import { useState } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useWebRTC } from '@/hooks/use-webrtc';
import { Mic, MicOff, Headphones, MonitorUp, PhoneOff, Settings, User } from 'lucide-react';
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
  const [showVolumeFor, setShowVolumeFor] = useState<string | null>(null);

  if (voiceConnection.status === 'disconnected') return null;

  const handleToggleMute = () => {
    toggleMute();
    setIsMuted(!isMuted);
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
        {/* Top Banner for Screen Share */}
        {screenStream && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/50 text-emerald-400 py-1.5 px-4 text-center text-sm font-semibold flex items-center justify-center gap-2">
            <MonitorUp size={16} />
            You are currently sharing your screen.
            <button onClick={stopScreenShare} className="ml-4 underline text-white hover:text-emerald-200">Stop</button>
          </div>
        )}

        {/* Video / Grid Area */}
        <div className="flex-1 p-4 grid grid-cols-auto-fit min-[300px]:grid-cols-2 gap-4 auto-rows-fr">
          
          {/* Local User */}
          <div className="relative bg-[#1E1F22] rounded-xl flex items-center justify-center overflow-hidden border border-border/20 group">
            <Avatar className="h-20 w-20 shadow-xl">
              <AvatarFallback className="bg-indigo-600 text-white text-2xl">ME</AvatarFallback>
            </Avatar>
            <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm flex items-center gap-1">
              {isMuted && <MicOff size={12} className="text-destructive" />}
              You
            </div>
            {isMuted && (
              <div className="absolute top-3 right-3 bg-destructive/90 p-1.5 rounded-full">
                <MicOff size={16} className="text-white" />
              </div>
            )}
          </div>

          {/* Remote Users */}
          {Object.keys(remoteStreams).map(peerId => (
            <div key={peerId} className="relative bg-[#1E1F22] rounded-xl flex items-center justify-center overflow-hidden border border-border/20 group">
              
              {/* Invisible audio element to play the stream - muted because GainNode handles it */}
              <audio 
                autoPlay 
                muted // IMPORTANT: Web Audio API handles playback
                ref={(el) => { if (el) el.srcObject = remoteStreams[peerId] }} 
              />
              
              <button 
                onClick={() => setShowVolumeFor(showVolumeFor === peerId ? null : peerId)}
                className="absolute inset-0 w-full h-full flex flex-col items-center justify-center hover:bg-black/20 transition-colors z-10"
              >
                <Avatar className="h-20 w-20 shadow-xl border-2 border-transparent group-hover:border-primary/50 transition-colors">
                  <AvatarFallback className="bg-slate-700 text-white text-2xl">{getInitials(peerId)}</AvatarFallback>
                </Avatar>
              </button>
              
              <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm z-20 pointer-events-none">
                {peerId.substring(0, 8)}...
              </div>

              {/* Volume Popover overlay */}
              <AnimatePresence>
                {showVolumeFor === peerId && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute inset-x-4 bottom-12 bg-[#2B2D31] p-4 rounded-lg shadow-xl border border-border/50 z-30 flex flex-col gap-2"
                  >
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1">
                      <span>User Volume</span>
                      <span>{Math.round((volumes[peerId] ?? 1) * 100)}%</span>
                    </div>
                    <Slider 
                      defaultValue={[volumes[peerId] ?? 1]} 
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

        {/* Controls Bar */}
        <div className="h-16 bg-[#1E1F22] border-t border-border/20 flex items-center justify-center gap-4 px-6 shrink-0">
          <button onClick={handleToggleMute} className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors hover-elevate", isMuted ? "bg-white text-black" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]")}>
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          
          <button className="w-12 h-12 rounded-full bg-[#2B2D31] flex items-center justify-center hover:bg-[#383A40] transition-colors text-foreground hover-elevate">
            <Headphones size={22} />
          </button>

          <button onClick={handleScreenShare} className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors hover-elevate", screenStream ? "bg-emerald-500 text-white" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]")}>
            <MonitorUp size={22} />
          </button>
          
          <div className="w-[1px] h-8 bg-border/50 mx-2" />

          <button onClick={disconnect} className="w-16 h-12 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 transition-colors text-white hover-elevate shadow-lg shadow-destructive/20">
            <PhoneOff size={24} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
