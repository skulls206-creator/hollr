import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Hash, Volume2, Plus, ChevronDown, ChevronUp, Settings, Mic, MicOff, Headphones, VolumeX,
  PhoneOff, UserPlus, LogOut, MessageSquarePlus, Trash2, Pencil, Check, X, AudioLines,
  Smile, MessageSquare, AtSign, MonitorDown, Share2, Bell, BellOff, Copy, User, PhoneCall,
  Volume1, VolumeOff, LayoutGrid, PanelLeft, CheckCheck, Camera, RefreshCw, Menu, Search, Video,
} from 'lucide-react';
import { sendDmCallSignal } from '@/hooks/use-realtime';
import { initiateVideoCall } from '@/hooks/use-video-call';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useKhurkDismissals } from '@/hooks/use-khurk-dismissals';
import { useAppStore } from '@/store/use-app-store';
import {
  useGetServer, useListChannels, useListDmThreads,
  getGetServerQueryKey, getListChannelsQueryKey, getListDmThreadsQueryKey,
  getListServerMembersQueryKey, useListServerMembers,
  useDeleteChannel, useUpdateChannel,
  useGetMyProfile, useUpdateMyProfile,
  type Member,
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
    dmUnreadCounts, clearDmUnreadCount,
    voiceVolumes, setVoiceVolume,
    triggerMention,
    layoutMode, setClassicChannelOpen, setMobileSidebarOpen, sidebarLocked,
  } = useAppStore();

  // Always closes (never opens) the sidebar — the pull-tab is how you reopen it.
  // Using set(false) instead of toggle() prevents the bug where tapping the
  // hamburger while the sidebar is already hidden opens it a second time on
  // top of the content that is already showing the same view (e.g. DMs twice).
  const closeSidebar = () => {
    if (layoutMode === 'classic') setClassicChannelOpen(false);
    else setMobileSidebarOpen(false);
  };

  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState('');

  // DM search state
  const [dmSearch, setDmSearch] = useState('');
  const [dmSearchActive, setDmSearchActive] = useState(false);
  const [dmMsgResults, setDmMsgResults] = useState<any[]>([]);
  const [dmSearching, setDmSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSearch = useCallback(() => {
    setDmSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, []);

  const closeSearch = useCallback(() => {
    setDmSearchActive(false);
    setDmSearch('');
    setDmMsgResults([]);
    setDmSearching(false);
  }, []);

  const handleDmSearchChange = useCallback((q: string) => {
    setDmSearch(q);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (q.trim().length < 2) { setDmMsgResults([]); setDmSearching(false); return; }
    setDmSearching(true);
    searchDebounce.current = setTimeout(async () => {
      try {
        const base = import.meta.env.BASE_URL;
        const res = await fetch(`${base}api/dms/search?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' });
        if (res.ok) setDmMsgResults(await res.json());
      } catch {}
      setDmSearching(false);
    }, 350);
  }, []);

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
    query: { queryKey: getListDmThreadsQueryKey(), refetchInterval: 5000, refetchIntervalInBackground: false },
  });

  const { mutate: deleteChannel } = useDeleteChannel();
  const { mutate: updateChannel } = useUpdateChannel();
  const push = usePushNotifications();

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

  const { show: showMenu } = useContextMenu();
  const { openProfileCard } = useAppStore();

  const { data: serverMembers = [] } = useListServerMembers(activeServerId || '', {
    query: { queryKey: getListServerMembersQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });
  const myMemberRole = serverMembers.find((m: Member) => m.userId === user?.id)?.role ?? null;
  const isOwnerOrAdmin = server?.ownerId === user?.id || myMemberRole === 'admin';

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

  const handleVoiceChannelContextMenu = (e: React.MouseEvent, channel: Channel) => {
    e.preventDefault();
    const isConnected = voiceConnection.status !== 'disconnected' && voiceConnection.channelId === channel.id;
    showMenu({
      x: e.clientX,
      y: e.clientY,
      actions: [
        {
          id: 'join-leave',
          label: isConnected ? 'Leave Voice' : 'Join Voice',
          icon: isConnected ? <PhoneOff size={14} /> : <PhoneCall size={14} />,
          onClick: () => isConnected ? leaveVoice() : joinVoice(channel.id),
        },
        {
          id: 'copy-name',
          label: 'Copy Channel Name',
          icon: <Copy size={14} />,
          onClick: () => navigator.clipboard.writeText(channel.name),
        },
        {
          id: 'rename',
          label: 'Rename Channel',
          icon: <Pencil size={14} />,
          onClick: () => { setEditingChannelId(channel.id); setEditChannelName(channel.name); },
          disabled: !isOwnerOrAdmin,
          dividerBefore: true,
        },
        {
          id: 'delete',
          label: 'Delete Channel',
          icon: <Trash2 size={14} />,
          onClick: () => handleDeleteChannel(channel, { stopPropagation: () => {} } as any),
          danger: true,
          disabled: !isOwnerOrAdmin,
        },
      ],
    });
  };

  const handleDmContextMenu = (e: React.MouseEvent, thread: any, other: any) => {
    e.preventDefault();
    const cx = e.clientX;
    const cy = e.clientY;
    showMenu({
      x: cx,
      y: cy,
      actions: [
        {
          id: 'open',
          label: 'Open DM',
          icon: <MessageSquare size={14} />,
          onClick: () => { setActiveDmThread(thread.id); clearDmUnreadCount(thread.id); },
        },
        {
          id: 'voice-call',
          label: 'Voice Call',
          icon: <PhoneCall size={14} />,
          onClick: () => {
            const { setDmCallState, setActiveDmThread: setThread } = useAppStore.getState();
            const authUser = user;
            setThread(thread.id);
            setDmCallState({
              state: 'outgoing_ringing',
              targetUserId: other.id,
              targetDisplayName: other.displayName || other.username,
              targetAvatarUrl: other.avatarUrl ?? null,
              dmThreadId: thread.id,
              minimized: false,
              startedAt: null,
            });
            sendDmCallSignal({
              type: 'call_ring',
              targetId: other.id,
              callerId: authUser?.id,
              callerName: (authUser as any)?.displayName || (authUser as any)?.username || 'Someone',
              callerAvatar: (authUser as any)?.avatarUrl ?? null,
              dmThreadId: thread.id,
            });
          },
        },
        {
          id: 'video-call',
          label: 'Video Call',
          icon: <Video size={14} />,
          onClick: () => {
            const authUser = user;
            useAppStore.getState().setActiveDmThread(thread.id);
            initiateVideoCall(
              other.id,
              other.displayName || other.username,
              other.avatarUrl ?? null,
              thread.id,
              {
                id: authUser?.id ?? '',
                displayName: (authUser as any)?.displayName || (authUser as any)?.username || 'Someone',
                avatarUrl: (authUser as any)?.avatarUrl ?? null,
              },
            );
          },
        },
        {
          id: 'view-profile',
          label: 'View Profile',
          icon: <User size={14} />,
          onClick: () => openProfileCard({ userId: other.id, position: { x: cx, y: cy } }),
          dividerBefore: true,
        },
        {
          id: 'mark-read',
          label: 'Mark as Read',
          icon: <Check size={14} />,
          onClick: () => clearDmUnreadCount(thread.id),
        },
        {
          id: 'copy-username',
          label: 'Copy Username',
          icon: <Copy size={14} />,
          onClick: () => navigator.clipboard.writeText(other.username || other.displayName || ''),
        },
      ],
    });
  };

  if (!activeServerId) {
    // Filter threads by search query (client-side username match)
    const filteredThreads = dmSearch.trim()
      ? dmThreads.filter(thread => {
          const other = thread.participants?.find((p: any) => p.id !== user?.id) ?? thread.participants?.[0];
          const name = (other?.displayName || other?.username || '').toLowerCase();
          return name.includes(dmSearch.toLowerCase());
        })
      : dmThreads;

    return (
      <div className="w-[300px] bg-surface-2 shrink-0 flex flex-col h-full border-r border-border/5">
        {/* ── Header: title ↔ search input ── */}
        <div className="h-12 border-b border-border/10 flex items-center pl-2 pr-3 shadow-sm shrink-0">
          {dmSearchActive ? (
            /* Search active: full-width input */
            <div className="flex-1 flex items-center gap-2 bg-surface-0 rounded-lg px-2.5 py-1.5 border border-primary/30">
              <Search size={13} className="text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                value={dmSearch}
                onChange={e => handleDmSearchChange(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && closeSearch()}
                placeholder="Search messages & users…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none min-w-0"
              />
              {dmSearch && (
                <button onClick={() => { setDmSearch(''); setDmMsgResults([]); }} className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                  <X size={13} />
                </button>
              )}
              <button onClick={closeSearch} className="text-muted-foreground hover:text-foreground text-xs font-medium shrink-0 pl-1 transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            /* Normal: title + icons */
            <>
              <button
                onClick={closeSidebar}
                title="Close sidebar"
                className="p-1.5 mr-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors shrink-0"
              >
                <Menu size={16} />
              </button>
              <span
                className="flex-1 font-bold text-foreground cursor-pointer select-none hover:text-primary/80 transition-colors"
                onClick={openSearch}
                title="Search messages & users"
              >
                Direct Messages
              </span>
              <button
                onClick={openSearch}
                title="Search messages & users"
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors shrink-0"
              >
                <Search size={15} />
              </button>
              <button
                title="New Direct Message"
                onClick={() => useAppStore.getState().setNewDmModalOpen(true)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors shrink-0"
              >
                <MessageSquarePlus size={15} />
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
          {/* ── Message search results ── */}
          {dmSearchActive && dmSearch.trim().length >= 2 && (
            <div className="mb-2">
              {dmSearching && (
                <p className="px-2 py-2 text-xs text-muted-foreground animate-pulse">Searching messages…</p>
              )}
              {!dmSearching && dmMsgResults.length > 0 && (
                <div className="mb-3">
                  <p className="px-2 pb-1 text-[10px] font-black tracking-widest text-muted-foreground/50 uppercase">Messages</p>
                  {dmMsgResults.map((result: any) => {
                    const other = result.thread?.participants?.find((p: any) => p.id !== user?.id) ?? result.thread?.participants?.[0];
                    return result.messages?.map((msg: any) => (
                      <button
                        key={msg.id}
                        onClick={() => { setActiveDmThread(result.thread.id); closeSearch(); if (!sidebarLocked) closeSidebar(); }}
                        className="w-full flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-secondary/50 transition-colors text-left"
                      >
                        <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                          <AvatarImage src={other?.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary text-white text-xs">
                            {getInitials(other?.displayName || other?.username || '?')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{other?.displayName || other?.username}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{msg.content}</p>
                        </div>
                      </button>
                    ));
                  })}
                </div>
              )}
              {!dmSearching && dmMsgResults.length === 0 && dmSearch.trim().length >= 2 && filteredThreads.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground italic">No results for "{dmSearch}"</p>
              )}
              {filteredThreads.length > 0 && (
                <p className="px-2 pb-1 text-[10px] font-black tracking-widest text-muted-foreground/50 uppercase">People</p>
              )}
            </div>
          )}

          {!dmSearchActive && dmThreads.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground italic">No DMs yet.</p>
          )}
          {filteredThreads.map(thread => {
            const other = thread.participants?.find((p: any) => p.id !== user?.id) ?? thread.participants?.[0];
            const dmUnread = dmUnreadCounts[thread.id] ?? 0;
            return (
              <button
                key={thread.id}
                onClick={() => {
                  setActiveDmThread(thread.id);
                  clearDmUnreadCount(thread.id);
                  if (!sidebarLocked) closeSidebar();
                }}
                onContextMenu={e => handleDmContextMenu(e, thread, other)}
                className={cn(
                  'w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-colors',
                  activeDmThreadId === thread.id
                    ? 'bg-secondary text-foreground'
                    : dmUnread > 0
                    ? 'text-foreground hover:bg-secondary/50'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={other?.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary text-white text-sm">
                      {getInitials(other?.displayName || other?.username || '?')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#2B2D31] rounded-full" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className={cn("truncate text-sm", dmUnread > 0 ? "font-bold" : "font-medium")}>
                    {other?.displayName || other?.username || 'Unknown'}
                  </p>
                  {thread.lastMessage && (
                    <p className={cn("text-[11px] truncate", dmUnread > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {thread.lastMessage.content}
                    </p>
                  )}
                </div>
                {dmUnread > 0 && (
                  <span className="shrink-0 min-w-[18px] h-[18px] px-1 bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {dmUnread > 99 ? '99+' : dmUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <UserProfilePanel user={user} voiceConnection={voiceConnection} onLeaveVoice={leaveVoice} />
      </div>
    );
  }

  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-channel-row]')) return;
    e.preventDefault();
    showMenu({
      x: e.clientX,
      y: e.clientY,
      actions: [
        {
          id: 'refresh',
          label: 'Refresh',
          icon: <RefreshCw size={14} />,
          onClick: () => {
            qc.invalidateQueries({ queryKey: getListChannelsQueryKey(activeServerId!) });
            qc.invalidateQueries({ queryKey: getGetServerQueryKey(activeServerId!) });
            qc.invalidateQueries({ queryKey: ['unread', activeServerId] });
          },
        },
      ],
    });
  };

  return (
    <div className="w-[300px] bg-surface-2 shrink-0 flex flex-col h-full border-r border-border/5">
      {/* Server Header with dropdown */}
      <div className="relative">
        <div className="h-12 border-b border-border/10 flex items-center shadow-sm">
          <button
            onClick={closeSidebar}
            title="Close sidebar"
            className="p-1.5 ml-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors shrink-0"
          >
            <Menu size={16} />
          </button>
          <button
            onClick={() => setServerMenuOpen(o => !o)}
            className="flex-1 h-full flex items-center justify-between pl-2 pr-3 font-bold text-foreground hover:bg-secondary/50 transition-colors min-w-0"
          >
            <span className="truncate">{server?.name || 'Loading…'}</span>
            <ChevronDown size={16} className={cn("text-muted-foreground transition-transform shrink-0 mx-1", serverMenuOpen && "rotate-180")} />
          </button>
        </div>
        {serverMenuOpen && (
          <div className="absolute top-full left-0 right-0 z-50 bg-popover border border-border/20 rounded-lg shadow-2xl py-1 mx-2 mt-1">
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
      <div className="flex-1 overflow-y-auto p-2 space-y-4 no-scrollbar" onClick={() => setServerMenuOpen(false)} onContextMenu={handleSidebarContextMenu}>

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
              <ContextMenu key={channel.id}>
              <ContextMenuTrigger asChild>
              <div
                data-channel-row
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
                      className="flex-1 bg-surface-0 text-foreground text-sm px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-primary"
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
              </ContextMenuTrigger>
              <ContextMenuContent className="bg-surface-0 border-border/50 text-sm">
                {!!unreadCounts[channel.id] && (
                  <ContextMenuItem
                    onSelect={() => {
                      clearUnreadCount(channel.id);
                      markChannelRead(channel.id).catch(() => {});
                      qc.invalidateQueries({ queryKey: ['unread', activeServerId] });
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCheck size={13} /> Mark as Read
                  </ContextMenuItem>
                )}
                {push.isSubscribed && (
                  <ContextMenuItem
                    onSelect={() => {
                      const isMuted = push.prefs.mutedChannelIds.includes(channel.id);
                      push.updatePrefs({
                        mutedChannelIds: isMuted
                          ? push.prefs.mutedChannelIds.filter((id: string) => id !== channel.id)
                          : [...push.prefs.mutedChannelIds, channel.id],
                      });
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    {push.prefs.mutedChannelIds.includes(channel.id) ? (
                      <><Bell size={13} /> Unmute notifications</>
                    ) : (
                      <><BellOff size={13} /> Mute notifications</>
                    )}
                  </ContextMenuItem>
                )}
                {isOwnerOrAdmin && (
                  <>
                    <ContextMenuItem
                      onSelect={() => startEditChannel(channel, { stopPropagation: () => {} } as any)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Pencil size={13} /> Rename channel
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => handleDeleteChannel(channel, { stopPropagation: () => {} } as any)}
                      className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                    >
                      <Trash2 size={13} /> Delete channel
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
              </ContextMenu>
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
                  <div
                    onContextMenu={e => handleVoiceChannelContextMenu(e, channel)}
                    className={cn(
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
                          className="flex-1 bg-surface-0 text-foreground text-sm px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-primary"
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

      {/* ── Server Settings shortcut — only in server view, for owners/admins ── */}
      {!!activeServerId && isOwnerOrAdmin && (
        <div className="mx-2 mb-1">
          <button
            onClick={() => setServerSettingsModalOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/40 text-primary transition-all duration-150"
          >
            <Settings size={15} className="shrink-0" />
            <span className="flex-1 text-left text-xs font-semibold">Server Settings</span>
            <ChevronDown size={12} className="shrink-0 opacity-60 -rotate-90" />
          </button>
        </div>
      )}

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
  const {
    micMuted, deafened, toggleMicMuted, toggleDeafened, setUserSettingsModalOpen,
    audioInputDeviceId, audioOutputDeviceId, setAudioInputDeviceId, setAudioOutputDeviceId,
    khurkOsEnabled, toggleKhurkOs,
    layoutMode, setLayoutMode,
  } = useAppStore();
  const { logout } = useAuth();
  const { data: profile } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();
  const qcPanel = useQueryClient();
  const [quickOpen, setQuickOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [customStatusInput, setCustomStatusInput] = useState('');
  const [editingCustom, setEditingCustom] = useState(false);
  const [iosInstallOpen, setIosInstallOpen] = useState(false);
  const { canInstall, isIOS, promptInstall } = usePwaInstall();
  const { permission, isSubscribed, subscribe, unsubscribe } = usePushNotifications();
  const notifOn = isSubscribed;
  const { visibleApps, hasAnyDismissed, dismissAll: dismissAllApps, restoreAll: restoreAllApps } = useKhurkDismissals();
  const khurkAppsExplicitNeutral = useAppStore(s => s.khurkAppsExplicitNeutral);
  const setKhurkAppsExplicitNeutral = useAppStore(s => s.setKhurkAppsExplicitNeutral);
  const khurkAppsMode = khurkAppsExplicitNeutral ? 'neutral' : !hasAnyDismissed ? 'all' : visibleApps.length === 0 ? 'none' : 'neutral';

  // Device picker state
  const [micPickerOpen, setMicPickerOpen] = useState(false);
  const [outputPickerOpen, setOutputPickerOpen] = useState(false);
  const [inputDevices, setInputDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [outputDevices, setOutputDevices] = useState<{ deviceId: string; label: string }[]>([]);

  const enumerateInputDevices = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch {}
    const devs = await navigator.mediaDevices.enumerateDevices();
    const mapped = devs.filter(d => d.kind === 'audioinput').map(d => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`,
    }));
    // Sort so 'default' and 'communications' show first
    mapped.sort((a, b) => {
      const rank = (id: string) => id === 'default' ? 0 : id === 'communications' ? 1 : 2;
      return rank(a.deviceId) - rank(b.deviceId);
    });
    setInputDevices(mapped);
  };

  const enumerateOutputDevices = async () => {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const mapped = devs.filter(d => d.kind === 'audiooutput').map(d => ({
      deviceId: d.deviceId,
      label: d.label || `Speaker ${d.deviceId.slice(0, 6)}`,
    }));
    mapped.sort((a, b) => {
      const rank = (id: string) => id === 'default' ? 0 : id === 'communications' ? 1 : 2;
      return rank(a.deviceId) - rank(b.deviceId);
    });
    setOutputDevices(mapped);
  };

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

  const displayName = (user as any).displayName || (user as any).username || 'You';

  return (
    <div className="shrink-0 relative">
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

      {/* Backdrop — closes either picker on outside click */}
      {(micPickerOpen || outputPickerOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setMicPickerOpen(false); setOutputPickerOpen(false); }}
        />
      )}

      {/* Input device picker — rolls up flush with sidebar left edge */}
      <div
        className={cn(
          "absolute bottom-full left-0 w-full bg-popover border-t border-x border-border/50 rounded-t-lg p-2 z-50 transition-all duration-200 origin-bottom",
          micPickerOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
        )}
      >
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 px-1">Input Device</p>
        {inputDevices.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-1">No devices found</p>
        ) : inputDevices.map(dev => {
          const isSelected = audioInputDeviceId === dev.deviceId || (!audioInputDeviceId && dev.deviceId === 'default');
          return (
            <button
              key={dev.deviceId}
              onClick={() => { setAudioInputDeviceId(dev.deviceId); setMicPickerOpen(false); }}
              className={cn(
                "w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 min-w-0",
                isSelected ? "text-foreground bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              )}
            >
              <span className="truncate flex-1 min-w-0">{dev.label}</span>
              {isSelected && <Check size={12} className="shrink-0 text-primary" />}
            </button>
          );
        })}
        <div className="border-t border-border/30 mt-1.5 pt-1.5">
          <button
            onClick={() => { setUserSettingsModalOpen(true); setMicPickerOpen(false); }}
            className="w-full text-left text-sm px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 flex items-center gap-2"
          >
            <Settings size={12} />
            Voice Settings
          </button>
        </div>
      </div>

      {/* Output device picker — rolls up flush with sidebar left edge */}
      <div
        className={cn(
          "absolute bottom-full left-0 w-full bg-popover border-t border-x border-border/50 rounded-t-lg p-2 z-50 transition-all duration-200 origin-bottom",
          outputPickerOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none"
        )}
      >
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 px-1">Output Device</p>
        {outputDevices.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-1">No devices found</p>
        ) : outputDevices.map(dev => {
          const isSelected = audioOutputDeviceId === dev.deviceId || (!audioOutputDeviceId && dev.deviceId === 'default');
          return (
            <button
              key={dev.deviceId}
              onClick={() => { setAudioOutputDeviceId(dev.deviceId); setOutputPickerOpen(false); }}
              className={cn(
                "w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 min-w-0",
                isSelected ? "text-foreground bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              )}
            >
              <span className="truncate flex-1 min-w-0">{dev.label}</span>
              {isSelected && <Check size={12} className="shrink-0 text-primary" />}
            </button>
          );
        })}
        <div className="border-t border-border/30 mt-1.5 pt-1.5">
          <button
            onClick={() => { setUserSettingsModalOpen(true); setOutputPickerOpen(false); }}
            className="w-full text-left text-sm px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 flex items-center gap-2"
          >
            <Settings size={12} />
            Voice Settings
          </button>
        </div>
      </div>

      {/* ── Install App banner — only visible when PWA is not yet installed ── */}
      {canInstall && (
        <div className="mx-2 mb-1">
          {isIOS ? (
            <Popover open={iosInstallOpen} onOpenChange={setIosInstallOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/40 text-primary transition-all duration-150 group/install">
                  <Share2 size={15} className="shrink-0" />
                  <span className="flex-1 text-left text-xs font-semibold">Add to Home Screen</span>
                  <ChevronDown size={12} className="shrink-0 opacity-60 -rotate-90" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-64 p-3 bg-popover border-border/50 text-sm" sideOffset={6}>
                <p className="font-semibold text-foreground mb-1">Add to Home Screen</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Tap the <span className="font-semibold text-foreground">Share</span> button in Safari, then choose <span className="font-semibold text-foreground">Add to Home Screen</span>.
                </p>
              </PopoverContent>
            </Popover>
          ) : (
            <button
              onClick={promptInstall}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/40 text-primary transition-all duration-150"
            >
              <MonitorDown size={15} className="shrink-0" />
              <span className="flex-1 text-left text-xs font-semibold">Install App</span>
              <ChevronDown size={12} className="shrink-0 opacity-60 -rotate-90" />
            </button>
          )}
        </div>
      )}

      <div className="mx-2 mb-2 mt-1 flex items-center px-3 py-2 gap-2 group/profile bg-background/80 backdrop-blur-xl border border-border/30 shadow-xl shadow-black/30 rounded-2xl">
        {/* Avatar — click to open quick actions (sign out, KHURK OS toggle) */}
        <Popover open={quickOpen} onOpenChange={setQuickOpen}>
          <PopoverTrigger asChild>
            <button className="relative shrink-0 rounded-full hover:opacity-90 transition-opacity">
              <Avatar className="h-8 w-8 rounded-full border border-border/50">
                <AvatarImage src={profile?.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-white text-xs">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className={cn(
                "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-[2.5px] border-card rounded-full",
                statusColor(inVoice ? 'online' : currentStatus)
              )} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" alignOffset={-20} className="w-64 p-2 bg-popover border-border/50" sideOffset={8}>
            <div className="flex items-center gap-3 px-2 py-1 mb-1">
              <button
                onClick={() => { setUserSettingsModalOpen(true); setQuickOpen(false); }}
                className="relative shrink-0 group/avtedit"
                title="Edit profile"
              >
                <Avatar className="h-10 w-10 rounded-full border border-border/50">
                  <AvatarImage src={profile?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-white text-sm">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover/avtedit:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={14} className="text-white" />
                </div>
              </button>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">@{(user as any)?.username || displayName}</p>
              </div>
            </div>
            <div className="h-px bg-border/40 mb-1" />
            {permission !== 'unsupported' && (
              <button
                onClick={() => notifOn ? unsubscribe() : subscribe()}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent"
              >
                {notifOn
                  ? <Bell size={14} className="shrink-0 text-muted-foreground" />
                  : <BellOff size={14} className="shrink-0 text-muted-foreground" />
                }
                <span className="flex-1 text-left">NOTIFICATIONS</span>
                <div className={cn(
                  "w-8 h-4 rounded-full transition-colors relative shrink-0",
                  notifOn ? "bg-primary" : "bg-muted"
                )}>
                  <div className={cn(
                    "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200",
                    notifOn ? "translate-x-4" : "translate-x-0.5"
                  )} />
                </div>
              </button>
            )}
            <button
              onClick={toggleKhurkOs}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent"
            >
              <LayoutGrid size={14} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">KHURK OS</span>
              <div className={cn(
                "w-8 h-4 rounded-full transition-colors relative shrink-0",
                khurkOsEnabled ? "bg-primary" : "bg-muted"
              )}>
                <div className={cn(
                  "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200",
                  khurkOsEnabled ? "translate-x-4" : "translate-x-0.5"
                )} />
              </div>
            </button>
            <button
              onClick={() => {
                if (khurkAppsMode === 'all') { setKhurkAppsExplicitNeutral(false); dismissAllApps(); }
                else if (khurkAppsMode === 'none') { setKhurkAppsExplicitNeutral(false); restoreAllApps(); }
                // neutral: do nothing
              }}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent"
            >
              <LayoutGrid size={14} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">KHURK APPS</span>
              <div className="flex items-center rounded-md overflow-hidden border border-border/40 text-[10px] font-semibold shrink-0">
                <span
                  onClick={(e) => { e.stopPropagation(); setKhurkAppsExplicitNeutral(false); restoreAllApps(); }}
                  className={cn("px-1.5 py-0.5 transition-colors cursor-pointer", khurkAppsMode === 'all' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >All</span>
                <span
                  onClick={(e) => { e.stopPropagation(); setKhurkAppsExplicitNeutral(true); }}
                  className={cn("px-1.5 py-0.5 transition-colors cursor-pointer", khurkAppsMode === 'neutral' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >Ø</span>
                <span
                  onClick={(e) => { e.stopPropagation(); setKhurkAppsExplicitNeutral(false); dismissAllApps(); }}
                  className={cn("px-1.5 py-0.5 transition-colors cursor-pointer", khurkAppsMode === 'none' ? "bg-destructive text-white" : "text-muted-foreground hover:text-foreground")}
                >None</span>
              </div>
            </button>
            <button
              onClick={() => setLayoutMode(layoutMode === 'classic' ? 'dock' : 'classic')}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent"
            >
              <PanelLeft size={14} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">LAYOUT</span>
              <div className="flex items-center rounded-md overflow-hidden border border-border/40 text-[10px] font-semibold shrink-0">
                <span className={cn(
                  "px-1.5 py-0.5 transition-colors",
                  layoutMode === 'classic' ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}>Side</span>
                <span className={cn(
                  "px-1.5 py-0.5 transition-colors",
                  layoutMode === 'dock' ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}>Dock</span>
              </div>
            </button>
            <div className="h-px bg-border/40 my-1" />
            <button
              onClick={() => { logout(); setQuickOpen(false); }}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-destructive/10 text-destructive"
            >
              <LogOut size={14} className="shrink-0" />
              Sign Out
            </button>
          </PopoverContent>
        </Popover>

        {/* Username area — click to pick status */}
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <button className="flex flex-col flex-1 min-w-0 cursor-pointer hover:bg-accent rounded-md px-2 py-1 text-left transition-colors">
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
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            alignOffset={-44}
            className="w-[232px] p-1.5 bg-popover border-border/50"
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
                  "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent",
                  currentStatus === opt.value && "bg-accent/50 font-semibold"
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
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors hover:bg-accent text-left"
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
                  className="w-full rounded-md bg-input border border-border/50 text-sm text-foreground px-2.5 py-1.5 focus:outline-none focus:border-primary placeholder:text-muted-foreground"
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
                    className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-accent/50 text-muted-foreground text-xs font-semibold hover:bg-accent transition-colors"
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
          {/* Mic toggle + input device picker */}
          <div className="flex items-center rounded-md">
            <button
              onClick={toggleMicMuted}
              title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={cn(
                "p-1.5 rounded-l-md transition-colors",
                micMuted
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              title="Choose microphone"
              onClick={() => { enumerateInputDevices(); setMicPickerOpen(o => !o); setOutputPickerOpen(false); }}
              className="py-2 px-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-r-md transition-colors"
            >
              <ChevronUp size={10} />
            </button>
          </div>

          {/* Headset toggle + output device picker */}
          <div className="flex items-center rounded-md">
            <button
              onClick={toggleDeafened}
              title={deafened ? 'Undeafen' : 'Deafen (mute all audio)'}
              className={cn(
                "p-1.5 rounded-l-md transition-colors",
                deafened
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
            </button>
            <button
              title="Choose speaker / headset"
              onClick={() => { enumerateOutputDevices(); setOutputPickerOpen(o => !o); setMicPickerOpen(false); }}
              className="py-2 px-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-r-md transition-colors"
            >
              <ChevronUp size={10} />
            </button>
          </div>
          <button
            onClick={() => setUserSettingsModalOpen(true)}
            title="User Settings"
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <Settings size={18} />
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
  const { show: showMenu } = useContextMenu();
  const { openProfileCard } = useAppStore();

  const handleVoiceUserContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const actions: any[] = [];

    if (!isSelf) {
      actions.push(
        {
          id: 'view-profile',
          label: 'View Profile',
          icon: <User size={14} />,
          onClick: () => openProfileCard({ userId: u.userId, position: { x: e.clientX, y: e.clientY } }),
        },
        {
          id: 'message',
          label: 'Send Message',
          icon: <MessageSquare size={14} />,
          onClick: () => handleDm(),
        },
        {
          id: 'mention',
          label: 'Mention in Chat',
          icon: <AtSign size={14} />,
          onClick: () => onMention(),
        },
        {
          id: 'copy-username',
          label: 'Copy Username',
          icon: <Copy size={14} />,
          onClick: () => navigator.clipboard.writeText(u.username || u.displayName || ''),
          dividerBefore: true,
        },
        {
          id: 'vol-up',
          label: `Volume Up (${Math.min(200, Math.round(volume * 100) + 25)}%)`,
          icon: <Volume1 size={14} />,
          onClick: () => onVolumeChange(Math.min(2, volume + 0.25)),
          dividerBefore: true,
        },
        {
          id: 'vol-down',
          label: `Volume Down (${Math.max(0, Math.round(volume * 100) - 25)}%)`,
          icon: <VolumeOff size={14} />,
          onClick: () => onVolumeChange(Math.max(0, volume - 0.25)),
        },
      );
    } else {
      actions.push({
        id: 'copy-username',
        label: 'Copy Username',
        icon: <Copy size={14} />,
        onClick: () => navigator.clipboard.writeText(u.username || u.displayName || ''),
      });
    }

    showMenu({ x: e.clientX, y: e.clientY, actions });
  };

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
        <div
          onContextMenu={handleVoiceUserContextMenu}
          className="flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer hover:bg-accent/60 transition-colors group/vu"
        >
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
          <div className="flex items-center gap-0.5 shrink-0">
            {u.muted
              ? <MicOff size={11} className="text-destructive" />
              : <Mic size={11} className="text-muted-foreground/50" />
            }
            {u.deafened && <VolumeX size={11} className="text-destructive" />}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-64 p-3 bg-popover border-border/30">
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
                min={0} max={1} step={0.01}
                value={[volume]}
                onValueChange={([v]) => onVolumeChange(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleDm}
                disabled={dmLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-accent/50 hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <MessageSquare size={12} />
                Message
              </button>
              <button
                onClick={handleMention}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-accent/50 hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors"
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
