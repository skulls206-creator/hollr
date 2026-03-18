import { useEffect } from 'react';
import { Hash, Volume2, Plus, ChevronDown, Settings, Mic, Headphones, PhoneOff } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useGetServer, useListChannels, getGetServerQueryKey, getListChannelsQueryKey } from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@workspace/replit-auth-web';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function ChannelSidebar() {
  const {
    activeServerId,
    activeChannelId,
    setActiveChannel,
    setCreateChannelModalOpen,
    voiceConnection,
    setVoiceConnection,
  } = useAppStore();
  const { user } = useAuth();

  const { data: server } = useGetServer(activeServerId || '', {
    query: { queryKey: getGetServerQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });
  const { data: channels = [] } = useListChannels(activeServerId || '', {
    query: { queryKey: getListChannelsQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  // Auto-select first text channel when switching servers
  useEffect(() => {
    if (activeServerId && textChannels.length > 0 && !activeChannelId) {
      setActiveChannel(textChannels[0].id);
    }
  }, [activeServerId, textChannels.length, activeChannelId]);

  // When the server changes, clear the active channel so the effect above fires
  useEffect(() => {
    setActiveChannel(null);
  }, [activeServerId]);

  const joinVoice = (channelId: string) => {
    setVoiceConnection({ status: 'connecting', channelId, serverId: activeServerId });
  };

  const leaveVoice = () => {
    setVoiceConnection({ status: 'disconnected', channelId: null, serverId: null });
  };

  if (!activeServerId) {
    return (
      <div className="w-[240px] bg-[#2B2D31] shrink-0 flex flex-col h-full border-r border-border/5">
        <div className="h-12 border-b border-border/10 flex items-center px-4 font-bold text-foreground shadow-sm">
          Direct Messages
        </div>
        <div className="flex-1 p-2">
          <p className="text-xs text-muted-foreground font-semibold px-2 py-2">DIRECT MESSAGES</p>
          <div className="px-2 py-4 text-center text-sm text-muted-foreground italic">
            Select a server to get started!
          </div>
        </div>
        <UserProfilePanel user={user} voiceConnection={voiceConnection} onLeaveVoice={leaveVoice} />
      </div>
    );
  }

  return (
    <div className="w-[240px] bg-[#2B2D31] shrink-0 flex flex-col h-full border-r border-border/5">
      {/* Server Header */}
      <button className="h-12 border-b border-border/10 flex items-center justify-between px-4 font-bold text-foreground hover:bg-secondary/50 transition-colors shadow-sm w-full">
        <span className="truncate">{server?.name || 'Loading…'}</span>
        <ChevronDown size={16} className="text-muted-foreground" />
      </button>

      {/* Channel List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4 no-scrollbar">

        {/* Text Channels */}
        <div>
          <div className="flex items-center justify-between px-1 mb-1 group">
            <h3 className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors flex items-center">
              <ChevronDown size={12} className="mr-1" />
              TEXT CHANNELS
            </h3>
            <button
              onClick={() => setCreateChannelModalOpen(true)}
              title="Create channel"
              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-[2px]">
            {textChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                className={cn(
                  'w-full flex items-center px-2 py-1.5 rounded-md text-sm font-medium transition-colors group',
                  activeChannelId === channel.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                <Hash size={18} className="mr-1.5 opacity-60 shrink-0" />
                <span className="truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Voice Channels */}
        <div>
          <div className="flex items-center justify-between px-1 mb-1 group">
            <h3 className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors flex items-center">
              <ChevronDown size={12} className="mr-1" />
              VOICE CHANNELS
            </h3>
            <button
              onClick={() => setCreateChannelModalOpen(true)}
              title="Create channel"
              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-[2px]">
            {voiceChannels.map((channel) => {
              const isConnected =
                voiceConnection.status !== 'disconnected' && voiceConnection.channelId === channel.id;
              return (
                <button
                  key={channel.id}
                  onClick={() => (isConnected ? leaveVoice() : joinVoice(channel.id))}
                  className={cn(
                    'w-full flex items-center px-2 py-1.5 rounded-md text-sm font-medium transition-colors group',
                    isConnected
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  <Volume2 size={18} className="mr-1.5 opacity-60 shrink-0" />
                  <span className="truncate flex-1 text-left">{channel.name}</span>
                  {isConnected && (
                    <span className="text-[10px] font-bold bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded shrink-0">
                      LIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <UserProfilePanel user={user} voiceConnection={voiceConnection} onLeaveVoice={leaveVoice} />
    </div>
  );
}

function UserProfilePanel({
  user,
  voiceConnection,
  onLeaveVoice,
}: {
  user: any;
  voiceConnection: { status: string; channelId: string | null };
  onLeaveVoice: () => void;
}) {
  if (!user) return null;
  const inVoice = voiceConnection.status !== 'disconnected';

  return (
    <div className="shrink-0 bg-[#232428]">
      {/* Voice connected banner */}
      {inVoice && (
        <div className="px-2 pt-2 pb-1">
          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400">Voice Connected</span>
            </div>
            <button
              onClick={onLeaveVoice}
              title="Leave voice"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <PhoneOff size={16} />
            </button>
          </div>
        </div>
      )}

      {/* User row */}
      <div className="h-[52px] flex items-center px-2 py-1.5 gap-2">
        <div className="flex items-center hover:bg-white/10 rounded-md p-1 cursor-pointer transition-colors flex-1 min-w-0">
          <div className="relative">
            <Avatar className="h-8 w-8 rounded-full border border-border/50">
              <AvatarImage src={user.profileImageUrl || undefined} />
              <AvatarFallback className="bg-primary text-white text-xs">
                {getInitials(user.displayName || user.firstName || 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-[2.5px] border-[#232428] rounded-full" />
          </div>
          <div className="ml-2 flex flex-col overflow-hidden">
            <span className="text-sm font-bold text-foreground truncate leading-tight">
              {user.displayName || user.firstName}
            </span>
            <span className="text-xs text-muted-foreground truncate leading-tight">
              {inVoice ? 'In Voice' : 'Online'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors">
            <Mic size={18} />
          </button>
          <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors">
            <Headphones size={18} />
          </button>
          <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
