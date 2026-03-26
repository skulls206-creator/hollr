import { useAuth } from '@workspace/replit-auth-web';
import { useRealtime } from '@/hooks/use-realtime';
import { useAppStore } from '@/store/use-app-store';
import { ServerSidebar } from '@/components/layout/ServerSidebar';
import { ChannelSidebar } from '@/components/layout/ChannelSidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { DmChatArea } from '@/components/chat/DmChatArea';
import { MemberList } from '@/components/layout/MemberList';
import { MusicControlBar } from '@/components/music/MusicControlBar';
import { CreateServerModal } from '@/components/modals/CreateServerModal';
import { CreateChannelModal } from '@/components/modals/CreateChannelModal';
import { InviteModal } from '@/components/modals/InviteModal';
import { HelpModal } from '@/components/modals/HelpModal';
import { ServerSettingsModal } from '@/components/modals/ServerSettingsModal';
import { UserSettingsModal } from '@/components/modals/UserSettingsModal';
import { ThreadSidebar } from '@/components/chat/ThreadSidebar';
import { UserProfileCard } from '@/components/chat/UserProfileCard';
import { VoiceOverlay } from '@/components/voice/VoiceOverlay';
import { DmCallOverlay } from '@/components/call/DmCallOverlay';
import { VideoCallOverlay } from '@/components/call/VideoCallOverlay';
import { useListDmThreads, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import { MobileDmList } from '@/components/layout/MobileDmList';
import { DockBar } from '@/components/layout/DockBar';
import { NewDmModal } from '@/components/modals/NewDmModal';
import { AppWindow } from '@/components/khurk/AppWindow';
import { PiPWindow } from '@/components/khurk/PiPWindow';
import { DashboardView } from '@/components/khurk/DashboardView';
import { NotificationBell, useInitNotifications } from '@/components/notifications/NotificationBell';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { pendingNav, applyNav } from '@/lib/notification-nav';
import { dmLastSeenMsgId } from '@/lib/dm-seen-tracker';

export function Layout() {
  const { user, isLoading } = useAuth();
  const {
    activeServerId, activeDmThreadId, memberListOpen, mobileSidebarOpen, setMobileSidebarOpen,
    threadMessageId, threadChannelId, closeThread,
    profileCard, closeProfileCard,
    pinnedPanelOpen, toggleMemberList,
    voiceConnection, layoutMode,
    activeKhurkAppId, khurkPipMode, khurkDashboardOpen, khurkOsEnabled,
    classicChannelOpen, toggleClassicChannel, setClassicChannelOpen,
    sidebarLocked, setSidebarLocked, toggleMobileSidebar,
    incrementDmUnreadCount, clearDmUnreadCount,
  } = useAppStore();

  useInitNotifications();

  const navApplied = useRef(false);
  useEffect(() => {
    if (!isLoading && user && !navApplied.current && pendingNav) {
      navApplied.current = true;
      applyNav(pendingNav);
    }
  }, [isLoading, user]);

  // Auto-close the mobile sidebar whenever the viewport grows past the md
  // breakpoint (≥ 768px) while in normal chat mode — prevents the sidebar
  // from getting stuck as an overlay after a resize.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileSidebarOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setMobileSidebarOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && memberListOpen) toggleMemberList(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [memberListOpen, toggleMemberList]);

  useRealtime(user?.id);

  const { data: dmThreads = [] } = useListDmThreads({
    query: { queryKey: getListDmThreadsQueryKey(), refetchInterval: 5000, refetchIntervalInBackground: false },
  });

  // Polling-based unread detection: compare lastMessage.id per thread across polls.
  // Uses dmLastSeenMsgId (shared with WS handler) to prevent double-counting.
  const pollInitialized = useRef(false);

  useEffect(() => {
    if (!user || dmThreads.length === 0) return;

    if (!pollInitialized.current) {
      // First load: seed the shared tracker without incrementing (these are already-seen messages)
      dmThreads.forEach((t: any) => {
        if (t?.lastMessage?.id && !dmLastSeenMsgId.has(t.id)) {
          dmLastSeenMsgId.set(t.id, t.lastMessage.id);
        }
      });
      pollInitialized.current = true;
      return;
    }

    // Subsequent polls: detect new messages not already handled by WebSocket
    const currentActiveDmThreadId = useAppStore.getState().activeDmThreadId;
    dmThreads.forEach((t: any) => {
      if (!t?.lastMessage?.id) return;
      const prev = dmLastSeenMsgId.get(t.id);
      const curr = t.lastMessage.id;
      if (curr !== prev) {
        dmLastSeenMsgId.set(t.id, curr);
        // Only increment if: not the active thread, not sent by the current user
        if (t.id !== currentActiveDmThreadId && t.lastMessage.authorId !== user.id) {
          incrementDmUnreadCount(t.id);
        }
      }
    });
  }, [dmThreads, user, incrementDmUnreadCount]);

  // When user opens a DM thread, mark its latest message as seen and clear the badge
  useEffect(() => {
    if (!activeDmThreadId) return;
    const thread = dmThreads.find((t: any) => t.id === activeDmThreadId);
    if (thread?.lastMessage?.id) {
      dmLastSeenMsgId.set(activeDmThreadId, thread.lastMessage.id);
    }
    clearDmUnreadCount(activeDmThreadId);
  }, [activeDmThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">Connecting to hollr…</p>
      </div>
    );
  }

  if (!user) return null;

  const activeDmThread = dmThreads.find(t => t.id === activeDmThreadId);
  const dmRecipient = activeDmThread?.participants?.find((p: any) => p.id !== user.id)
    ?? activeDmThread?.participants?.[0];

  const showThread = !!(threadMessageId && threadChannelId);
  const showMemberList = !!(activeServerId && memberListOpen && !showThread && !pinnedPanelOpen);

  // Whether the KHURK OS AppWindow should occupy the entire center panel
  const showAppWindow = !!(khurkOsEnabled && activeKhurkAppId && !khurkPipMode);

  // Dashboard: shown when explicitly opened (hollr icon toggle), no app/DM/server taking over
  const showDashboard = khurkOsEnabled && khurkDashboardOpen && !activeKhurkAppId && !activeDmThreadId && !activeServerId;

  return (
    /*
      Root: flex-col so the dock sticks to the bottom.
      Inside: one flex row that fills all remaining space.
        • Left: sidebar column — full height from top to bottom
        • Right: flex-col column — music bar (top) + chat row (fill)
      The music bar only spans the right column, so sidebars go to the very top.
    */
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden font-sans text-foreground">

      {/* Classic mode: backdrop only for channel sidebar on mobile */}
      {layoutMode === 'classic' && classicChannelOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setClassicChannelOpen(false)}
        />
      )}

      {/* Dock mode: backdrop for sidebar overlay — all sizes when dashboard/app
          is active, mobile-only during normal chat */}
      {layoutMode !== 'classic' && mobileSidebarOpen && (
        <div
          className={`fixed inset-0 bg-black/60 z-30 ${
            (showDashboard || showAppWindow) ? '' : 'md:hidden'
          }`}
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile member list — slide-in from right */}
      {memberListOpen && activeServerId && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-30 lg:hidden"
            onClick={toggleMemberList}
          />
          <div className="fixed right-0 top-0 h-full z-40 lg:hidden">
            <MemberList serverId={activeServerId} />
          </div>
        </>
      )}

      {/*
        ── Main row ──
        Three-column layout (Discord-style):
          Left:   ChannelSidebar — full height from top
          Middle: flex-col — music bar (spans only chat width) + chat content
          Right:  MemberList — full height from top (mirrors left sidebar)
        Both sidebars are siblings to the middle column so they are never
        pushed down by the music bar.
      */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/*
          ── Classic layout: permanent server icon rail ──
          Rendered as an always-in-flow sibling — NEVER toggled or hidden,
          not even on mobile (it's only 72px wide so it fits on any screen).
          The channel sidebar below slides independently beside it.
        */}
        {layoutMode === 'classic' && (
          <div className="relative h-full shrink-0 z-40">
            <ServerSidebar />
          </div>
        )}

        {/* ── Channel sidebar wrapper ──
            Classic mode:
              • Desktop (md:): always relative/in-flow, always visible.
              • Mobile: fixed, starts at left=72px (right of the permanent icon
                rail), slides in/out with the hamburger.
            Dock mode:
              • Height pinned above the dock pill on mobile (78px).
              • Dashboard/app open: always fixed (no dead-space gap in the flex row).
              • Normal chat: fixed on mobile (hamburger), relative on desktop. */}
        <div
          className={[
            'flex z-40 shrink-0 transition-all duration-200',
            layoutMode === 'classic'
              // Classic: icon rail (ServerSidebar, 72px) is always in-flow.
              // Channel sidebar slides independently beside it.
              // Mobile open:   left-[72px] translate-x-0    → right of icon rail ✓
              // Mobile closed: left-0 -translate-x-full     → x = 0-260 = -260 → fully off screen ✓
              //   (using left-[72px] when closed gave x = 72-260 = -188, leaving 72px visible)
              // Desktop: in-flow, collapses to w-0 when closed.
              ? [
                  'top-0 h-full fixed md:left-auto md:relative md:h-full',
                  classicChannelOpen
                    ? 'left-[72px] translate-x-0'
                    : 'left-0 -translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:min-w-0',
                ].join(' ')
              : layoutMode === 'dock'
                // Dock: explicit left-0 on all fixed cases so -translate-x-full
                // always moves the sidebar to x = 0-260 = -260 (fully off screen).
                ? [
                    'top-0 bottom-[78px] md:bottom-0 md:h-full',
                    sidebarLocked
                      ? (showDashboard || showAppWindow)
                        ? 'fixed left-0 translate-x-0'
                        : 'fixed left-0 translate-x-0 md:relative md:left-auto md:h-full'
                      : (showDashboard || showAppWindow)
                        ? `fixed left-0 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
                        : `fixed left-0 md:relative md:left-auto md:h-full ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`,
                  ].join(' ')
                : `fixed top-0 left-0 h-full md:relative md:h-full md:left-auto ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`,
          ].join(' ')}
        >
          <ChannelSidebar />
        </div>

        {/* ── Middle column — music bar + chat ── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/*
            Music bar lives here — spans only the chat column,
            NOT the left or right sidebars.
          */}
          {voiceConnection.channelId && (
            <MusicControlBar
              voiceChannelId={voiceConnection.channelId}
              queueDirection="down"
            />
          )}

          {/* Chat + thread panel — fills remaining height */}
          <div className="flex flex-1 min-h-0 overflow-hidden relative">

            {/* ── KHURK OS AppWindow (highest priority) ── */}
            {showAppWindow ? (
              <AppWindow />
            ) : showDashboard ? (
              /* ── KHURK OS Dashboard ── */
              <DashboardView onOpenSidebar={
                layoutMode === 'classic' ? toggleClassicChannel : toggleMobileSidebar
              } />
            ) : activeDmThreadId ? (
              /* ── DM chat ── */
              <DmChatArea
                threadId={activeDmThreadId}
                recipientId={dmRecipient?.id}
                recipientName={dmRecipient?.displayName || dmRecipient?.username || 'Unknown'}
                recipientAvatar={dmRecipient?.avatarUrl}
              />
            ) : !activeServerId ? (
              /* ── No server / DM selected ── */
              <>
                <div className="flex md:hidden flex-1 h-full min-w-0">
                  <MobileDmList />
                </div>
                <div className="hidden md:flex flex-1 h-full min-w-0">
                  <ChatArea />
                </div>
              </>
            ) : (
              /* ── Server channel ── */
              <ChatArea />
            )}

            {showThread && threadChannelId && threadMessageId && (
              <div className="hidden lg:flex">
                <ThreadSidebar
                  channelId={threadChannelId}
                  messageId={threadMessageId}
                  onClose={closeThread}
                />
              </div>
            )}

            <VoiceOverlay />
          </div>
        </div>

        {/* ── Right sidebar: MemberList — full height, mirrors left sidebar ── */}
        {showMemberList && (
          <div className="hidden lg:flex h-full shrink-0">
            <MemberList serverId={activeServerId!} />
          </div>
        )}
      </div>

      {/* Dock bar — z-50 keeps it above the sliding sidebar panel. */}
      {layoutMode === 'dock' && (
        <div
          className="relative flex items-end justify-center shrink-0 px-4 pt-2 overflow-visible z-50"
          style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))', pointerEvents: 'none' }}
        >
          <DockBar />
        </div>
      )}

      {/*
        ── Pull-tab handle — both Classic and Dock modes ──
        A slim vertical pill fixed at the right edge of the channel sidebar.
        Tap/click to open or close the sidebar from anywhere on screen.

        Classic mode:
          • Server icon rail is always 72px wide (in-flow).
          • Channel sidebar is 300px when open.
          • closed → left-[72px]  (right of icon rail, before channel list)
          • open   → left-[372px] (right of icon rail + channel list)

        Dock mode:
          • No permanent icon rail — sidebar starts at x=0.
          • closed → left-0
          • open / locked → left-[300px]
          • Desktop + normal chat (sidebar in-flow): always md:left-[300px]
      */}

      {/* ── Classic mode pull-tab ── */}
      {layoutMode === 'classic' && !showAppWindow && (
        <button
          onClick={toggleClassicChannel}
          className={cn(
            'fixed top-1/2 -translate-y-1/2 z-[60]',
            'flex flex-col items-center justify-center gap-[3.5px]',
            'opacity-40 hover:opacity-100 transition-[left,opacity] duration-200 ease-out',
            classicChannelOpen ? 'left-[372px]' : 'left-[72px]',
          )}
          style={{
            width: '14px',
            height: '52px',
            background: 'rgba(16,16,24,0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: '0 9px 9px 0',
            border: '1px solid rgba(255,255,255,0.10)',
            borderLeft: 'none',
            boxShadow: '3px 0 14px rgba(0,0,0,0.55)',
          }}
          title={classicChannelOpen ? 'Close channel list' : 'Open channel list'}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: '5px', height: '1.5px', borderRadius: '2px', background: 'rgba(255,255,255,0.75)' }} />
          ))}
        </button>
      )}

      {/* ── Dock mode pull-tab ── */}
      {layoutMode === 'dock' && !showAppWindow && (
        <button
          onClick={() => {
            if (sidebarLocked) {
              setSidebarLocked(false);
            } else if (mobileSidebarOpen) {
              setMobileSidebarOpen(false);
            } else {
              setMobileSidebarOpen(true);
            }
          }}
          className={cn(
            'fixed top-1/2 -translate-y-1/2 z-[60]',
            'flex flex-col items-center justify-center gap-[3.5px]',
            'opacity-40 hover:opacity-100 transition-[left,opacity] duration-200 ease-out',
            (sidebarLocked || mobileSidebarOpen) ? 'left-[300px]' : 'left-0',
            !showDashboard && !showAppWindow && 'md:left-[300px]',
          )}
          style={{
            width: '14px',
            height: '52px',
            background: 'rgba(16,16,24,0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: '0 9px 9px 0',
            border: '1px solid rgba(255,255,255,0.10)',
            borderLeft: 'none',
            boxShadow: '3px 0 14px rgba(0,0,0,0.55)',
          }}
          title={
            sidebarLocked ? 'Unpin sidebar' :
            mobileSidebarOpen ? 'Close sidebar' : 'Open sidebar'
          }
        >
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: '5px', height: '1.5px', borderRadius: '2px', background: 'rgba(255,255,255,0.75)' }} />
          ))}
        </button>
      )}

      {/* ── KHURK OS Picture-in-Picture window (floats above everything) ── */}
      {khurkOsEnabled && <PiPWindow />}

      {/* Modals */}
      <CreateServerModal />
      <CreateChannelModal />
      <InviteModal />
      <HelpModal />
      <ServerSettingsModal />
      <UserSettingsModal />
      <NewDmModal />

      {profileCard && (
        <UserProfileCard
          userId={profileCard.userId}
          joinedAt={profileCard.joinedAt}
          role={profileCard.role}
          position={profileCard.position}
          onClose={closeProfileCard}
        />
      )}

      <DmCallOverlay />
      <VideoCallOverlay />

      {/* ── Global notification bell — fixed top-right, always visible ── */}
      <div className="fixed top-2 right-3 z-[100]">
        <NotificationBell />
      </div>
    </div>
  );
}
