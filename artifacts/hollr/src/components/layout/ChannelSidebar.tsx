import { Hash, Volume2, Plus, ChevronDown, Settings, Mic, Headphones } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useGetServer, useListChannels, getGetServerQueryKey, getListChannelsQueryKey } from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@workspace/replit-auth-web';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function ChannelSidebar() {
  const { activeServerId, activeChannelId, setActiveChannel, setCreateChannelModalOpen } = useAppStore();
  const { user } = useAuth();

  // If no server is active, this column could show DMs. For now, assume it's for servers.
  const { data: server } = useGetServer(activeServerId || "", { query: { queryKey: getGetServerQueryKey(activeServerId || ""), enabled: !!activeServerId } });
  const { data: channels = [] } = useListChannels(activeServerId || "", { query: { queryKey: getListChannelsQueryKey(activeServerId || ""), enabled: !!activeServerId } });

  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  if (!activeServerId) {
    return (
      <div className="w-[240px] bg-[#2B2D31] shrink-0 flex flex-col h-full border-r border-border/5">
        <div className="h-12 border-b border-border/10 flex items-center px-4 font-bold text-foreground shadow-sm">
          Direct Messages
        </div>
        <div className="flex-1 p-2">
          <p className="text-xs text-muted-foreground font-semibold px-2 py-2">DIRECT MESSAGES</p>
          {/* DM List would go here */}
          <div className="px-2 py-4 text-center text-sm text-muted-foreground italic">
            Select a server to get started!
          </div>
        </div>
        <UserProfilePanel user={user} />
      </div>
    );
  }

  return (
    <div className="w-[240px] bg-[#2B2D31] shrink-0 flex flex-col h-full border-r border-border/5">
      {/* Server Header */}
      <button className="h-12 border-b border-border/10 flex items-center justify-between px-4 font-bold text-foreground hover:bg-secondary/50 transition-colors shadow-sm w-full">
        <span className="truncate">{server?.name || "Loading..."}</span>
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
              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-[2px]">
            {textChannels.map(channel => (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                className={cn(
                  "w-full flex items-center px-2 py-1.5 rounded-md text-sm font-medium transition-colors group",
                  activeChannelId === channel.id 
                    ? "bg-secondary text-foreground" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <Hash size={18} className="mr-1.5 opacity-60" />
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
            <button className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-[2px]">
            {voiceChannels.map(channel => (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                className={cn(
                  "w-full flex items-center px-2 py-1.5 rounded-md text-sm font-medium transition-colors group",
                  activeChannelId === channel.id 
                    ? "bg-secondary text-foreground" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <Volume2 size={18} className="mr-1.5 opacity-60" />
                <span className="truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      <UserProfilePanel user={user} />
    </div>
  );
}

function UserProfilePanel({ user }: { user: any }) {
  if (!user) return null;
  return (
    <div className="h-[52px] bg-[#232428] flex items-center px-2 py-1.5 gap-2 shrink-0">
      <div className="flex items-center hover:bg-white/10 rounded-md p-1 cursor-pointer transition-colors flex-1 min-w-0">
        <div className="relative">
          <Avatar className="h-8 w-8 rounded-full border border-border/50">
            <AvatarImage src={user.profileImageUrl || undefined} />
            <AvatarFallback className="bg-primary text-white text-xs">{getInitials(user.displayName || user.firstName || "U")}</AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-[2.5px] border-[#232428] rounded-full" />
        </div>
        <div className="ml-2 flex flex-col overflow-hidden">
          <span className="text-sm font-bold text-foreground truncate leading-tight">{user.displayName || user.firstName}</span>
          <span className="text-xs text-muted-foreground truncate leading-tight">Online</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors"><Mic size={18} /></button>
        <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors"><Headphones size={18} /></button>
        <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors"><Settings size={18} /></button>
      </div>
    </div>
  )
}
