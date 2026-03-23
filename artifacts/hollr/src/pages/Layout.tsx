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
import { useListDmThreads, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import { MobileDmList } from '@/components/layout/MobileDmList';
import { DockBar } from '@/components/layout/DockBar';
import { NewDmModal } from '@/components/modals/NewDmModal';
import { AppWindow } from '@/components/khurk/AppWindow';
import { PiPWindow } from '@/components/khurk/PiPWindow';
import { DashboardView } from '@/components/khurk/DashboardView';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { pendingNav, applyNav } from '@/lib/notification-nav';

export function Layout() {
  const { user, isLoading } = useAuth();
  const {
    activeServerId, activeDmThreadId, memberListOpen, mobileSidebarOpen, setMobileSidebarOpen,
    threadMessageId, threadChannelId, closeThread,
    profileCard, closeProfileCard,
    pinnedPanelOpen, toggleMemberList,
    voiceConnection, layoutMode,
    activeKhurkAppId, khurkPipMode, khurkDashboardOnStartup,
  } = useAppStore();

  const navApplied = useRef(false);
  useEffect(() => {
    if (!isLoading && user && !navApplied.current && pendingNav) {
      navApplied.current = true;
      applyNav(pendingNav);
    }
  }, [isLoading, user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && memberListOpen) toggleMemberList(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [memberListOpen, toggleMemberList]);

  useRealtime(user?.id);

  const { data: dmThreads = [] } = useListDmThreads({
    query: { queryKey: getListDmThreadsQueryKey() },
  });

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
  const showAppWindow = !!(activeKhurkAppId && !khurkPipMode);

  // Dashboard: shown when no active KHURK app (or in PiP), no DM, no server, and pref is on
  const showDashboard = khurkDashboardOnStartup && !activeKhurkAppId && !activeDmThreadId && !activeServerId;

  return (
    /*
      Root: flex-col so the dock sticks to the bottom.
      Inside: one flex row that fills all remaining space.
        • Left: sidebar column — full height from top to bottom
        • Right: flex-col column — music bar (top) + chat row (fill)
      The music bar only spans the right column, so sidebars go to the very top.
    */
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden font-sans text-foreground">

      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
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

        {/* ── Left sidebar — full height ──
            On mobile the sidebar is `fixed` (full viewport) which would bleed
            behind the dock. In dock mode we pin its bottom to the dock height
            (~78px: 8px pt + 60px pill + 10px pb) so it never overlaps the dock.
            On desktop (md:relative) the flex row already stops above the dock. */}
        <div
          className={[
            'flex z-40 shrink-0',
            'md:relative md:translate-x-0 md:h-full',
            'fixed transition-transform duration-200',
            layoutMode === 'dock' ? 'bottom-[78px] md:bottom-0 h-[calc(100%-78px)] md:h-full' : 'h-full bottom-0',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          ].join(' ')}
        >
          {layoutMode === 'classic' && <ServerSidebar />}
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
              <DashboardView />
            ) : activeDmThreadId ? (
              /* ── DM chat ── */
              <DmChatArea
                threadId={activeDmThreadId}
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
          style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}
        >
          <DockBar />
        </div>
      )}

      {/* ── KHURK OS Picture-in-Picture window (floats above everything) ── */}
      <PiPWindow />

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
    </div>
  );
}
