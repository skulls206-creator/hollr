import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { useWebRTC } from '@/hooks/use-webrtc';
import { useAuth } from '@workspace/replit-auth-web';
import {
  Mic, MicOff, Headphones, VolumeX, MonitorUp, PhoneOff,
  Monitor, AppWindow, ChevronDown, ChevronUp, Maximize2, Minimize2, X, Radio,
  MessageSquare, AtSign, Volume2, Loader2, Wifi, Globe, Server, Video, VideoOff, Music2,
  Signal, BarChart2, MoreHorizontal,
} from 'lucide-react';
import type { VoiceStats } from '@/store/use-app-store';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { cn, getInitials } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useGetMyProfile, getGetMyProfileQueryKey } from '@workspace/api-client-react';
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
    voiceStats,
    setRemoteScreenStreams,
    pendingTheaterUserId, setPendingTheaterUserId,
  } = useAppStore();
  const { data: profile } = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey(), enabled: !!user } });
  const {
    localStream, remoteStreams, remoteVideoStreams, cameraStream, connectionTypes,
    startScreenShare, stopScreenShare, screenStream, startCamera, stopCamera,
  } = useWebRTC(voiceConnection.channelId, { displayName: profile?.displayName, avatarUrl: profile?.avatarUrl });

  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [watchingUserId, setWatchingUserId] = useState<string | null>(null);
  const [voiceCard, setVoiceCard] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [resizeHeight, setResizeHeight] = useState<number | null>(null);
  const [showQualityCard, setShowQualityCard] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [cardAnchor, setCardAnchor] = useState<{ x: number; y: number } | null>(null);

  // Reset all diagnostic overlays when switching between minimized / expanded
  useEffect(() => {
    setShowQualityCard(false);
    setShowStatsPanel(false);
    setShowOverflowMenu(false);
    setCardAnchor(null);
  }, [voiceMinimized]);

  // Publish remote video streams to the store so ScreenShareMiniPreview can read them
  useEffect(() => {
    setRemoteScreenStreams(remoteVideoStreams);
  }, [remoteVideoStreams, setRemoteScreenStreams]);

  // Respond to ScreenShareMiniPreview's "expand to theater" request.
  // setVoiceMinimized(false) must fire too so the minimized-pill early-return
  // branch doesn't block the watchingUserId theater branch from rendering.
  useEffect(() => {
    if (pendingTheaterUserId) {
      setVoiceMinimized(false);
      setWatchingUserId(pendingTheaterUserId);
      setPendingTheaterUserId(null);
    }
  }, [pendingTheaterUserId, setPendingTheaterUserId, setVoiceMinimized]);

  const panelRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);
  const isMobile = useIsMobile();

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = panelRef.current?.offsetHeight ?? 0;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = dragStartY.current - ev.clientY;
      const newH = Math.max(180, Math.min(window.innerHeight * 0.75, dragStartH.current + delta));
      setResizeHeight(newH);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const panelLeft = 8;
  const panelRight = 8;

  useEffect(() => {
    if (voiceConnection.status === 'disconnected' || (isMobile && (mobileSidebarOpen || memberListOpen || pinnedPanelOpen))) {
      setVoicePanelHeight(0);
      return;
    }
    if (voiceMinimized) {
      // Minimized pill is absolute bottom-3 (~44px tall) — reserve space so it
      // doesn't overlap the message composer in both dock and classic layouts.
      setVoicePanelHeight(72);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    const BOTTOM_OFFSET = 32;
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

  useEffect(() => {
    if (watchingUserId && watchingUserId !== myUserId) {
      const watcher = channelUsers.find(u => u.userId === watchingUserId);
      if (watcher && !watcher.streaming && !remoteVideoStreams[watchingUserId]) {
        setWatchingUserId(null);
      }
    }
  }, [channelUsers, remoteVideoStreams, watchingUserId, myUserId]);

  if (voiceConnection.status === 'disconnected') return null;
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

  // ── Minimized pill ──────────────────────────────────────────────────────────
  if (voiceMinimized) {
    return (
      <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="absolute bottom-3 bg-surface-2/95 backdrop-blur-md rounded-2xl border border-border/50 shadow-lg z-50 flex items-center gap-2 px-3 py-2"
          style={{ left: panelLeft, right: panelRight }}
        >
          <span className="relative flex h-2 w-2 mr-0.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>

          <div className="flex -space-x-1.5">
            {channelUsers.slice(0, 4).map(u => (
              <Avatar key={u.userId} className="h-6 w-6 border-2 border-surface-2">
                <AvatarImage src={u.avatarUrl || undefined} />
                <AvatarFallback className="bg-indigo-600 text-white text-[10px]">{getInitials(u.displayName)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-xs text-foreground/80 font-medium">{channelUsers.length} in voice</span>

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          <button
            onClick={toggleMicMuted}
            title={micMuted ? 'Unmute' : 'Mute'}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
              micMuted ? "bg-destructive/80 text-white" : "bg-muted text-foreground/70 hover:bg-muted/80 hover:text-foreground"
            )}
          >
            {micMuted ? <MicOff size={13} /> : <Mic size={13} />}
          </button>

          <button
            onClick={handleToggleDeafen}
            title={deafened ? 'Undeafen' : 'Deafen'}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
              deafened ? "bg-destructive/80 text-white" : "bg-muted text-foreground/70 hover:bg-muted/80 hover:text-foreground"
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

          <div className="w-px h-4 bg-border/50 mx-0.5" />

          <button
            onClick={() => setVoiceMinimized(false)}
            title="Expand"
            className="w-7 h-7 rounded-full flex items-center justify-center bg-muted text-foreground/70 hover:bg-muted/80 hover:text-foreground transition-colors"
          >
            <ChevronUp size={14} />
          </button>

          {/* Connection quality indicator */}
          <div className="w-px h-4 bg-border/50 mx-0.5" />
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setCardAnchor({ x: rect.left, y: rect.top });
              setShowQualityCard(v => !v);
              setShowStatsPanel(false);
            }}
            title="Voice Connection Quality"
            className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-muted/60 transition-colors"
          >
            <Signal size={12} style={{ color: qualityColor(voiceStats?.rttMs ?? null) }} />
            <span className="text-[11px] font-mono tabular-nums" style={{ color: qualityColor(voiceStats?.rttMs ?? null) }}>
              {voiceStats?.rttMs != null ? `${voiceStats.rttMs}ms` : '—ms'}
            </span>
          </button>
        </motion.div>
      </AnimatePresence>

      {/* Voice connection quality popover */}
      <AnimatePresence>
        {showQualityCard && cardAnchor && (
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setShowQualityCard(false)} />
            <VoiceConnectionPopover
              stats={voiceStats}
              connectionTypes={connectionTypes}
              anchorX={cardAnchor.x}
              anchorY={cardAnchor.y}
              onClose={() => setShowQualityCard(false)}
            />
          </>
        )}
      </AnimatePresence>
      </>
    );
  }

  // ── Watch Stream full-screen view (always dark — video theatre) ─────────────
  if (watchingUserId) {
    const isLocal = watchingUserId === myUserId;
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
          <div className="flex items-center justify-between px-5 py-3 bg-black/60 border-b border-white/10 shrink-0">
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
              <div className="flex flex-col items-center gap-4 text-white/50">
                <Avatar className="h-24 w-24 border-2 border-white/20">
                  <AvatarImage src={watchUser?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-slate-700 text-white text-3xl">{getInitials(watchName)}</AvatarFallback>
                </Avatar>
                <p className="text-sm">{watchName} is setting up the stream…</p>
              </div>
            )}
          </div>

          <div className="shrink-0 bg-black/70 border-t border-white/10 px-4 py-3 flex items-center gap-3">
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
                    watchingUserId === u.userId ? "border-primary" : "border-white/20 hover:border-white/40"
                  )}
                  style={{ width: 80, height: 54 }}
                  title={u.displayName}
                >
                  <div className="w-full h-full bg-black/60 flex items-center justify-center">
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

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={toggleMicMuted} title={micMuted ? 'Unmute' : 'Mute'}
                className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                  micMuted ? "bg-destructive text-white" : "bg-white/10 text-white hover:bg-white/20")}>
                {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button onClick={handleToggleDeafen} title={deafened ? 'Undeafen' : 'Deafen'}
                className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                  deafened ? "bg-destructive text-white" : "bg-white/10 text-white hover:bg-white/20")}>
                {deafened ? <VolumeX size={16} /> : <Headphones size={16} />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Full voice overlay ──────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="absolute bottom-8 bg-surface-2/95 backdrop-blur-md rounded-2xl border border-border/50 shadow-2xl z-50 flex flex-col overflow-hidden"
        style={{ left: panelLeft, right: panelRight, ...(resizeHeight ? { height: resizeHeight } : {}) }}
        ref={panelRef}
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="h-4 flex items-center justify-center cursor-ns-resize shrink-0 group/rh"
          title="Drag to resize"
        >
          <div className="w-8 h-1 rounded-full bg-border/60 group-hover/rh:bg-border transition-colors" />
        </div>

        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Voice · {channelUsers.length} connected
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setCardAnchor({ x: rect.left, y: rect.bottom });
                setShowOverflowMenu(v => !v);
                setShowStatsPanel(false);
                setShowQualityCard(false);
              }}
              title="More options"
              className="w-7 h-7 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal size={14} />
            </button>
            <button
              onClick={() => setVoiceMinimized(true)}
              title="Minimize"
              className="w-7 h-7 rounded-full flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronDown size={15} />
            </button>
          </div>
        </div>

        {screenStream && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-600 dark:text-emerald-400 py-1.5 px-4 text-center text-sm font-semibold flex items-center justify-center gap-2">
            <MonitorUp size={16} />
            You are sharing your screen.
            <button onClick={() => setWatchingUserId(myUserId ?? null)} className="ml-2 underline hover:text-emerald-700 dark:hover:text-emerald-200">Watch</button>
            <button onClick={stopScreenShare} className="ml-2 underline hover:text-emerald-700 dark:hover:text-emerald-200">Stop</button>
          </div>
        )}

        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto flex-1 min-h-0">
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

        {/* Control bar */}
        <div className="h-16 bg-surface-0 border-t border-border/30 flex items-center justify-center gap-3 px-6 shrink-0">
          <button onClick={toggleMicMuted} title={micMuted ? 'Unmute' : 'Mute'}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              micMuted ? "bg-destructive text-white hover:bg-destructive/90" : "bg-muted text-foreground hover:bg-muted/70")}>
            {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          <button onClick={handleToggleDeafen} title={deafened ? 'Undeafen' : 'Deafen'}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              deafened ? "bg-destructive text-white hover:bg-destructive/90" : "bg-muted text-foreground hover:bg-muted/70")}>
            {deafened ? <VolumeX size={22} /> : <Headphones size={22} />}
          </button>

          <button
            onClick={cameraStream ? stopCamera : startCamera}
            title={cameraStream ? 'Turn off camera' : 'Turn on camera'}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              cameraStream ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-muted text-foreground hover:bg-muted/70"
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
                  className="h-12 px-3 rounded-full flex items-center gap-1.5 transition-colors bg-muted text-foreground hover:bg-muted/70">
                  <MonitorUp size={20} />
                  <ChevronDown size={14} className="opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-52 p-1.5 border-border/50" sideOffset={8}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1 pb-1.5">Share Your Screen</p>
                <button onClick={() => handleShare('monitor')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors">
                  <Monitor size={16} className="text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">Entire Screen</div>
                    <div className="text-[11px] text-muted-foreground">Share your full desktop</div>
                  </div>
                </button>
                <button onClick={() => handleShare('window')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors">
                  <AppWindow size={16} className="text-primary shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">Application Window</div>
                    <div className="text-[11px] text-muted-foreground">Share a specific app</div>
                  </div>
                </button>
                <button onClick={() => handleShare('browser')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors">
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

      {/* ⋯ overflow dropdown menu */}
      {showOverflowMenu && cardAnchor && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setShowOverflowMenu(false)} />
          <div
            className="fixed z-[71] bg-popover border border-border/60 rounded-lg shadow-xl py-1 min-w-[168px]"
            style={{ left: cardAnchor.x, top: cardAnchor.y + 2 }}
          >
            <button
              onClick={() => { setShowOverflowMenu(false); setShowStatsPanel(true); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
            >
              <BarChart2 size={13} className="text-muted-foreground" />
              Connection Stats
            </button>
          </div>
        </>
      )}

      {/* Connection stats panel */}
      {showStatsPanel && cardAnchor && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setShowStatsPanel(false)} />
          <ConnectionStatsPanel
            stats={voiceStats}
            anchorX={cardAnchor.x}
            anchorY={cardAnchor.y}
            onClose={() => setShowStatsPanel(false)}
          />
        </>
      )}
    </AnimatePresence>
  );
}

