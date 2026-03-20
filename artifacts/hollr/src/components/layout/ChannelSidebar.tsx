import { useEffect, useState } from 'react';
import {
  Hash, Volume2, Plus, ChevronDown, Settings, Mic, MicOff, Headphones, VolumeX,
  PhoneOff, UserPlus, LogOut, MessageSquarePlus, Trash2, Pencil, Check, X, AudioLines,
  Smile, MessageSquare, AtSign,
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import {
  useGetServer, useListChannels, useListDmThreads,
  getGetServerQueryKey, getListChannelsQueryKey, getListDmThreadsQueryKey,
  useDeleteChannel, useUpdateChannel,
  useGetMyProfile, useUpdateMyProfile,
} from '@workspace/api-client-react';
import type { VoiceChannelUser } from '@/store/use-app-store';
import { cn, getInitials } from '@/lib/utils';
import { useAuth } from '@workspace/replit-auth-web';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { Channel } from '@workspace/api-client-react';

const BASE = import.meta.env.BASE_URL;

async function fetchUnread(serverId: string): Promise<{ channelId: string; count: number }[]> {
  const res = await fetch(`${BASE}api/servers/${serverId}/unread`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

async function markChannelRead(channelId: string) {
  await fetch(`${BASE}api/channels/${channelId}/read`, { method: 'POST', credentials: 'include' });
}

export function ChannelSidebar() {
  const {
    activeServerId, activeChannelId, activeDmThreadId,
    setActiveChannel, setActiveDmThread,
    setCreateChannelModalOpen, setInviteModalOpen, setServerSettingsModalOpen,
    voiceConnection, setVoiceConnection, voiceChannelUsers,
    unreadCounts, setUnreadCount, clearUnreadCount,
    voiceVolumes, setVoiceVolume,
    triggerMention,
  } = useAppStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState('');

  // Fetch initial unread counts from server when activeServerId changes
  const { data: unreadData } = useQuery({
    queryKey: ['unread', activeServerId],
    queryFn: () => fetchUnread(activeServerId!),
    enabled: !!activeServerId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!unreadData) return;
    unreadData.forEach(({ channelId, count }) => setUnreadCount(channelId, count));
  }, [unreadData]);

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

  const handleSelectChannel = (channelId: string) => {
    setActiveChannel(channelId);
    clearUnreadCount(channelId);
    markChannelRead(channelId).catch(() => {});
    // Invalidate unread query so next server visit is accurate
    qc.invalidateQueries({ queryKey: ['unread', activeServerId] });
  };

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
                    onClick={() => handleSelectChannel(channel.id)}
                    className="flex items-center flex-1 min-w-0 text-left"
                  >
                    <Hash size={18} className="mr-1.5 opacity-60 shrink-0" />
                    <span className={cn("truncate text-sm", unreadCounts[channel.id] ? "font-bold text-foreground" : "font-medium")}>
                      {channel.name}
                    </span>
                    {!!unreadCounts[channel.id] && (
                      <span className="ml-auto mr-1 min-w-[18px] h-[18px] px-1 bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                        {unreadCounts[channel.id] > 99 ? '99+' : unreadCounts[channel.id]}
                      </span>
                    )}
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
              const channelUsers = voiceChannelUsers[channel.id] ?? [];
              const isLive = channelUsers.length > 0;
              return (
                <div key={channel.id}>
                  <div className={cn(
                    'group/vch flex items-center px-2 py-1.5 rounded-md transition-colors',
                    isConnected
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      : isLive
                        ? 'text-foreground hover:bg-secondary/50'
                        : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}>
                    {editingChannelId === channel.id ? (
                      <>
                        <Volume2 size={18} className="mr-1.5 opacity-60 shrink-0" />
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
                      <>
                        <button
                          onClick={() => isConnected ? leaveVoice() : joinVoice(channel.id)}
                          className="flex items-center flex-1 min-w-0 text-left text-sm font-medium"
                        >
                          <Volume2 size={18} className="mr-1.5 opacity-60 shrink-0" />
                          <span className="truncate flex-1">{channel.name}</span>
                          {isLive && (
                            <span className="text-[10px] font-bold bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded shrink-0 mr-1">
                              LIVE
                            </span>
                          )}
                        </button>
                        {!editingChannelId && isOwnerOrAdmin && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover/vch:opacity-100 transition-opacity shrink-0 ml-1">
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
                      </>
                    )}
                  </div>

                  {/* Connected user list under channel */}
                  {channelUsers.length > 0 && (
                    <div className="ml-4 mt-0.5 mb-1 space-y-0.5">
                      {channelUsers.map(u => (
                        <VoiceSidebarUser
                          key={u.userId}
                          user={u}
                          isSelf={u.userId === user?.id}
                          volume={voiceVolumes[u.userId] ?? 1}
                          onVolumeChange={(v) => setVoiceVolume(u.userId, v)}
                          onMention={() => triggerMention(u.displayName)}
                          onOpenDm={(threadId) => setActiveDmThread(threadId)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <UserProfilePanel user={user} voiceConnection={voiceConnection} onLeaveVoice={leaveVoice} />
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: 'online',  label: 'Online',          color: 'bg-emerald-500' },
  { value: 'idle',    label: 'Away',             color: 'bg-yellow-400' },
  { value: 'dnd',     label: 'Do Not Disturb',   color: 'bg-red-500' },
  { value: 'offline', label: 'Invisible',        color: 'bg-zinc-500' },
] as const;

function statusColor(status: string | undefined) {
  switch (status) {
    case 'online':  return 'bg-emerald-500';
    case 'idle':    return 'bg-yellow-400';
    case 'dnd':     return 'bg-red-500';
    case 'offline': return 'bg-zinc-500';
    default:        return 'bg-emerald-500';
  }
}

function statusLabel(status: string | undefined) {
  switch (status) {
    case 'online':  return 'Online';
    case 'idle':    return 'Away';
    case 'dnd':     return 'Do Not Disturb';
    case 'offline': return 'Invisible';
    default:        return 'Online';
  }
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
  const { micMuted, deafened, toggleMicMuted, toggleDeafened, setUserSettingsModalOpen } = useAppStore();
  const { logout } = useAuth();
  const { data: profile } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();
  const qcPanel = useQueryClient();
  const [statusOpen, setStatusOpen] = useState(false);
  const [customStatusInput, setCustomStatusInput] = useState('');
  const [editingCustom, setEditingCustom] = useState(false);

  useEffect(() => {
    setCustomStatusInput(profile?.customStatus ?? '');
  }, [profile?.customStatus]);

  if (!user) return null;
  const inVoice = voiceConnection.status !== 'disconnected';
  const currentStatus = profile?.status ?? 'online';

  const handleStatusChange = (status: string) => {
    updateProfile.mutate(
      { data: { status: status as any } },
      { onSuccess: () => qcPanel.invalidateQueries({ queryKey: ['/api/users/me'] }) },
    );
    setStatusOpen(false);
  };

  const handleSaveCustomStatus = () => {
    updateProfile.mutate(
      { data: { customStatus: customStatusInput.trim() || null } },
      {
        onSuccess: () => {
          qcPanel.invalidateQueries({ queryKey: ['/api/users/me'] });
          setEditingCustom(false);
        },
      },
    );
  };

  const handleClearCustomStatus = () => {
    setCustomStatusInput('');
    updateProfile.mutate(
      { data: { customStatus: null } },
      { onSuccess: () => qcPanel.invalidateQueries({ queryKey: ['/api/users/me'] }) },
    );
  };

  const displayName = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || 'You';

  return (
    <div className="shrink-0 bg-[#232428]">
      {inVoice && (
        <div className="px-2 pt-2 pb-1">
          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400">Voice Connected</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                title="Noise suppression active"
                className="flex items-center gap-1 text-emerald-400/80 cursor-default"
              >
                <AudioLines size={13} />
                <span className="text-[10px] font-semibold tracking-wide">NS</span>
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
        </div>
      )}

      <div className="h-[52px] flex items-center px-2 py-1.5 gap-2">
        {/* Username area — click to pick status */}
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center hover:bg-white/10 rounded-md p-1 cursor-pointer transition-colors flex-1 min-w-0 text-left">
              <div className="relative shrink-0">
                <Avatar className="h-8 w-8 rounded-full border border-border/50">
                  <AvatarImage src={profile?.avatarUrl || user.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary text-white text-xs">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-[2.5px] border-[#232428] rounded-full",
                  statusColor(inVoice ? 'online' : currentStatus)
                )} />
              </div>
              <div className="ml-2 flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-foreground truncate leading-tight">
                  {displayName}
                </span>
                <span className="text-xs text-muted-foreground truncate leading-tight">
                  {inVoice
                    ? 'In Voice'
                    : profile?.customStatus
                      ? profile.customStatus
                      : statusLabel(currentStatus)}
                </span>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="w-52 p-1.5 bg-[#111214] border-border/50"
            sideOffset={8}
          >
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1 pb-1.5">
              Set Status
            </p>
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-white/10",
                  currentStatus === opt.value && "bg-white/5 font-semibold"
                )}
              >
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", opt.color)} />
                <span>{opt.label}</span>
                {currentStatus === opt.value && (
                  <Check size={13} className="ml-auto text-primary" />
                )}
              </button>
            ))}

            {/* Custom status section */}
            <div className="my-1 h-px bg-border/40" />
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1 pb-1.5">
              Custom Status
            </p>

            {!editingCustom ? (
              <button
                onClick={() => setEditingCustom(true)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-white/10 text-left"
              >
                <Smile size={14} className="shrink-0 text-muted-foreground" />
                <span className={profile?.customStatus ? 'text-foreground' : 'text-muted-foreground italic'}>
                  {profile?.customStatus || 'Set a custom status…'}
                </span>
                {profile?.customStatus && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleClearCustomStatus(); }}
                    className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </button>
            ) : (
              <div className="px-2 pb-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={customStatusInput}
                  onChange={(e) => setCustomStatusInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCustomStatus();
                    if (e.key === 'Escape') setEditingCustom(false);
                  }}
                  maxLength={128}
                  placeholder="What's your status?"
                  className="w-full rounded-md bg-[#1a1b1e] border border-border/50 text-sm text-foreground px-2.5 py-1.5 focus:outline-none focus:border-primary placeholder:text-muted-foreground"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={handleSaveCustomStatus}
                    disabled={updateProfile.isPending}
                    className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Check size={12} />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingCustom(false)}
                    className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-white/5 text-muted-foreground text-xs font-semibold hover:bg-white/10 transition-colors"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={toggleMicMuted}
            title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              micMuted
                ? "text-destructive hover:bg-destructive/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/10"
            )}
          >
            {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            onClick={toggleDeafened}
            title={deafened ? 'Undeafen' : 'Deafen (mute all audio)'}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              deafened
                ? "text-destructive hover:bg-destructive/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/10"
            )}
          >
            {deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <button
            onClick={() => setUserSettingsModalOpen(true)}
            title="User Settings"
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={logout}
            title="Sign Out"
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function VoiceSidebarUser({
  user: u, isSelf, volume, onVolumeChange, onMention, onOpenDm,
}: {
  user: VoiceChannelUser;
  isSelf: boolean;
  volume: number;
  onVolumeChange: (v: number) => void;
  onMention: () => void;
  onOpenDm: (threadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const qc = useQueryClient();

  const handleDm = async () => {
    if (isSelf || dmLoading) return;
    setDmLoading(true);
    try {
      const res = await fetch(`${BASE}api/dms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: u.userId }),
      });
      if (!res.ok) throw new Error('Failed to open DM');
      const thread = await res.json();
      qc.setQueryData(getListDmThreadsQueryKey(), (old: any[]) => {
        const existing = (old || []).filter((t: any) => t.id !== thread.id);
        return [...existing, thread];
      });
      onOpenDm(thread.id);
      setOpen(false);
    } catch (err) {
      console.error('[VoiceSidebarUser] DM open failed:', err);
    } finally {
      setDmLoading(false);
    }
  };

  const handleMention = () => {
    onMention();
    setOpen(false);
  };

  const volumePct = Math.round(volume * 100);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer hover:bg-white/5 transition-colors group/vu">
          <div className={cn(
            'relative shrink-0 rounded-full transition-all duration-150',
            u.speaking
              ? 'ring-2 ring-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
              : 'ring-2 ring-transparent'
          )}>
            <Avatar className="h-5 w-5">
              <AvatarImage src={u.avatarUrl || undefined} />
              <AvatarFallback className={cn('text-white text-[9px]', u.isBot ? 'bg-violet-600' : 'bg-primary')}>
                {u.isBot ? '♪' : getInitials(u.displayName)}
              </AvatarFallback>
            </Avatar>
            {u.isBot && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-violet-500 rounded-full border border-[#232428] flex items-center justify-center">
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate flex-1">{u.displayName}</span>
          {u.muted
            ? <MicOff size={11} className="text-destructive shrink-0" />
            : <Mic size={11} className="text-muted-foreground/50 shrink-0" />
          }
        </div>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-64 p-3 bg-[#111214] border-border/30">
        <div className="flex items-center gap-2 mb-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={u.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-white text-sm">{getInitials(u.displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{u.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
          </div>
        </div>

        {!isSelf && (
          <>
            {/* Volume slider */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Volume2 size={11} /> Volume
                </span>
                <span className="text-xs font-mono text-muted-foreground">{volumePct}%</span>
              </div>
              <Slider
                min={0} max={2} step={0.01}
                value={[volume]}
                onValueChange={([v]) => onVolumeChange(v)}
                className="w-full"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleDm}
                disabled={dmLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-white/5 hover:bg-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <MessageSquare size={12} />
                Message
              </button>
              <button
                onClick={handleMention}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-white/5 hover:bg-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <AtSign size={12} />
                Mention
              </button>
            </div>
          </>
        )}

        {isSelf && (
          <p className="text-xs text-muted-foreground text-center">(You)</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
