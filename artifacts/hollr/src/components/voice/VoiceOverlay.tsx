import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useWebRTC } from '@/hooks/use-webrtc';
import { useAuth } from '@workspace/replit-auth-web';
import {
  Mic, MicOff, Headphones, VolumeX, MonitorUp, PhoneOff,
  Monitor, AppWindow, ChevronDown, ChevronUp, Maximize2, Minimize2, X, Radio,
  MessageSquare, AtSign, Volume2, Loader2, Wifi, Globe, Server, Video, VideoOff, Music2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { cn, getInitials } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useGetMyProfile } from '@workspace/api-client-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getListDmThreadsQueryKey } from '@workspace/api-client-react';

export function VoiceOverlay() {
  const { user } = useAuth();
  const {
    voiceConnection, setVoiceConnection, voiceChannelUsers,
    micMuted, deafened, toggleMicMuted, toggleDeafened,
    memberListOpen, mobileSidebarOpen, pinnedPanelOpen,
    voiceMinimized, setVoiceMinimized,
    setVoicePanelHeight,
    audioOutputDeviceId,
    voiceVolumes, setVoiceVolume,
  } = useAppStore();
  const { data: profile } = useGetMyProfile({ query: { enabled: !!user } });
  const {
    localStream, remoteStreams, remoteVideoStreams, cameraStream, connectionTypes,
    startScreenShare, stopScreenShare, screenStream, startCamera, stopCamera,
  } = useWebRTC(voiceConnection.channelId, { displayName: profile?.displayName, avatarUrl: profile?.avatarUrl });

  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [watchingUserId, setWatchingUserId] = useState<string | null>(null);
  const [voiceCard, setVoiceCard] = useState<{ userId: string; x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Responsive positioning: on mobile the sidebar is hidden so start from left edge;
  // on desktop start after the 320px sidebar. Right offset ignores member list on mobile.
  const panelLeft = isMobile ? 8 : 320;
  const panelRight = isMobile ? 8 : (memberListOpen ? 256 : 32);

  // Measure expanded panel height so ChatArea can add matching spacer
  useEffect(() => {
    if (voiceMinimized || voiceConnection.status === 'disconnected' || (isMobile && (mobileSidebarOpen || memberListOpen || pinnedPanelOpen))) {
      setVoicePanelHeight(0);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    const BOTTOM_OFFSET = 32; // matches bottom-8 (2rem = 32px)
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setVoicePanelHeight(entry.contentRect.height + BOTTOM_OFFSET);
      }
    });
    ro.observe(el);
    setVoicePanelHeight(el.offsetHeight + BOTTOM_OFFSET);
    return () => ro.disconnect();
  }, [voiceMinimized, voiceConnection.status, isMobile, mobileSidebarOpen, memberListOpen, pinnedPanelOpen, setVoicePanelHeight]);

  const channelUsers = voiceConnection.channelId
    ? (voiceChannelUsers[voiceConnection.channelId] ?? [])
    : [];

  const myUserId = user?.id;
  const localUserData = channelUsers.find(u => u.userId === myUserId);
  const remoteUsers = channelUsers.filter(u => u.userId !== myUserId);

  // ALL hooks must be declared before any early returns
  // Stop watching if the streaming user stops sharing
  useEffect(() => {
    if (watchingUserId && watchingUserId !== myUserId) {
      const watcher = channelUsers.find(u => u.userId === watchingUserId);
      if (watcher && !watcher.streaming && !remoteVideoStreams[watchingUserId]) {
        setWatchingUserId(null);
      }
    }
  }, [channelUsers, remoteVideoStreams, watchingUserId, myUserId]);

  if (voiceConnection.status === 'disconnected') return null;

  // Hide while any mobile overlay panel is open to avoid stacking conflicts
  if (isMobile && (mobileSidebarOpen || memberListOpen || pinnedPanelOpen)) return null;

  const handleToggleDeafen = () => {
    if (!deafened && !micMuted) toggleMicMuted();
    toggleDeafened();
  };

  const disconnect = () => {
    setWatchingUserId(null);
    setVoiceConnection({ status: 'disconnected', channelId: null, serverId: null });
  };

  const handleShare = (surface: 'monitor' | 'window' | 'browser') => {
    setShareMenuOpen(false);
    startScreenShare(surface);
  };

  // --- Minimized pill ---
  if (voiceMinimized) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="absolute bottom-28 bg-[#111214]/95 backdrop-blur-md rounded-2xl border border-border/50 shadow-2xl z-50 flex items-center gap-2 px-3 py-2"
          style={{ left: panelLeft, right: panelRight }}
        >
          <div className="flex -space-x-1.5 mr-1">
            {channelUsers.slice(0, 4).map(u => (
              <Avatar key={u.userId} className="h-6 w-6 border-2 border-[#111214]">
                <AvatarImage src={u.avatarUrl || undefined} />
                <AvatarFallback className="bg-indigo-600 text-white text-[10px]">{getInitials(u.displayName)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-xs text-muted-foreground font-medium">{channelUsers.length} in voice</span>

          <div className="w-px h-5 bg-border/50 mx-1" />

          <button
            onClick={toggleMicMuted}
            title={micMuted ? 'Unmute' : 'Mute'}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
              micMuted ? "bg-destructive/80 text-white" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
            )}
          >
            {micMuted ? <MicOff size={13} /> : <Mic size={13} />}
          </button>

          <button
            onClick={handleToggleDeafen}
            title={deafened ? 'Undeafen' : 'Deafen'}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
              deafened ? "bg-destructive/80 text-white" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
            )}
          >
            {deafened ? <VolumeX size={13} /> : <Headphones size={13} />}
          </button>

          <button
            onClick={disconnect}
            title="Leave"
            className="w-7 h-7 rounded-full flex items-center justify-center bg-destructive/80 text-white hover:bg-destructive transition-colors"
          >
            <PhoneOff size={13} />
          </button>

          <div className="w-px h-5 bg-border/50 mx-1" />

          <button
            onClick={() => setVoiceMinimized(false)}
            title="Expand"
            className="w-7 h-7 rounded-full flex items-center justify-center bg-[#2B2D31] text-foreground hover:bg-[#383A40] transition-colors"
          >
            <ChevronUp size={14} />
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  // --- Watch Stream full-screen view ---
  if (watchingUserId) {
    const isLocal = watchingUserId === myUserId;
    // For local: prefer screen share, fall back to camera
    const videoStream = isLocal
      ? (screenStream ?? cameraStream)
      : (remoteVideoStreams[watchingUserId] ?? null);
    const watchUser = isLocal
      ? localUserData
      : channelUsers.find(u => u.userId === watchingUserId);
    const watchName = watchUser?.displayName ?? 'Unknown';

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          className="absolute inset-x-0 bottom-0 top-0 bg-black/95 backdrop-blur-md z-50 flex flex-col"
          style={{ left: 0 }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-3 bg-black/60 border-b border-border/20 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-semibold text-white">
                {isLocal ? 'Your Screen Share' : `${watchName}'s Screen`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWatchingUserId(null)}
                title="Close stream"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors text-white"
              >
                <Minimize2 size={13} />
                Minimize stream
              </button>
              <button
                onClick={disconnect}
                title="Leave voice"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/80 hover:bg-destructive transition-colors text-white"
              >
                <PhoneOff size={13} />
                Leave
              </button>
            </div>
          </div>

          {/* Video area */}
          <div className="flex-1 flex items-center justify-center bg-black min-h-0">
            {videoStream ? (
              <video
                key={watchingUserId}
                autoPlay
                playsInline
                muted={isLocal}
                ref={(el) => { if (el) el.srcObject = videoStream; }}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 text-muted-foreground">
                <Avatar className="h-24 w-24 border-2 border-border/30">
                  <AvatarImage src={watchUser?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-slate-700 text-white text-3xl">{getInitials(watchName)}</AvatarFallback>
                </Avatar>
                <p className="text-sm">{watchName} is setting up the stream…</p>
              </div>
            )}
          </div>

          {/* Bottom bar: participant thumbnails + controls */}
          <div className="shrink-0 bg-black/70 border-t border-border/20 px-4 py-3 flex items-center gap-3">
            {/* Thumbnails */}
            <div className="flex gap-2 flex-1 overflow-x-auto min-w-0">
              {channelUsers.map(u => (
                <button
                  key={u.userId}
                  onClick={() => {
                    const hasStream = u.userId === myUserId ? !!screenStream : !!remoteVideoStreams[u.userId];
                    if (u.streaming || hasStream) setWatchingUserId(u.userId);
                  }}
                  className={cn(
                    "relative shrink-0 rounded-lg overflow-hidden border-2 transition-colors",
                    watchingUserId === u.userId ? "border-primary" : "border-border/30 hover:border-border"
                  )}
                  style={{ width: 80, height: 54 }}
                  title={u.displayName}
                >
                  <div className="w-full h-full bg-[#1E1F22] flex items-center justify-center">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={u.avatarUrl || undefined} />
                      <AvatarFallback className="bg-indigo-600 text-white text-sm">{getInitials(u.displayName)}</AvatarFallback>
                    </Avatar>
                  </div>
                  {u.streaming && (
                    <div className="absolute top-1 right-1 bg-emerald-500/90 rounded px-1 py-0.5 flex items-center gap-0.5">
                      <Radio size={8} className="text-white" />
                      <span className="text-[9px] text-white font-bold">LIVE</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={toggleMicMuted} title={micMuted ? 'Unmute' : 'Mute'}
                className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                  micMuted ? "bg-destructive text-white" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]")}>
                {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button onClick={handleToggleDeafen} title={deafened ? 'Undeafen' : 'Deafen'}
                className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                  deafened ? "bg-destructive text-white" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]")}>
                {deafened ? <VolumeX size={16} /> : <Headphones size={16} />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // --- Full voice overlay ---
  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="absolute bottom-8 bg-[#000000]/90 backdrop-blur-md rounded-2xl border border-border/50 shadow-2xl z-50 flex flex-col overflow-hidden"
        style={{ left: panelLeft, right: panelRight }}
        ref={panelRef}
      >
        {/* Title bar with minimize */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/20 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Voice · {channelUsers.length} connected
          </span>
          <button
            onClick={() => setVoiceMinimized(true)}
            title="Minimize"
            className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/15 transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronDown size={15} />
          </button>
        </div>

        {screenStream && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/50 text-emerald-400 py-1.5 px-4 text-center text-sm font-semibold flex items-center justify-center gap-2">
            <MonitorUp size={16} />
            You are sharing your screen.
            <button onClick={() => setWatchingUserId(myUserId ?? null)} className="ml-2 underline text-white hover:text-emerald-200">Watch</button>
            <button onClick={stopScreenShare} className="ml-2 underline text-white hover:text-emerald-200">Stop</button>
          </div>
        )}

        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <LocalUserTile
            isMuted={micMuted}
            isDeafened={deafened}
            speaking={localUserData?.speaking ?? false}
            displayName={localUserData?.displayName}
            avatarUrl={localUserData?.avatarUrl ?? null}
            streaming={!!screenStream}
            cameraStream={cameraStream}
            onWatch={() => screenStream && setWatchingUserId(myUserId ?? null)}
          />

          {remoteUsers.map(u => {
            const stream = remoteStreams[u.userId];
            const videoStream = remoteVideoStreams[u.userId];
            return (
              <RemoteUserTile
                key={u.userId}
                peerId={u.userId}
                displayName={u.displayName}
                avatarUrl={u.avatarUrl}
                muted={u.muted}
                speaking={u.speaking}
                streaming={u.streaming}
                stream={stream ?? null}
                videoStream={videoStream ?? null}
                volume={voiceVolumes[u.userId] ?? 1}
                deafened={deafened}
                isDeafened={u.deafened ?? false}
                outputDeviceId={audioOutputDeviceId}
                connectionType={connectionTypes[u.userId] ?? null}
                isBot={u.isBot}
                onOpenProfile={(x, y) => setVoiceCard({ userId: u.userId, x, y })}
                onVolumeChange={(v) => setVoiceVolume(u.userId, v)}
                onWatch={() => setWatchingUserId(u.userId)}
              />
            );
          })}
        </div>

        <div className="h-16 bg-[#1E1F22] border-t border-border/20 flex items-center justify-center gap-3 px-6 shrink-0">
          <button onClick={toggleMicMuted} title={micMuted ? 'Unmute' : 'Mute'}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              micMuted ? "bg-destructive text-white hover:bg-destructive/90" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]")}>
            {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          <button onClick={handleToggleDeafen} title={deafened ? 'Undeafen' : 'Deafen'}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              deafened ? "bg-destructive text-white hover:bg-destructive/90" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]")}>
            {deafened ? <VolumeX size={22} /> : <Headphones size={22} />}
          </button>

          {/* Camera toggle */}
          <button
            onClick={cameraStream ? stopCamera : startCamera}
            title={cameraStream ? 'Turn off camera' : 'Turn on camera'}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              cameraStream ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-[#2B2D31] text-foreground hover:bg-[#383A40]"
            )}
          >
            {cameraStream ? <Video size={22} /> : <VideoOff size={22} />}
          </button>

          {screenStream ? (
            <button onClick={stopScreenShare} title="Stop sharing"
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors bg-emerald-500 text-white hover:bg-emerald-600">
              <MonitorUp size={22} />
            </button>
          ) : (
            <Popover open={shareMenuOpen} onOpenChange={setShareMenuOpen}>
              <PopoverTrigger asChild>
                <button title="Share Screen"
                  className="h-12 px-3 rounded-full flex items-center gap-1.5 transition-colors bg-[#2B2D31] text-foreground hover:bg-[#383A40]">
                  <MonitorUp size={20} />
                  <ChevronDown size={14} className="opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-52 p-1.5 bg-[#111214] border-border/50" sideOffset={8}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1 pb-1.5">Share Your Screen</p>
                <button onClick={() => handleShare('monitor')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-white/10 transition-colors">
                  <Monitor size={16} className="text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">Entire Screen</div>
                    <div className="text-[11px] text-muted-foreground">Share your full desktop</div>
                  </div>
                </button>
                <button onClick={() => handleShare('window')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-white/10 transition-colors">
                  <AppWindow size={16} className="text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">Application Window</div>
                    <div className="text-[11px] text-muted-foreground">Share a specific app</div>
                  </div>
                </button>
                <button onClick={() => handleShare('browser')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-white/10 transition-colors">
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

          <button onClick={disconnect} title="Leave voice"
            className="w-16 h-12 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 transition-colors text-white shadow-lg shadow-destructive/20">
            <PhoneOff size={24} />
          </button>
        </div>
      </motion.div>

      {/* Voice profile card */}
      {voiceCard && (
        <VoiceProfileCard
          userId={voiceCard.userId}
          x={voiceCard.x}
          y={voiceCard.y}
          volume={voiceVolumes[voiceCard.userId] ?? 1}
          onVolumeChange={(v) => setVoiceVolume(voiceCard.userId, v)}
          onClose={() => setVoiceCard(null)}
        />
      )}
    </AnimatePresence>
  );
}

function SpeakingRing({ speaking, children }: { speaking: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(
      'rounded-full transition-all duration-150',
      speaking ? 'ring-[3px] ring-emerald-400 shadow-[0_0_12px_3px_rgba(52,211,153,0.5)]' : 'ring-[3px] ring-transparent'
    )}>
      {children}
    </div>
  );
}

function LocalUserTile({
  isMuted, isDeafened, speaking, displayName, avatarUrl, streaming, cameraStream, onWatch,
}: {
  isMuted: boolean; isDeafened: boolean; speaking: boolean;
  displayName?: string; avatarUrl: string | null;
  streaming: boolean; cameraStream: MediaStream | null; onWatch: () => void;
}) {
  const label = displayName ?? 'You';
  const cameraRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (cameraRef.current && cameraStream) {
      cameraRef.current.srcObject = cameraStream;
    } else if (cameraRef.current) {
      cameraRef.current.srcObject = null;
    }
  }, [cameraStream]);

  return (
    <div className={cn(
      "relative aspect-video bg-[#1E1F22] rounded-xl flex items-center justify-center overflow-hidden border transition-colors",
      isMuted ? "border-destructive/40" : speaking ? "border-emerald-500/60" : "border-border/20"
    )}>
      {/* Local camera feed */}
      {cameraStream && (
        <video
          ref={cameraRef}
          autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {(streaming || !!cameraStream) && (
        <button onClick={onWatch}
          className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity z-10 cursor-pointer group">
          <div className="flex items-center gap-1.5 bg-black/70 px-3 py-1.5 rounded-lg">
            <Maximize2 size={14} className="text-white" />
            <span className="text-xs text-white font-semibold">{streaming ? 'Watch' : 'Fullscreen'}</span>
          </div>
        </button>
      )}
      {!cameraStream && (
        <SpeakingRing speaking={speaking}>
          <Avatar className="h-14 w-14 shadow-xl">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="bg-indigo-600 text-white text-lg">{getInitials(label)}</AvatarFallback>
          </Avatar>
        </SpeakingRing>
      )}
      <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm flex items-center gap-1 z-20">
        {isMuted && <MicOff size={12} className="text-destructive" />}
        <span className="truncate max-w-[90px]">{label} (You)</span>
      </div>
      {streaming && (
        <div className="absolute top-2 right-2 bg-emerald-500/90 rounded px-1.5 py-0.5 flex items-center gap-1 z-20">
          <Radio size={9} className="text-white" />
          <span className="text-[10px] text-white font-bold">LIVE</span>
        </div>
      )}
      {cameraStream && (
        <div className="absolute top-2 left-2 bg-blue-500/90 rounded px-1.5 py-0.5 flex items-center gap-1 z-20">
          <Video size={9} className="text-white" />
          <span className="text-[10px] text-white font-bold">CAM</span>
        </div>
      )}
      {isDeafened && (
        <div className="absolute top-3 right-3 bg-destructive/90 p-1.5 rounded-full z-20">
          <VolumeX size={16} className="text-white" />
        </div>
      )}
    </div>
  );
}

function ConnectionBadge({ type }: { type: 'lan' | 'stun' | 'relay' | 'connecting' | null }) {
  if (!type || type === 'connecting') return null;

  const configs = {
    lan:   { icon: Wifi,   label: 'LAN',   cls: 'bg-emerald-500/90 text-white' },
    stun:  { icon: Globe,  label: 'P2P',   cls: 'bg-blue-500/90 text-white'    },
    relay: { icon: Server, label: 'Relay', cls: 'bg-amber-500/90 text-white'   },
  } as const;

  const { icon: Icon, label, cls } = configs[type];

  return (
    <div
      title={
        type === 'lan'   ? 'Connected via local network (LAN)' :
        type === 'stun'  ? 'Connected via direct internet (P2P)' :
        'Connected via relay server (TURN)'
      }
      className={cn(
        'absolute bottom-3 right-3 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold z-30 pointer-events-none',
        cls,
      )}
    >
      <Icon size={9} />
      {label}
    </div>
  );
}

function RemoteUserTile({
  displayName, avatarUrl, muted, speaking, streaming, stream, videoStream,
  volume, deafened, isDeafened, outputDeviceId, connectionType, isBot, onOpenProfile, onVolumeChange, onWatch,
}: {
  peerId: string;
  displayName: string;
  avatarUrl: string | null;
  muted: boolean;
  speaking: boolean;
  streaming: boolean;
  stream: MediaStream | null;
  videoStream: MediaStream | null;
  volume: number;
  deafened: boolean;
  isDeafened: boolean;
  outputDeviceId: string | null;
  connectionType: 'lan' | 'stun' | 'relay' | 'connecting' | null;
  isBot?: boolean;
  onOpenProfile: (x: number, y: number) => void;
  onVolumeChange: (v: number) => void;
  onWatch: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current && videoStream) videoRef.current.srcObject = videoStream;
  }, [videoStream]);

  // Set the incoming WebRTC stream on the audio element whenever it changes
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      el.volume = deafened ? 0 : Math.min(volume, 1);
      el.muted = false;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
      el.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // Sync volume and deafening directly on the audio element — always works
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = deafened ? 0 : Math.min(volume, 1);
    el.muted = deafened;
  }, [volume, deafened]);

  // Output device routing via setSinkId — Chrome/Edge only
  useEffect(() => {
    const el = audioRef.current as any;
    if (!el || !outputDeviceId) return;
    if (typeof el.setSinkId === 'function') {
      el.setSinkId(outputDeviceId).catch((err: unknown) => {
        console.warn('[Audio] setSinkId failed:', err);
      });
    }
  }, [outputDeviceId]);


  return (
    <div className={cn(
      "relative aspect-video bg-[#1E1F22] rounded-xl flex items-center justify-center overflow-hidden border group transition-colors",
      speaking ? "border-emerald-500/60" : "border-border/20"
    )}>
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Video feed — camera or screen share */}
      {videoStream && (
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      <button onClick={(e) => { e.stopPropagation(); onOpenProfile(e.clientX, e.clientY); }}
        title="View profile"
        className="absolute inset-0 w-full h-full flex flex-col items-center justify-center hover:bg-black/20 transition-colors z-10">
        {/* Hide avatar when video is live — camera/screen fills the tile */}
        {!videoStream && (
          <div className="relative">
            <SpeakingRing speaking={speaking}>
              <Avatar className="h-14 w-14 shadow-xl border-2 border-transparent group-hover:border-primary/50 transition-colors">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className={cn(isBot ? 'bg-violet-700' : 'bg-slate-700', 'text-white text-lg')}>
                  {isBot ? '♪' : getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
            </SpeakingRing>
            {isBot && (
              <span className="absolute -bottom-1 -right-1 bg-violet-500 rounded-full p-1 border-2 border-[#1E1F22]">
                <Music2 size={8} className="text-white" />
              </span>
            )}
          </div>
        )}
      </button>

      {/* Watch hover overlay — shown when streaming */}
      {(streaming || videoStream) && (
        <button onClick={(e) => { e.stopPropagation(); onWatch(); }}
          className="absolute inset-0 w-full h-full items-center justify-center bg-black/50 hidden group-hover:flex transition-opacity z-20 cursor-pointer">
          <div className="flex items-center gap-1.5 bg-black/70 px-3 py-1.5 rounded-lg">
            <Maximize2 size={14} className="text-white" />
            <span className="text-xs text-white font-semibold">Watch stream</span>
          </div>
        </button>
      )}

      <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm z-30 pointer-events-none flex items-center gap-1">
        {muted && <MicOff size={11} className="text-destructive shrink-0" />}
        {isDeafened && <VolumeX size={11} className="text-destructive shrink-0" />}
        <span className="truncate max-w-[90px]">{displayName}</span>
      </div>

      {isDeafened && (
        <div className="absolute top-3 right-3 bg-destructive/90 p-1.5 rounded-full z-30 pointer-events-none">
          <VolumeX size={13} className="text-white" />
        </div>
      )}

      {streaming && (
        <div className="absolute top-2 right-2 bg-emerald-500/90 rounded px-1.5 py-0.5 flex items-center gap-1 z-30 pointer-events-none">
          <Radio size={9} className="text-white" />
          <span className="text-[10px] text-white font-bold">LIVE</span>
        </div>
      )}

      <ConnectionBadge type={connectionType} />

    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice Profile Card — opens when clicking a participant tile
// Shows profile info + DM + mention + per-participant volume
// ---------------------------------------------------------------------------

async function fetchUserProfile(userId: string) {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}api/users/${userId}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

function vcStatusColor(status: string) {
  switch (status) {
    case 'online': return 'bg-emerald-500';
    case 'idle':   return 'bg-yellow-400';
    case 'dnd':    return 'bg-destructive';
    default:       return 'bg-muted-foreground/40';
  }
}
function vcStatusLabel(status: string) {
  switch (status) {
    case 'online': return 'Online';
    case 'idle':   return 'Idle';
    case 'dnd':    return 'Do Not Disturb';
    default:       return 'Offline';
  }
}

function VoiceProfileCard({
  userId, x, y, volume, onVolumeChange, onClose,
}: {
  userId: string;
  x: number;
  y: number;
  volume: number;
  onVolumeChange: (v: number) => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [dmLoading, setDmLoading] = useState(false);
  const { activeChannelId, setActiveDmThread, triggerMention } = useAppStore();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['voice-profile', userId],
    queryFn: () => fetchUserProfile(userId),
    staleTime: 60_000,
  });

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Smart positioning: keep card inside viewport
  const CARD_W = 280;
  const CARD_H = 380;
  const left = Math.min(x + 8, window.innerWidth - CARD_W - 8);
  const top  = Math.min(y + 8, window.innerHeight - CARD_H - 8);

  const handleMessage = async () => {
    if (!profile || dmLoading) return;
    setDmLoading(true);
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/dms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Failed to open DM');
      const thread = await res.json();
      qc.setQueryData(getListDmThreadsQueryKey(), (old: any[]) => {
        const existing = (old || []).filter((t: any) => t.id !== thread.id);
        return [...existing, thread];
      });
      setActiveDmThread(thread.id);
      onClose();
    } catch (err) {
      console.error('[VoiceProfileCard] DM open failed:', err);
    } finally {
      setDmLoading(false);
    }
  };

  const handleMention = () => {
    if (!profile) return;
    triggerMention(profile.displayName || profile.username);
    onClose();
  };

  return (
    <div
      ref={cardRef}
      style={{ position: 'fixed', left, top, zIndex: 200 }}
      className="w-[280px] bg-[#1E1F22] rounded-2xl shadow-2xl border border-border/20 overflow-hidden"
    >
      {/* Banner */}
      <div className="h-14 bg-gradient-to-br from-indigo-600 to-purple-700" />

      <div className="px-4 pb-4">
        {/* Avatar + close */}
        <div className="flex items-start justify-between -mt-7 mb-3">
          <div className="relative">
            <Avatar className="h-14 w-14 border-[4px] border-[#1E1F22] rounded-full">
              <AvatarImage src={profile?.avatarUrl || undefined} />
              <AvatarFallback className="bg-primary text-white text-lg">
                {isLoading ? '…' : getInitials(profile?.displayName || profile?.username || '?')}
              </AvatarFallback>
            </Avatar>
            {profile && (
              <div className={cn(
                'absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-[#1E1F22]',
                vcStatusColor(profile.status)
              )} style={{ width: 16, height: 16 }} />
            )}
          </div>
          <button onClick={onClose} className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : profile ? (
          <div className="space-y-3">
            <div>
              <h3 className="font-bold text-foreground text-sm leading-tight">{profile.displayName}</h3>
              <p className="text-xs text-muted-foreground">@{profile.username}</p>
            </div>

            {profile.customStatus && (
              <p className="text-xs text-muted-foreground italic">{profile.customStatus}</p>
            )}

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={cn('w-2 h-2 rounded-full shrink-0', vcStatusColor(profile.status))} />
              <span>{vcStatusLabel(profile.status)}</span>
            </div>

            <div className="h-px bg-border/20" />

            {/* DM + Mention */}
            <div className="flex gap-2">
              <button
                onClick={handleMessage}
                disabled={dmLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-medium text-foreground transition-colors disabled:opacity-60"
              >
                {dmLoading ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                Message
              </button>
              <button
                onClick={handleMention}
                disabled={!activeChannelId}
                title={!activeChannelId ? 'Open a text channel first' : 'Insert mention in composer'}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-medium text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AtSign size={12} />
                Mention
              </button>
            </div>

            <div className="h-px bg-border/20" />

            {/* Volume slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Volume2 size={12} />
                  Volume
                </span>
                <span className="font-bold tabular-nums text-foreground">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <Slider
                value={[volume]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={(val) => onVolumeChange(val[0])}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/60">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-2">Profile not found.</p>
        )}
      </div>
    </div>
  );
}
