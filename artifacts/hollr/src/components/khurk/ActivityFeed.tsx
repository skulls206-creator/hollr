import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare, UserPlus, MessageCircle,
  ChevronDown, ChevronUp, Activity,
  EyeOff, Eye, UserX, ExternalLink,
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { cn } from '@/lib/utils';
import { applyNav } from '@/lib/notification-nav';

const BASE = import.meta.env.BASE_URL;
const LS_COLLAPSED   = 'hollr:activity-feed:collapsed';
const LS_HIDDEN_IDS  = 'hollr:activity-feed:hidden-ids';
const LS_HIDDEN_SNDR = 'hollr:activity-feed:hidden-senders';

type ActivityEvent = {
  type: 'message' | 'dm' | 'join';
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  timestamp: string;
  link: string | null;
  serverId: string | null;
  channelId: string | null;
  threadId: string | null;
};

function eventKey(e: ActivityEvent) {
  return `${e.type}|${e.timestamp}|${e.title}`;
}

function loadSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]); }
  catch { return new Set(); }
}

function saveSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch {}
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function typeIcon(type: ActivityEvent['type']) {
  switch (type) {
    case 'message': return <MessageSquare size={11} />;
    case 'dm':      return <MessageCircle size={11} />;
    case 'join':    return <UserPlus size={11} />;
  }
}

function typeBadgeClass(type: ActivityEvent['type']) {
  switch (type) {
    case 'message': return 'bg-violet-500/15 text-violet-400';
    case 'dm':      return 'bg-blue-500/15 text-blue-400';
    case 'join':    return 'bg-emerald-500/15 text-emerald-400';
  }
}

function typeLabel(type: ActivityEvent['type']) {
  switch (type) {
    case 'message': return 'message';
    case 'dm':      return 'dm';
    case 'join':    return 'joined';
  }
}

