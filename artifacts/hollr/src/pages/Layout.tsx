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
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

export function Layout() {
  const { user, isLoading } = useAuth();
  const {
    activeServerId, activeDmThreadId, memberListOpen, mobileSidebarOpen, setMobileSidebarOpen,
    threadMessageId, threadChannelId, closeThread,
    profileCard, closeProfileCard,
    pinnedPanelOpen, toggleMemberList,
    voiceConnection,
  } = useAppStore();

  // Close mobile member list on Escape
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

  return (
    // Root: flex-col so music bar sits naturally at the bottom
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden font-sans text-foreground">

      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile member list backdrop + slide-in panel */}
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

      {/* Content row — flex-1, relative so VoiceOverlay's absolute children are scoped here */}
      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">

        {/* Left sidebar */}
        <div
          className={[
            'flex h-full z-40',
            'md:relative md:translate-x-0 md:flex',
            'fixed transition-transform duration-200',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <ServerSidebar />
          <ChannelSidebar />
        </div>

        {/* Main area */}
        <div className="flex flex-1 min-w-0 h-full">
          {activeDmThreadId ? (
            <DmChatArea
              threadId={activeDmThreadId}
              recipientName={dmRecipient?.displayName || dmRecipient?.username || 'Unknown'}
              recipientAvatar={dmRecipient?.avatarUrl}
            />
          ) : (
            <ChatArea />
          )}

          {/* Thread sidebar */}
          {showThread && threadChannelId && threadMessageId && (
            <div className="hidden lg:flex">
              <ThreadSidebar
                channelId={threadChannelId}
                messageId={threadMessageId}
                onClose={closeThread}
              />
            </div>
          )}

          {/* Member List — only when no thread sidebar */}
          {showMemberList && (
            <div className="hidden lg:flex">
              <MemberList serverId={activeServerId!} />
            </div>
          )}
        </div>

        {/* VoiceOverlay lives INSIDE the content row so it can't overlap the music bar below */}
        <VoiceOverlay />
      </div>

      {/* Global music bar — flex item at the very bottom, always visible when bot is active */}
      {voiceConnection.channelId && (
        <MusicControlBar voiceChannelId={voiceConnection.channelId} />
      )}

      {/* Modals */}
      <CreateServerModal />
      <CreateChannelModal />
      <InviteModal />
      <HelpModal />
      <ServerSettingsModal />
      <UserSettingsModal />

      {/* User Profile Card */}
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
