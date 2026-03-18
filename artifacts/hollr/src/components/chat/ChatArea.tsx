import { Hash, Users, Bell, Pin, Search, HelpCircle } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useListChannels, getListChannelsQueryKey } from '@workspace/api-client-react';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

export function ChatArea() {
  const { activeServerId, activeChannelId, toggleMemberList } = useAppStore();
  const { data: channels = [] } = useListChannels(activeServerId || '', {
    query: { queryKey: getListChannelsQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });

  const channel = channels.find(c => c.id === activeChannelId);

  if (!activeChannelId || !channel) {
    return (
      <div className="flex-1 bg-[#313338] flex flex-col items-center justify-center text-muted-foreground">
        <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
          <Hash size={32} className="opacity-50" />
        </div>
        <h2 className="text-xl font-bold text-foreground">No Text Channel Selected</h2>
        <p>Select a channel from the left to start chatting.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#313338] flex flex-col h-full min-w-0">
      {/* Top Header */}
      <div className="h-12 border-b border-border/10 flex items-center justify-between px-4 shrink-0 shadow-sm z-10 bg-[#313338]">
        <div className="flex items-center min-w-0">
          <Hash size={24} className="text-muted-foreground mr-2 shrink-0" />
          <h2 className="font-bold text-foreground truncate text-[15px]">{channel.name}</h2>
          {channel.topic && (
            <>
              <div className="w-[1px] h-6 bg-border/40 mx-4 shrink-0" />
              <p className="text-sm text-muted-foreground truncate">{channel.topic}</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 text-muted-foreground shrink-0 ml-4">
          <button className="hover:text-foreground transition-colors"><Bell size={20} /></button>
          <button className="hover:text-foreground transition-colors"><Pin size={20} /></button>
          <button
            onClick={toggleMemberList}
            title="Toggle member list"
            className="hover:text-foreground transition-colors"
          >
            <Users size={20} />
          </button>
          <div className="relative">
            <input
              type="text"
              placeholder="Search"
              className="bg-[#1E1F22] rounded-sm h-6 w-36 px-2 text-xs text-foreground focus:w-48 transition-all duration-300 outline-none focus:ring-1 focus:ring-primary"
            />
            <Search size={14} className="absolute right-1.5 top-1.5 opacity-50" />
          </div>
          <button className="hover:text-foreground transition-colors"><HelpCircle size={20} /></button>
        </div>
      </div>

      {/* Messages */}
      <MessageList channelId={channel.id} />

      {/* Composer */}
      <MessageComposer channelId={channel.id} />
    </div>
  );
}