function ActivityRow({
  event,
  isHidden,
  onHide,
  onUnhide,
  onHideSender,
  onUnhideSender,
}: {
  event: ActivityEvent;
  isHidden: boolean;
  onHide: () => void;
  onUnhide: () => void;
  onHideSender: () => void;
  onUnhideSender: () => void;
}) {
  const { show: showMenu } = useContextMenu();

  const navigate = useCallback(() => {
    if (event.threadId) {
      applyNav({ type: 'dm', threadId: event.threadId });
    } else if (event.serverId && event.channelId) {
      applyNav({ type: 'channel', serverId: event.serverId, channelId: event.channelId });
    } else if (event.serverId) {
      useAppStore.getState().setActiveServer(event.serverId);
    }
  }, [event]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const actions = isHidden
      ? [
          {
            id: 'unhide-this',
            label: 'Show this notification',
            icon: <Eye size={14} />,
            onClick: onUnhide,
          },
          {
            id: 'unhide-sender',
            label: `Show all from ${event.title}`,
            icon: <Eye size={14} />,
            onClick: onUnhideSender,
          },
          {
            id: 'open',
            label: 'Open',
            icon: <ExternalLink size={14} />,
            onClick: navigate,
            dividerBefore: true,
          },
        ]
      : [
          {
            id: 'hide-this',
            label: 'Hide this notification',
            icon: <EyeOff size={14} />,
            onClick: onHide,
          },
          {
            id: 'hide-sender',
            label: `Hide all from ${event.title}`,
            icon: <UserX size={14} />,
            onClick: onHideSender,
          },
          {
            id: 'open',
            label: 'Open',
            icon: <ExternalLink size={14} />,
            onClick: navigate,
            dividerBefore: true,
          },
        ];

    showMenu({
      x: e.clientX,
      y: e.clientY,
      title: event.title,
      subtitle: event.subtitle,
      titleIcon: event.avatarUrl ?? undefined,
      actions,
    });
  }, [isHidden, event, navigate, onHide, onUnhide, onHideSender, onUnhideSender, showMenu]);

  const handleLongPress = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const timer = setTimeout(() => {
      handleContextMenu({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent);
    }, 500);
    const cancel = () => clearTimeout(timer);
    e.currentTarget.addEventListener('touchend', cancel, { once: true });
    e.currentTarget.addEventListener('touchmove', cancel, { once: true });
  }, [handleContextMenu]);

  const initials = event.title
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <button
      onClick={isHidden ? undefined : navigate}
      onContextMenu={handleContextMenu}
      onTouchStart={handleLongPress}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left group',
        isHidden
          ? 'opacity-35 cursor-default'
          : 'hover:bg-accent/50 cursor-pointer',
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {event.avatarUrl ? (
          <img src={event.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
            {initials.slice(0, 2)}
          </div>
        )}
        {isHidden && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-surface-3 flex items-center justify-center">
            <EyeOff size={7} className="text-muted-foreground/60" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold shrink-0', typeBadgeClass(event.type))}>
            {typeIcon(event.type)}
            {typeLabel(event.type)}
          </span>
          <span className="text-[12px] font-medium text-foreground truncate">{event.title}</span>
        </div>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">{event.subtitle}</p>
      </div>

      {/* Time */}
      <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">{relativeTime(event.timestamp)}</span>
    </button>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="w-7 h-7 rounded-full bg-accent/50 shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3 bg-accent/50 rounded animate-pulse w-2/3" />
        <div className="h-2.5 bg-accent/30 rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}

export function ActivityFeed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_COLLAPSED) === 'true'; } catch { return false; }
  });

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => loadSet(LS_HIDDEN_IDS));
  const [hiddenSenders, setHiddenSenders] = useState<Set<string>>(() => loadSet(LS_HIDDEN_SNDR));
  const [showHidden, setShowHidden] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(LS_COLLAPSED, String(next)); } catch {}
      return next;
    });
  };

  const hideId = useCallback((key: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev); next.add(key); saveSet(LS_HIDDEN_IDS, next); return next;
    });
  }, []);

  const unhideId = useCallback((key: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev); next.delete(key); saveSet(LS_HIDDEN_IDS, next); return next;
    });
  }, []);

  const hideSender = useCallback((sender: string) => {
    setHiddenSenders(prev => {
      const next = new Set(prev); next.add(sender); saveSet(LS_HIDDEN_SNDR, next); return next;
    });
  }, []);

  const unhideSender = useCallback((sender: string) => {
    setHiddenSenders(prev => {
      const next = new Set(prev); next.delete(sender); saveSet(LS_HIDDEN_SNDR, next); return next;
    });
  }, []);

  const { data, isLoading } = useQuery<ActivityEvent[]>({
    queryKey: ['activity-feed'],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/activity`, { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const events = data ?? [];
  const hiddenCount = events.filter(e => hiddenIds.has(eventKey(e)) || hiddenSenders.has(e.title)).length;
  const visibleCount = events.length - hiddenCount;

  return (
    <div className="w-full max-w-5xl px-6 md:px-10 mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-2 group flex-1 min-w-0"
        >
          <Activity size={13} className="text-muted-foreground/70" />
          <span className="text-[10px] font-bold uppercase text-muted-foreground/60" style={{ letterSpacing: '0.2em' }}>
            Recent Activity
          </span>
          {!isLoading && visibleCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold leading-none">
              {visibleCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Show/hide hidden toggle — only visible when there are hidden items */}
          {hiddenCount > 0 && !collapsed && (
            <button
              onClick={() => setShowHidden(s => !s)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold transition-colors',
                showHidden
                  ? 'bg-primary/15 text-primary'
                  : 'bg-accent/50 text-muted-foreground hover:text-foreground',
              )}
              title={showHidden ? 'Hide hidden items' : `Show ${hiddenCount} hidden item${hiddenCount !== 1 ? 's' : ''}`}
            >
              {showHidden ? <EyeOff size={9} /> : <Eye size={9} />}
              {hiddenCount}
            </button>
          )}

          <button
            onClick={toggleCollapsed}
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden divide-y divide-border/20">
          {isLoading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <Activity size={20} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/50">No recent activity</p>
            </div>
          ) : (
            <div className="py-1">
              {events.map((event, i) => {
                const key = eventKey(event);
                const isHiddenItem = hiddenIds.has(key) || hiddenSenders.has(event.title);
                if (isHiddenItem && !showHidden) return null;
                return (
                  <ActivityRow
                    key={`${key}-${i}`}
                    event={event}
                    isHidden={isHiddenItem}
                    onHide={() => hideId(key)}
                    onUnhide={() => unhideId(key)}
                    onHideSender={() => hideSender(event.title)}
                    onUnhideSender={() => unhideSender(event.title)}
                  />
                );
              })}
              {/* Empty state when everything is hidden */}
              {visibleCount === 0 && !showHidden && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                  <EyeOff size={18} className="text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/50">
                    {hiddenCount} notification{hiddenCount !== 1 ? 's' : ''} hidden
                  </p>
                  <button
                    onClick={() => setShowHidden(true)}
                    className="text-[11px] text-primary/70 hover:text-primary transition-colors"
                  >
                    Show hidden
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