// ── Voice diagnostics helpers & components ────────────────────────────────

function qualityColor(rttMs: number | null | undefined): string {
  if (rttMs == null) return 'hsl(var(--muted-foreground))';
  if (rttMs < 80)   return '#22c55e';
  if (rttMs < 150)  return '#f59e0b';
  return '#ef4444';
}

function formatDuration(startedAt: number | null): string {
  if (!startedAt) return '0:00';
  const totalSecs = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PingSparkline({ history }: { history: number[] }) {
  // Chart area: 120×40; left padding for Y-axis labels
  const CW = 120, CH = 40, PAD_L = 26;
  const SVG_W = PAD_L + CW + 2;

  if (history.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-[10px] text-muted-foreground"
        style={{ width: SVG_W, height: CH, background: 'rgba(128,128,128,0.07)' }}
      >
        Collecting data…
      </div>
    );
  }
  const maxVal = Math.max(...history, 80);
  const ticks  = [maxVal, Math.round(maxVal * 0.5), 0];
  const toX = (i: number) => PAD_L + (i / (history.length - 1)) * CW;
  const toY = (v: number) => 3 + (1 - v / maxVal) * (CH - 6);
  const pts = history.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const last = history[history.length - 1];
  const avg  = history.reduce((a, b) => a + b, 0) / history.length;
  const col  = qualityColor(avg);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(128,128,128,0.07)', padding: '2px 0' }}>
      <svg width={SVG_W} height={CH}>
        {ticks.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={SVG_W - 2} y2={y} stroke="rgba(128,128,128,0.15)" strokeWidth={0.5} />
              <text x={PAD_L - 3} y={y} fontSize={7} fill="rgba(128,128,128,0.5)" textAnchor="end" dominantBaseline="middle">
                {v}ms
              </text>
            </g>
          );
        })}
        <polyline points={pts} fill="none" stroke={col} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {/* Per-sample dot markers */}
        {history.map((v, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(v)}
            r={i === history.length - 1 ? 2 : 1}
            fill={col}
            opacity={i === history.length - 1 ? 1 : 0.55}
          />
        ))}
      </svg>
    </div>
  );
}

