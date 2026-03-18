import { useAuth } from '@workspace/replit-auth-web';
import { useRealtime } from '@/hooks/use-realtime';
import { useAppStore } from '@/store/use-app-store';
import { ServerSidebar } from '@/components/layout/ServerSidebar';
import { ChannelSidebar } from '@/components/layout/ChannelSidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { DmChatArea } from '@/components/chat/DmChatArea';
import { MemberList } from '@/components/layout/MemberList';
import { CreateServerModal } from '@/components/modals/CreateServerModal';
import { CreateChannelModal } from '@/components/modals/CreateChannelModal';
import { InviteModal } from '@/components/modals/InviteModal';
import { VoiceOverlay } from '@/components/voice/VoiceOverlay';
import { useListDmThreads, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';

export function Layout() {
  const { user, isLoading } = useAuth();
  const { activeServerId, activeDmThreadId, memberListOpen, mobileSidebarOpen, setMobileSidebarOpen } = useAppStore();

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

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans text-foreground">

      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Left sidebar: ServerSidebar + ChannelSidebar
          - Desktop: always visible as columns
          - Mobile: slide-in overlay via fixed positioning */}
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

        {/* Member List — desktop only visible, hidden on narrow screens */}
        {activeServerId && memberListOpen && (
          <div className="hidden lg:flex">
            <MemberList serverId={activeServerId} />
          </div>
        )}
      </div>

      <VoiceOverlay />
      <CreateServerModal />
      <CreateChannelModal />
      <InviteModal />
    </div>
  );
}
