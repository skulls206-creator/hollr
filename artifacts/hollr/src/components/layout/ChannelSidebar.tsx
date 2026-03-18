import { useEffect, useState } from 'react';
import {
  Hash, Volume2, Plus, ChevronDown, Settings, Mic, Headphones,
  PhoneOff, UserPlus, LogOut, MessageSquarePlus, Trash2, Pencil, Check, X
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import {
  useGetServer, useListChannels, useListDmThreads,
  getGetServerQueryKey, getListChannelsQueryKey, getListDmThreadsQueryKey,
  useDeleteChannel, useUpdateChannel,
} from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@workspace/replit-auth-web';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { Channel } from '@workspace/api-client-react';

export function ChannelSidebar() {
  const {
    activeServerId, activeChannelId, activeDmThreadId,
    setActiveChannel, setActiveDmThread,
    setCreateChannelModalOpen, setInviteModalOpen, setServerSettingsModalOpen,
    voiceConnection, setVoiceConnection,
  } = useAppStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState('');

  const { data: server } = useGetServer(activeServerId || '', {
    query: { queryKey: getGetServerQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });
  const { data: channels = [] } = useListChannels(activeServerId || '', {
    query: { queryKey: getListChannelsQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });
  const { data: dmThreads = [] } = useListDmThreads({
    query: { queryKey: getListDmThreadsQueryKey() },
  });

  const { mutate: deleteChannel } = useDeleteChannel();
  const { mutate: updateChannel } = useUpdateChannel();

  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  useEffect(() => {
    if (activeServerId && textChannels.length > 0 && !activeChannelId) {
      setActiveChannel(textChannels[0].id);
    }
  }, [activeServerId, textChannels.length, activeChannelId]);

  useEffect(() => {
    setActiveChannel(null);
  }, [activeServerId]);

  const joinVoice = (channelId: string) => setVoiceConnection({ status: 'connecting', channelId, serverId: activeServerId });
  const leaveVoice = () => setVoiceConnection({ status: 'disconnected', channelId: null, serverId: null });

  const isOwnerOrAdmin = server?.ownerId === user?.id || false;

  const startEditChannel = (channel: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChannelId(channel.id);
    setEditChannelName(channel.name);
  };

  const saveChannelEdit = (channel: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editChannelName.trim() || !activeServerId) return;
    updateChannel(
      { serverId: activeServerId, channelId: channel.id, data: { name: editChannelName.trim() } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListChannelsQueryKey(activeServerId) });
          setEditingChannelId(null);
          toast({ title: 'Channel renamed' });
        },
        onError: () => toast({ title: 'Failed to rename channel', variant: 'destructive' }),
      }
    );
  };

  const handleDeleteChannel = (channel: Channel, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeServerId) return;
    if (!confirm(`Delete #${channel.name}? This cannot be undone.`)) return;
    deleteChannel(
      { serverId: activeServerId, channelId: channel.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListChannelsQueryKey(activeServerId) });
          if (activeChannelId === channel.id) setActiveChannel(null);
          toast({ title: `#${channel.name} deleted` });
        },
        onError: () => toast({ title: 'Failed to delete channel', variant: 'destructive' }),
      }
    );
  };

  if (!activeServerId) {
    return (
      <div className="w-[240px] bg-[#2B2D31] shrink-0 flex flex-col h-full border-r border-border/5">
        <div className="h-12 border-b border-border/10 flex items-center px-4 font-bold text-foreground shadow-sm">
          Direct Messages
        </div>
        <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
          <div className="flex items-center justify-between px-2 py-2">
            <p className="text-xs text-muted-foreground font-semibold">DIRECT MESSAGES</p>
            <button title="Open DM" className="text-muted-foreground hover:text-foreground transition-colors">
              <MessageSquarePlus size={14} />
            </button>
          </div>
          {dmThreads.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground italic">No DMs yet.</p>
          )}
          {dmThreads.map(thread => {
            const other = thread.participants?.find((p: any) => p.id !== user?.id) ?? thread.participants?.[0];
            return (
              <button
                key={thread.id}
                onClick={() => setActiveDmThread(thread.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors',
                  activeDmThreadId === thread.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={other?.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary text-white text-xs">
                      {getInitials(other?.displayName || other?.username || '?')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#2B2D31] rounded-full" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="truncate text-sm font-medium">{other?.displayName || other?.username || 'Unknown'}</p>
                  {thread.lastMessage && (
                    <p className="text-[11px] text-muted-foreground truncate">{thread.lastMessage.content}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <UserProfilePanel user={user} voiceConnection={voiceConnection} onLeaveVoice={leaveVoice} />
      </div>
    );
  }

  return (
    <div className="w-[240px] bg-[#2B2D31] shrink-0 flex flex-col h-full border-r border-border/5">
      {/* Server Header with dropdown */}
      <div className="relative">
        <button
          onClick={() => setServerMenuOpen(o => !o)}
          className="h-12 border-b border-border/10 flex items-center justify-between px-4 font-bold text-foreground hover:bg-secondary/50 transition-colors shadow-sm w-full"
        >
          <span className="truncate">{server?.name || 'Loading…'}</span>
          <ChevronDown size={16} className={cn("text-muted-foreground transition-transform", serverMenuOpen && "rotate-180")} />
        </button>
        {serverMenuOpen && (
          <div className="absolute top-full left-0 right-0 z-50 bg-[#111214] border border-border/20 rounded-lg shadow-2xl py-1 mx-2 mt-1">
            <button
              onClick={() => { setInviteModalOpen(true); setServerMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-indigo-400 hover:bg-indigo-500/10 transition-colors font-medium"
            >
              <UserPlus size={16} />
              Invite People
            </button>
            {isOwnerOrAdmin && (
              <button
                onClick={() => { setServerSettingsModalOpen(true); setServerMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <Settings size={16} />
                Server Settings
              </button>
            )}
            <button
              onClick={() => { setCreateChannelModalOpen(true); setServerMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Plus size={16} />
              Create Channel
            </button>
            <div className="h-[1px] bg-border/20 my-1" />
            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
              <LogOut size={16} />
              Leave Server
            </button>
          </div>
        )}
      </div>

      {/* Channel List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4 no-scrollbar" onClick={() => setServerMenuOpen(false)}>

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
            {textChannels.map(channel => (
              <div
                key={channel.id}
                className={cn(
                  'group/ch flex items-center px-2 py-1.5 rounded-md transition-colors',
                  activeChannelId === channel.id
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                {editingChannelId === channel.id ? (
                  <>
                    <Hash size={18} className="mr-1.5 opacity-60 shrink-0" />
                    <input
                      autoFocus
                      value={editChannelName}
                      onChange={e => setEditChannelName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveChannelEdit(channel, e as any);
                        if (e.key === 'Escape') setEditingChannelId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-[#1E1F22] text-foreground text-sm px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button onClick={e => saveChannelEdit(channel, e)} className="ml-1 text-primary hover:text-primary/80">
                      <Check size={12} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setEditingChannelId(null); }} className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setActiveChannel(channel.id)}
                    className="flex items-center flex-1 min-w-0 text-left"
                  >
                    <Hash size={18} className="mr-1.5 opacity-60 shrink-0" />
                    <span className="truncate text-sm font-medium">{channel.name}</span>
                  </button>
                )}
                {!editingChannelId && isOwnerOrAdmin && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/ch:opacity-100 transition-opacity shrink-0 ml-1">
                    <button
                      onClick={e => startEditChannel(channel, e)}
                      title="Rename channel"
                      className="p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={e => handleDeleteChannel(channel, e)}
                      title="Delete channel"
                      className="p-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
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
            {voiceChannels.map(channel => {
              const isConnected = voiceConnection.status !== 'disconnected' && voiceConnection.channelId === channel.id;
              return (
                <button
                  key={channel.id}
                  onClick={() => isConnected ? leaveVoice() : joinVoice(channel.id)}
                  className={cn(
                    'w-full flex items-center px-2 py-1.5 rounded-md text-sm font-medium transition-colors',
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
              {user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || 'You'}
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