function VoiceConnectionPopover({
  stats, connectionTypes, anchorX, anchorY, onClose,
}: {
  stats: VoiceStats | null;
  connectionTypes: Record<string, 'lan' | 'stun' | 'relay' | 'connecting'>;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
}) {
  const { audioInputDeviceId } = useAppStore();

  // Resolve the actual microphone device label via enumerateDevices
  const [deviceLabel, setDeviceLabel] = useState<string>('This device');
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const target = audioInputDeviceId ?? 'default';
      const mic = devices.find(d => d.kind === 'audioinput' && d.deviceId === target)
        ?? devices.find(d => d.kind === 'audioinput' && d.deviceId === 'default')
        ?? devices.find(d => d.kind === 'audioinput');
      if (mic?.label) {
        // Strip trailing "(USB 2.0 Device)" / "(…)" model suffixes for brevity
        const clean = mic.label.replace(/\s*\(.*?\)\s*$/, '').trim();
        setDeviceLabel(clean || mic.label);
      }
    }).catch(() => {});
  }, [audioInputDeviceId]);

  const CARD_W = 268;
  const left = Math.max(8, Math.min(anchorX, window.innerWidth - CARD_W - 12));
  const top = Math.max(8, anchorY - 280);

  const connVals = Object.values(connectionTypes);
  const primaryType = connVals.find(t => t !== 'connecting') ?? null;
  const endpointLabel = primaryType === 'lan' ? 'Local Network'
    : primaryType === 'stun' ? 'P2P / STUN'
    : primaryType === 'relay' ? 'Relay Server'
    : '—';

  return (
    <motion.div
      key="quality-popover"
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[71] bg-popover border border-border/60 rounded-xl shadow-2xl p-4 flex flex-col gap-3"
      style={{ left, top, width: CARD_W }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Signal size={13} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Voice Connection</span>
        </div>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded">
          <X size={13} />
        </button>
      </div>

      <PingSparkline history={stats?.rttHistory ?? []} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Device</span>
          <span className="text-xs font-medium flex items-center gap-1 max-w-[140px] truncate text-right">
            <Mic size={11} className="text-muted-foreground shrink-0" />
            <span className="truncate">{deviceLabel}</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Current ping</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: qualityColor(stats?.rttMs) }}>
            {stats?.rttMs != null ? `${stats.rttMs}ms` : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Average ping</span>
          <span className="text-xs font-bold tabular-nums" style={{ color: qualityColor(stats?.avgRttMs) }}>
            {stats?.avgRttMs != null ? `${stats.avgRttMs}ms` : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Endpoint</span>
          <span className="text-xs font-medium flex items-center gap-1" style={{ color: qualityColor(stats?.rttMs) }}>
            <Globe size={10} />
            {endpointLabel}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function ConnectionStatsPanel({
  stats, anchorX, anchorY, onClose,
}: {
  stats: VoiceStats | null;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
}) {
  const CARD_W = 284;
  const left = Math.max(8, Math.min(anchorX, window.innerWidth - CARD_W - 12));
  const top = Math.max(8, anchorY + 4);

  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const Row = ({ label, value, dim }: { label: string; value: React.ReactNode; dim?: boolean }) => (
    <div className={cn('flex items-center justify-between py-0.5', dim && 'opacity-40')}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </div>
  );

  const lossColor = (pct: number | null) => (
    <span style={{ color: (pct ?? 0) < 1 ? '#22c55e' : (pct ?? 0) < 5 ? '#f59e0b' : '#ef4444' }}>
      {pct != null ? `${pct}%` : '—'}
    </span>
  );

  return (
    <motion.div
      key="stats-panel"
      initial={{ opacity: 0, y: -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[71] bg-popover border border-border/60 rounded-xl shadow-2xl p-4 flex flex-col gap-1.5"
      style={{ left, top, width: CARD_W }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <BarChart2 size={13} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Connection Stats</span>
        </div>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded">
          <X size={13} />
        </button>
      </div>

      <Row label="Duration" value={formatDuration(stats?.startedAt ?? null)} />
      <Row label="Participants" value={stats?.participantCount ?? 0} />

      <div className="h-px bg-border/40 my-0.5" />
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Mic size={10} /> Audio
      </p>
      <Row label="Send" value={`${stats?.audioSendKbps ?? 0} kbps`} />
      <Row label="Receive" value={`${stats?.audioRecvKbps ?? 0} kbps`} />
      <Row label="Packet Loss" value={lossColor(stats?.packetLossPct ?? 0)} />

      <div className="h-px bg-border/40 my-0.5" />
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Video size={10} /> Video
      </p>
      <Row label="Send"    value={stats?.videoSendKbps != null ? `${stats.videoSendKbps} kbps` : '—'} dim={stats?.videoSendKbps == null} />
      <Row label="Receive" value={stats?.videoRecvKbps != null ? `${stats.videoRecvKbps} kbps` : '—'} dim={stats?.videoRecvKbps == null} />

      <div className="h-px bg-border/40 my-0.5" />
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Globe size={10} /> Network
      </p>
      <Row label="Latency (RTT)" value={stats?.rttMs    != null ? <span style={{ color: qualityColor(stats.rttMs) }}>{stats.rttMs} ms</span>    : '—'} />
      <Row label="Jitter"        value={stats?.jitterMs != null ? <span style={{ color: qualityColor(stats.jitterMs) }}>{stats.jitterMs} ms</span> : '—'} />

      <p className="text-[10px] text-muted-foreground/50 text-center pt-1">Stats update every second</p>
    </motion.div>
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
      "relative aspect-video bg-surface-0 rounded-xl flex items-center justify-center overflow-hidden border transition-colors",
      isMuted ? "border-destructive/40" : speaking ? "border-emerald-500/60" : "border-border/30"
    )}>
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
          <Avatar className="h-16 w-16 shadow-xl">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="bg-indigo-600 text-white text-xl">{getInitials(label)}</AvatarFallback>
          </Avatar>
        </SpeakingRing>
      )}
      <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm text-white flex items-center gap-1 z-20">
        {isDeafened && <VolumeX size={12} className="text-red-300 shrink-0" />}
        {isMuted && !isDeafened && <MicOff size={12} className="text-red-300 shrink-0" />}
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
  // Use a <video> element (not <audio>) for remote audio playback.
  // On iOS Safari, <audio display:none> is suspended by the OS; a <video> element
  // with playsInline and off-screen CSS stays active — matching the DM call approach.
  const audioElRef = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const deafenedRef = useRef(deafened);
  deafenedRef.current = deafened;

  // One-time setup: set webkit-playsinline (older iOS requires this via setAttribute,
  // JSX playsInline alone is not enough) and register a gesture-retry handler so
  // iOS can unblock play() after a NotAllowedError without user needing to re-join.
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    el.setAttribute('webkit-playsinline', 'true');
    el.autoplay = true;
    el.muted = false;

    const retryPlay = () => {
      if (el.paused && el.srcObject && !deafenedRef.current) {
        el.play().catch(() => {});
      }
    };
    document.addEventListener('touchstart', retryPlay, { passive: true });
    document.addEventListener('click', retryPlay);
    return () => {
      document.removeEventListener('touchstart', retryPlay);
      document.removeEventListener('click', retryPlay);
    };
  }, []);

  useEffect(() => {
    const el = audioElRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.muted = false;
    if (outputDeviceId && typeof (el as any).setSinkId === 'function') {
      (el as any).setSinkId(outputDeviceId).catch(() => {});
    }
    if (!deafened) el.play().catch(() => {});
    else el.pause();
  }, [stream, deafened, outputDeviceId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = videoStream ?? null;
    if (videoStream) el.play().catch(() => {});
  }, [videoStream]);

  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  return (
    <div
      className={cn(
        "relative aspect-video bg-surface-0 rounded-xl flex items-center justify-center overflow-hidden border transition-colors cursor-pointer",
        muted ? "border-destructive/30" : speaking ? "border-emerald-500/60" : "border-border/30"
      )}
      onClick={(e) => onOpenProfile(e.clientX, e.clientY)}
    >
      {/* video element used for audio — <audio display:none> is suspended on iOS Safari */}
      <video
        ref={audioElRef}
        autoPlay
        playsInline
        style={{ position: 'fixed', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', top: '-9999px', left: '-9999px' }}
      />

      {videoStream ? (
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <SpeakingRing speaking={speaking}>
          <Avatar className="h-16 w-16 shadow-xl">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="bg-indigo-600 text-white text-xl">{getInitials(displayName)}</AvatarFallback>
          </Avatar>
        </SpeakingRing>
      )}

      {(streaming || videoStream) && (
        <button
          onClick={(e) => { e.stopPropagation(); onWatch(); }}
          className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity z-10 cursor-pointer"
        >
          <div className="flex items-center gap-1.5 bg-black/70 px-3 py-1.5 rounded-lg">
            <Maximize2 size={14} className="text-white" />
            <span className="text-xs text-white font-semibold">Watch</span>
          </div>
        </button>
      )}

      <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-semibold backdrop-blur-sm text-white flex items-center gap-1 z-20">
        {isDeafened && <VolumeX size={12} className="text-red-300 shrink-0" />}
        {muted && !isDeafened && <MicOff size={12} className="text-red-300 shrink-0" />}
        {isBot && <Music2 size={12} className="text-blue-300 shrink-0" />}
        <span className="truncate max-w-[90px]">{displayName}</span>
      </div>

      {streaming && (
        <div className="absolute top-2 right-2 bg-emerald-500/90 rounded px-1.5 py-0.5 flex items-center gap-1 z-20">
          <Radio size={9} className="text-white" />
          <span className="text-[10px] text-white font-bold">LIVE</span>
        </div>
      )}

      <ConnectionBadge type={connectionType} />
    </div>
  );
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
  const { voiceChannelUsers, voiceConnection } = useAppStore();
  const channelUsers = voiceConnection.channelId
    ? (voiceChannelUsers[voiceConnection.channelId] ?? [])
    : [];
  const user = channelUsers.find(u => u.userId === userId);

  if (!user) return null;

  const cardW = 220;
  const cardH = 120;
  const left = Math.min(x, window.innerWidth - cardW - 12);
  const top = Math.min(y, window.innerHeight - cardH - 12);

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        className="fixed z-[61] bg-popover border border-border/50 rounded-xl shadow-xl p-4 flex flex-col gap-3"
        style={{ left, top, width: cardW }}
      >
        <button onClick={onClose} className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <X size={13} />
        </button>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={user.avatarUrl || undefined} />
            <AvatarFallback className="bg-indigo-600 text-white text-sm">{getInitials(user.displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{user.displayName}</p>
            <p className="text-xs text-muted-foreground">Voice volume</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Volume2 size={14} className="text-muted-foreground shrink-0" />
          <Slider
            min={0} max={2} step={0.05}
            value={[volume]}
            onValueChange={([v]) => onVolumeChange(v)}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </motion.div>
    </>
  );
}
