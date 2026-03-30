import { useState, useRef, useEffect, useCallback } from 'react';
import { Hash, Users, Bell, BellOff, Pin, Search, HelpCircle, Menu, X, Copy, ChevronsDown, ScrollText, Music, PinOff } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useListChannels, getListChannelsQueryKey } from '@workspace/api-client-react';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { PinnedMessagesPanel } from './PinnedMessagesPanel';
import type { Message } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ScreenShareMiniPreview } from '@/components/voice/ScreenShareMiniPreview';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function ChatArea() {
  const {
    activeServerId, activeChannelId,
    toggleMemberList, toggleMobileSidebar, togglePinnedPanel, pinnedPanelOpen,
    isChannelMuted, toggleMuteChannel,
    setHelpModalOpen,
    voicePanelHeight,
    layoutMode, toggleClassicChannel, setClassicChannelOpen, setMobileSidebarOpen,
    triggerCommand,
    sidebarLocked, setSidebarLocked,
  } = useAppStore();

  const { show: showMenu } = useContextMenu();

  const { data: channels = [] } = useListChannels(activeServerId || '', {
    query: { queryKey: getListChannelsQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });

  const channel = channels.find(c => c.id === activeChannelId);

  // Define isMuted here so context-menu callbacks can reference it before the old position
  const isMuted = activeChannelId ? isChannelMuted(activeChannelId) : false;

  // Right-click on the channel header bar
  const handleHeaderContextMenu = useCallback((e: React.MouseEvent) => {
    if (!channel) return;
    e.preventDefault();
    e.stopPropagation();
    showMenu({
      x: e.clientX, y: e.clientY,
      title: `#${channel.name}`,
      subtitle: channel.topic || undefined,
      actions: [
        {
          id: 'copy-name',
          label: 'Copy Channel Name',
          icon: <Copy size={14} />,
          onClick: () => navigator.clipboard.writeText(`#${channel.name}`),
        },
        {
          id: 'mute',
          label: isMuted ? 'Unmute Notifications' : 'Mute Notifications',
          icon: isMuted ? <Bell size={14} /> : <BellOff size={14} />,
          onClick: () => activeChannelId && toggleMuteChannel(activeChannelId),
        },
        {
          id: 'pins',
          label: pinnedPanelOpen ? 'Hide Pinned Messages' : 'Show Pinned Messages',
          icon: <Pin size={14} />,
          onClick: togglePinnedPanel,
          dividerBefore: true,
        },
        {
          id: 'members',
          label: 'Toggle Member List',
          icon: <Users size={14} />,
          onClick: toggleMemberList,
        },
        {
          id: 'help',
          label: 'Keyboard Shortcuts',
          icon: <HelpCircle size={14} />,
          onClick: () => setHelpModalOpen(true),
          dividerBefore: true,
        },
      ],
    });
  }, [channel, isMuted, activeChannelId, pinnedPanelOpen, toggleMuteChannel, togglePinnedPanel, toggleMemberList, setHelpModalOpen, showMenu]);

  // Right-click on the chat body (messages area + composer wrapper)
  const handleBodyContextMenu = useCallback((e: React.MouseEvent) => {
    // Let message-level right-clicks handle themselves
    if ((e.target as HTMLElement).closest('[data-message-row]')) return;
    e.preventDefault();
    showMenu({
      x: e.clientX, y: e.clientY,
      actions: [
        {
          id: 'scroll-bottom',
          label: 'Scroll to Bottom',
          icon: <ChevronsDown size={14} />,
          onClick: () => {
            const el = document.querySelector('[data-messages-scroll]');
            el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          },
        },
        {
          id: 'pins',
          label: pinnedPanelOpen ? 'Hide Pinned Messages' : 'Show Pinned Messages',
          icon: <ScrollText size={14} />,
          onClick: togglePinnedPanel,
        },
        {
          id: 'mute',
          label: isMuted ? 'Unmute Notifications' : 'Mute Notifications',
          icon: isMuted ? <Bell size={14} /> : <BellOff size={14} />,
          onClick: () => activeChannelId && toggleMuteChannel(activeChannelId),
          dividerBefore: true,
        },
        {
          id: 'play',
          label: '/Play',
          icon: <Music size={14} />,
          onClick: () => triggerCommand('/play '),
          dividerBefore: true,
        },
      ],
    });
  }, [isMuted, activeChannelId, pinnedPanelOpen, toggleMuteChannel, togglePinnedPanel, triggerCommand, showMenu]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Run search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim() || !activeChannelId) {
      setSearchResults([]);
      return;
    }
    fetch(`/api/channels/${activeChannelId}/messages/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => r.json())
      .then(setSearchResults)
      .catch(() => setSearchResults([]));
  }, [debouncedQuery, activeChannelId]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearchResultClick = useCallback((msg: Message) => {
    setSearchOpen(false);
    setSearchQuery('');
    setHighlightedMessageId(msg.id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimerRef.current = null;
    }, 3000);
  }, []);

  // Keyboard shortcut: Esc closes search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!activeChannelId || !channel) {
    return (
      <div className="flex-1 bg-surface-0 flex flex-col min-w-0 h-full">
        <div className="relative z-50 h-12 border-b border-border/20 flex items-center gap-1 px-4 shrink-0 bg-surface-1">
          <button
            onClick={() => { if (!sidebarLocked) (layoutMode === 'classic' ? toggleClassicChannel : toggleMobileSidebar)(); }}
            className={cn('transition-colors shrink-0', sidebarLocked ? 'text-muted-foreground/30 cursor-default' : 'text-muted-foreground hover:text-foreground')}
            title={sidebarLocked ? 'Sidebar is pinned' : 'Toggle sidebar'}
          >
            <Menu size={22} />
          </button>
          <button
            onClick={() => { const next = !sidebarLocked; setSidebarLocked(next); if (next && layoutMode === 'classic') setClassicChannelOpen(true); }}
            className={cn('transition-colors shrink-0 p-1 rounded', sidebarLocked ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
            title={sidebarLocked ? 'Unpin sidebar' : 'Pin sidebar open'}
          >
            {sidebarLocked ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
            <Hash size={32} className="opacity-50" />
          </div>
          <h2 className="text-xl font-bold text-foreground">No Text Channel Selected</h2>
          <p>Select a channel from the left to start chatting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <div className="flex-1 bg-surface-0 flex flex-col h-full min-w-0 relative" onContextMenu={handleBodyContextMenu}>
        {/* Top Header */}
        <div className="relative z-50 h-12 border-b border-border/20 flex items-center justify-between px-4 shrink-0 shadow-sm bg-surface-1" onContextMenu={handleHeaderContextMenu}>
          <div className="flex items-center min-w-0">
            <button
              onClick={() => { if (!sidebarLocked) (layoutMode === 'classic' ? toggleClassicChannel : toggleMobileSidebar)(); }}
              className={cn('mr-1 transition-colors shrink-0', sidebarLocked ? 'text-muted-foreground/30 cursor-default' : 'text-muted-foreground hover:text-foreground')}
              title={sidebarLocked ? 'Sidebar is pinned' : 'Toggle sidebar'}
            >
              <Menu size={22} />
            </button>
            <button
              onClick={() => { const next = !sidebarLocked; setSidebarLocked(next); if (next && layoutMode === 'classic') setClassicChannelOpen(true); }}
              className={cn('hidden sm:inline-flex mr-3 p-1 rounded transition-colors shrink-0', sidebarLocked ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
              title={sidebarLocked ? 'Unpin sidebar' : 'Pin sidebar open'}
            >
              {sidebarLocked ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
            <Hash size={24} className="text-muted-foreground mr-2 shrink-0" />
            <h2 className="font-bold text-foreground truncate text-[15px]">{channel.name}</h2>
            {channel.topic && (
              <>
                <div className="w-[1px] h-6 bg-border/40 mx-4 shrink-0" />
                <p className="text-sm text-muted-foreground truncate">{channel.topic}</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 text-muted-foreground shrink-0 ml-2">
            {/* Bell — mute/unmute: single wide pill combining toggle + bell icon */}
            <button
              onClick={() => activeChannelId && toggleMuteChannel(activeChannelId)}
              title={isMuted ? 'Unmute notifications' : 'Mute notifications'}
              className={cn(
                'flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-full border transition-all duration-200',
                isMuted
                  ? 'text-rose-400 border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20'
                  : 'text-muted-foreground border-border bg-secondary/60 hover:bg-secondary hover:text-foreground'
              )}
            >
              {/* Toggle track */}
              <span
                className={cn(
                  'relative flex shrink-0 w-7 h-[14px] rounded-full transition-colors duration-200',
                  isMuted ? 'bg-rose-500/30' : 'bg-primary/30'
                )}
              >
                <span
                  className={cn(
                    'absolute top-[3px] w-[8px] h-[8px] rounded-full transition-all duration-200',
                    isMuted ? 'left-[3px] bg-rose-400' : 'left-[calc(100%-11px)] bg-primary'
                  )}
                />
              </span>
              {/* Bell icon */}
              {isMuted ? <BellOff size={15} /> : <Bell size={15} />}
            </button>

            {/* Pin — toggle pinned messages panel */}
            <button
              onClick={togglePinnedPanel}
              title="Pinned messages"
              className={cn(
                'p-2 rounded-md transition-colors',
                pinnedPanelOpen
                  ? 'text-primary bg-primary/10'
                  : 'hover:text-foreground hover:bg-secondary'
              )}
            >
              <Pin size={20} />
            </button>

            {/* Members toggle */}
            <button
              onClick={toggleMemberList}
              title="Toggle member list"
              className="p-2 rounded-md hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Users size={20} />
            </button>

            {/* Global notification bell */}
            <NotificationBell />

            {/* Search — hidden on mobile, visible on md+ */}
            <div className="relative hidden md:block" ref={searchRef}>
              <div className="flex items-center bg-surface-0 rounded-sm h-6 overflow-hidden focus-within:ring-1 focus-within:ring-primary transition-all">
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => searchQuery && setSearchOpen(true)}
                  className="bg-transparent h-full w-28 focus:w-44 px-2 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all duration-300"
                />
                {searchQuery ? (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false); }}
                    className="pr-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                ) : (
                  <Search size={12} className="mr-1.5 opacity-50" />
                )}
              </div>

              {/* Search results dropdown */}
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute right-0 top-8 w-80 bg-surface-2 border border-border/20 rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto no-scrollbar">
                  <div className="px-3 py-2 border-b border-border/10">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {searchResults.map(msg => (
                    <button
                      key={msg.id}
                      onClick={() => handleSearchResultClick(msg)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
                    >
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarImage src={msg.author.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary text-white text-[10px]">
                          {getInitials(msg.author.displayName || msg.author.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold text-indigo-400">
                            {msg.author.displayName || msg.author.username}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(msg.createdAt), 'MM/dd h:mm a')}
                          </span>
                        </div>
                        <p className="text-xs text-foreground truncate">{msg.content}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchOpen && searchQuery.trim() && searchResults.length === 0 && (
                <div className="absolute right-0 top-8 w-60 bg-surface-2 border border-border/20 rounded-xl shadow-2xl p-4 z-50 text-center">
                  <p className="text-xs text-muted-foreground">No messages found for "{searchQuery}"</p>
                </div>
              )}
            </div>

            {/* Help — hidden on mobile */}
            <button
              onClick={() => setHelpModalOpen(true)}
              title="Keyboard shortcuts & help"
              className="hidden md:block p-2 rounded-md hover:text-foreground hover:bg-secondary transition-colors"
            >
              <HelpCircle size={20} />
            </button>

          </div>
        </div>

        {/* Messages */}
        <MessageList channelId={channel.id} highlightedMessageId={highlightedMessageId} />

        {/* Composer */}
        <MessageComposer channelId={channel.id} />

        {/* Floating screenshare mini-preview — anchored to chat bottom-right above composer */}
        <ScreenShareMiniPreview />

        {/* Spacer so the floating voice panel doesn't cover the composer */}
        {voicePanelHeight > 0 && (
          <div style={{ height: voicePanelHeight }} className="shrink-0" />
        )}
      </div>

      {/* Pinned Messages Panel — overlay on mobile, inline column on desktop */}
      {pinnedPanelOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={togglePinnedPanel}
          />
          {/* Panel: fixed overlay on mobile, flex sibling on desktop */}
          <div className="fixed right-0 top-0 h-full z-50 md:relative md:right-auto md:top-auto md:z-auto md:h-full">
            <PinnedMessagesPanel channelId={channel.id} />
          </div>
        </>
      )}
    </div>
  );
}
