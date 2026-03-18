import { useEffect } from 'react';
import { useAuth } from '@workspace/replit-auth-web';
import { useRealtime } from '@/hooks/use-realtime';
import { ServerSidebar } from '@/components/layout/ServerSidebar';
import { ChannelSidebar } from '@/components/layout/ChannelSidebar';
import { ChatArea } from '@/components/chat/ChatArea';
import { CreateServerModal } from '@/components/modals/CreateServerModal';
import { CreateChannelModal } from '@/components/modals/CreateChannelModal';
import { VoiceOverlay } from '@/components/voice/VoiceOverlay';
import { Loader2 } from 'lucide-react';

export function Layout() {
  const { user, isLoading } = useAuth();
  
  // Establish WebSocket connection globally
  useRealtime(user?.id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-primary">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">Connecting to hollr...</p>
      </div>
    );
  }

  if (!user) return null; // Handled by App.tsx redirect

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans text-foreground">
      {/* Column 1: Servers */}
      <ServerSidebar />
      
      {/* Column 2: Channels/DMs */}
      <ChannelSidebar />
      
      {/* Column 3: Main Chat Area */}
      <ChatArea />

      {/* Floating Elements */}
      <VoiceOverlay />
      
      {/* Modals */}
      <CreateServerModal />
      <CreateChannelModal />
    </div>
  );
}
