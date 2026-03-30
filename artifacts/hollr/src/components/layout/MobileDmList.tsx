import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { useAppStore } from '@/store/use-app-store';
import { useListDmThreads, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  MessageSquarePlus, MessageCircle, Menu, Search, X,
  MessageSquare, PhoneCall, Video, User, Check, Copy, RefreshCw, Trash2,
} from 'lucide-react';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { sendDmCallSignal } from '@/hooks/use-realtime';
import { initiateVideoCall } from '@/hooks/use-video-call';

/**
 * MobileDmList — full-screen DM list shown on mobile when no DM thread is open.
 * On desktop the sidebar always shows the DM list, so this component is md:hidden.
 */
export function MobileDmList() {
  const { user } = useAuth();
  const {
    activeDmThreadId, setActiveDmThread,
    dmUnreadCounts, clearDmUnreadCount,
    toggleMobileSidebar, layoutMode, setClassicChannelOpen,
    openProfileCard, setDmCallState,
  } = useAppStore();

  const { show: showMenu } = useContextMenu();
  const qc = useQueryClient();

  const { data: dmThreads = [] } = useListDmThreads({
    query: { queryKey: getListDmThreadsQueryKey(), refetchInterval: 5000, refetchIntervalInBackground: false },
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const blankPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openBlankAreaMenu = (x: number, y: number) => {
    showMenu({
      x,
      y,
      actions: [
        {
          id: 'refresh-dms',
          label: 'Refresh DMs',
          icon: <RefreshCw size={14} />,
          onClick: () => qc.invalidateQueries({ queryKey: getListDmThreadsQueryKey() }),
        },
        {
          id: 'new-dm',
          label: 'New Direct Message',
          icon: <MessageSquarePlus size={14} />,
          onClick: () => useAppStore.getState().setNewDmModalOpen(true),
          dividerBefore: true,
        },
      ],
    });
  };

  const filtered = searchQuery.trim()
    ? dmThreads.filter((thread: any) => {
        const other = thread.participants?.find((p: any) => p.id !== user?.id) ?? thread.participants?.[0];
        const name = (other?.displayName || other?.username || '').toLowerCase();
        return name.includes(searchQuery.toLowerCase());
      })
    : dmThreads;

  const handleCloseSearch = () => { setSearchQuery(''); setSearchOpen(false); };

  const openDmContextMenu = (
    x: number, y: number,
    thread: any, other: any,
  ) => {
    showMenu({
      x,
      y,
      title: other?.displayName || other?.username || 'Unknown',
      subtitle: other?.username ? `@${other.username}` : undefined,
      titleIcon: other?.avatarUrl || undefined,
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
            const authUser = user;
            setActiveDmThread(thread.id);
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
            setActiveDmThread(thread.id);
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
          onClick: () => openProfileCard({ userId: other.id, position: { x, y } }),
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
        {
          id: 'close-dm',
          label: 'Close DM',
          icon: <Trash2 size={14} />,
          danger: true,
          dividerBefore: true,
          onClick: async () => {
            await fetch(`/api/dms/${thread.id}`, { method: 'DELETE' });
            qc.invalidateQueries({ queryKey: getListDmThreadsQueryKey() });
            const { activeDmThreadId, setActiveDmThread } = useAppStore.getState();
            if (activeDmThreadId === thread.id) setActiveDmThread(null);
          },
        },
      ],
    });
  };

  const handleTouchStart = (thread: any, other: any, e: React.TouchEvent) => {
    longPressTriggered.current = false;
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      openDmContextMenu(x, y, thread, other);
    }, 400);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-surface-1">
      {/* Header */}
      <div className="h-12 border-b border-border/10 flex items-center px-3 shrink-0 shadow-sm bg-surface-1 z-10 gap-2">
        {searchOpen ? (
          <>
            <Search size={15} className="text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && handleCloseSearch()}
              placeholder="Search conversations…"
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <button onClick={handleCloseSearch} className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={layoutMode === 'classic' ? () => setClassicChannelOpen(true) : toggleMobileSidebar}
              className="p-1 text-muted-foreground hover:text-foreground active:text-foreground transition-colors rounded-md shrink-0"
              title="Open sidebar"
            >
              <Menu size={22} />
            </button>
            <MessageCircle size={18} className="text-muted-foreground shrink-0" />
            <h2 className="font-bold text-foreground text-[15px] flex-1 min-w-0">Direct Messages</h2>
            <button onClick={() => setSearchOpen(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Search conversations">
              <Search size={16} />
            </button>
          </>
        )}
      </div>

      {/* DM thread list */}
      <div
        className="flex-1 overflow-y-auto p-3 no-scrollbar flex flex-col gap-1"
        onContextMenu={e => {
          if ((e.target as HTMLElement).closest('button,a,[role="button"],input')) return;
          e.preventDefault();
          openBlankAreaMenu(e.clientX, e.clientY);
        }}
        onTouchStart={e => {
          if ((e.target as HTMLElement).closest('button,a,[role="button"],input')) return;
          const touch = e.touches[0];
          const x = touch.clientX;
          const y = touch.clientY;
          blankPressTimer.current = setTimeout(() => {
            blankPressTimer.current = null;
            openBlankAreaMenu(x, y);
          }, 400);
        }}
        onTouchEnd={() => {
          if (blankPressTimer.current) { clearTimeout(blankPressTimer.current); blankPressTimer.current = null; }
        }}
        onTouchMove={() => {
          if (blankPressTimer.current) { clearTimeout(blankPressTimer.current); blankPressTimer.current = null; }
        }}
      >
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground py-16 gap-3">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <MessageSquarePlus size={28} className="opacity-50" />
            </div>
            {searchQuery.trim() ? (
              <>
                <p className="text-sm font-medium">No results for "{searchQuery}"</p>
                <button onClick={handleCloseSearch} className="text-xs text-primary hover:underline">Clear search</button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No direct messages yet</p>
                <p className="text-xs text-center max-w-[220px] opacity-70">
                  Start a conversation by clicking someone's name in a server.
                </p>
              </>
            )}
          </div>
        )}

        {filtered.map((thread: any) => {
          const other = thread.participants?.find((p: any) => p.id !== user?.id) ?? thread.participants?.[0];
          const dmUnread = dmUnreadCounts[thread.id] ?? 0;

          return (
            <button
              key={thread.id}
              onClick={() => {
                if (longPressTriggered.current) { longPressTriggered.current = false; return; }
                setActiveDmThread(thread.id);
                clearDmUnreadCount(thread.id);
              }}
              onContextMenu={e => { e.preventDefault(); openDmContextMenu(e.clientX, e.clientY, thread, other); }}
              onTouchStart={e => handleTouchStart(thread, other, e)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors select-none',
                activeDmThreadId === thread.id
                  ? 'bg-secondary text-foreground'
                  : dmUnread > 0
                  ? 'text-foreground hover:bg-secondary/50 active:bg-secondary/70'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground active:bg-secondary/70'
              )}
            >
              {/* Avatar with online dot */}
              <div className="relative shrink-0">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={other?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-white text-base font-semibold">
                    {getInitials(other?.displayName || other?.username || '?')}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#2B2D31] rounded-full" />
              </div>

              {/* Name + preview */}
              <div className="flex-1 min-w-0">
                <p className={cn('truncate text-[15px]', dmUnread > 0 ? 'font-bold text-foreground' : 'font-semibold')}>
                  {other?.displayName || other?.username || 'Unknown'}
                </p>
                {thread.lastMessage && (
                  <p className={cn('text-[13px] truncate mt-0.5', dmUnread > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                    {thread.lastMessage.content || 'Sent an attachment'}
                  </p>
                )}
              </div>

              {/* Unread badge */}
              {dmUnread > 0 && (
                <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 bg-destructive text-white text-[11px] font-bold rounded-full flex items-center justify-center leading-none">
                  {dmUnread > 99 ? '99+' : dmUnread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
