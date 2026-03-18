import { useEffect } from 'react';
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
  const { activeServerId, activeDmThreadId, memberListOpen } = useAppStore();

  // Establish WebSocket connection globally
  useRealtime(user?.id);

  // Fetch DM threads for use in DmChatArea header info
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

  // Resolve DM thread info for the chat header
  const activeDmThread = dmThreads.find(t => t.id === activeDmThreadId);
  const dmRecipient = activeDmThread?.participants?.find((p: any) => p.id !== user.id)
    ?? activeDmThread?.participants?.[0];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans text-foreground">
      {/* Column 1: Servers */}
      <ServerSidebar />

      {/* Column 2: Channels / DMs */}
      <ChannelSidebar />

      {/* Column 3: Main Chat Area */}
      {activeDmThreadId ? (
        <DmChatArea
          threadId={activeDmThreadId}
          recipientName={dmRecipient?.displayName || dmRecipient?.username || 'Unknown'}
          recipientAvatar={dmRecipient?.avatarUrl}
        />
      ) : (
        <ChatArea />
      )}

      {/* Column 4: Member List (server only, toggleable) */}
      {activeServerId && memberListOpen && (
        <MemberList serverId={activeServerId} />
      )}

      {/* Floating Voice Overlay */}
      <VoiceOverlay />

      {/* Modals */}
      <CreateServerModal />
      <CreateChannelModal />
      <InviteModal />
    </div>
  );
}
