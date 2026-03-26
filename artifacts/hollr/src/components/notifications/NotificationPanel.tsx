import { useEffect, useRef, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, MessageSquare, AtSign, PhoneMissed, Info, CheckCheck, X } from 'lucide-react';
import { useAppStore, type AppNotification } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { applyNav } from '@/lib/notification-nav';

const BASE = import.meta.env.BASE_URL;

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  containerRef?: RefObject<HTMLDivElement | null>;
}

function typeIcon(type: AppNotification['type']) {
  switch (type) {
    case 'dm_message': return <MessageSquare size={14} />;
    case 'mention':    return <AtSign size={14} />;
    case 'missed_call': return <PhoneMissed size={14} />;
    case 'system':     return <Info size={14} />;
  }
}

function typeColor(type: AppNotification['type']) {
  switch (type) {
    case 'dm_message': return 'text-violet-400 bg-violet-500/15';
    case 'mention':    return 'text-amber-400 bg-amber-500/15';
    case 'missed_call': return 'text-red-400 bg-red-500/15';
    case 'system':     return 'text-blue-400 bg-blue-500/15';
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationPanel({ open, onClose, containerRef }: NotificationPanelProps) {
  const { notifications, notificationUnread, setNotifications, markNotificationRead, markAllNotificationsRead } = useAppStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const doFetch = () => {
      fetch(`${BASE}api/notifications`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then(data => setNotifications(data))
        .catch(() => {});
    };
    doFetch();
    const interval = setInterval(doFetch, 30_000);
    return () => clearInterval(interval);
  }, [open, setNotifications]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePanel = panelRef.current?.contains(target);
      const insideContainer = containerRef?.current?.contains(target);
      if (!insidePanel && !insideContainer) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open, onClose, containerRef]);

  const handleClickNotification = (n: AppNotification) => {
    if (!n.read) {
      markNotificationRead(n.id);
      fetch(`${BASE}api/notifications/${n.id}/read`, { method: 'POST', credentials: 'include' }).catch(() => {});
    }
    if (n.link) {
      const url = new URL(n.link, window.location.href);
      const navType = url.searchParams.get('navType');
      if (navType === 'dm') {
        applyNav({ type: 'dm', threadId: url.searchParams.get('threadId') ?? '' });
      } else if (navType === 'channel') {
        applyNav({ type: 'channel', serverId: url.searchParams.get('serverId') ?? '', channelId: url.searchParams.get('channelId') ?? '' });
      }
    }
    onClose();
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead();
    fetch(`${BASE}api/notifications/read-all`, { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 20, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.97 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="absolute right-0 top-full mt-2 w-[360px] max-h-[520px] flex flex-col rounded-2xl border border-border/60 bg-card shadow-2xl z-50 overflow-hidden"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-primary" />
              <span className="text-sm font-bold text-foreground">Notifications</span>
              {notificationUnread > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-destructive text-destructive-foreground leading-none">
                  {notificationUnread > 99 ? '99+' : notificationUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {notificationUnread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-accent transition-colors"
                  title="Mark all read"
                >
                  <CheckCheck size={13} />
                  Mark all read
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 py-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Bell size={22} className="text-primary/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">You're all caught up</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No notifications yet</p>
                </div>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                    !n.read && 'bg-primary/5'
                  )}
                >
                  <div className={cn('w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5', typeColor(n.type))}>
                    {typeIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-[13px] font-semibold leading-tight truncate', n.read ? 'text-muted-foreground' : 'text-foreground')}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(n.createdAt)}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{n.body}</p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
