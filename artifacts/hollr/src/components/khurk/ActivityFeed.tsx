import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, UserPlus, MessageCircle, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { applyNav } from '@/lib/notification-nav';

const BASE = import.meta.env.BASE_URL;
const LS_KEY = 'hollr:activity-feed:collapsed';

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

function ActivityRow({ event }: { event: ActivityEvent }) {
  const { setActiveServer, setActiveDmThread } = useAppStore();

  const handleClick = () => {
    if (event.threadId) {
      applyNav({ type: 'dm', threadId: event.threadId });
    } else if (event.serverId && event.channelId) {
      applyNav({ type: 'channel', serverId: event.serverId, channelId: event.channelId });
    } else if (event.serverId) {
      setActiveServer(event.serverId);
    }
  };

  const initials = event.title
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-accent/50 transition-colors text-left group"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {event.avatarUrl ? (
          <img
            src={event.avatarUrl}
            alt=""
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
            {initials.slice(0, 2)}
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
    try { return localStorage.getItem(LS_KEY) === 'true'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(LS_KEY, String(next)); } catch {}
      return next;
    });
  };

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

  return (
    <div className="w-full max-w-5xl px-6 md:px-10 mb-6">
      {/* Section header */}
      <button
        onClick={toggleCollapsed}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-muted-foreground/70" />
          <span className="text-[10px] font-bold uppercase text-muted-foreground/60" style={{ letterSpacing: '0.2em' }}>
            Recent Activity
          </span>
          {!isLoading && events.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold leading-none">
              {events.length}
            </span>
          )}
        </div>
        <span className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </span>
      </button>

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
              {events.map((event, i) => (
                <ActivityRow key={`${event.type}-${event.timestamp}-${i}`} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
