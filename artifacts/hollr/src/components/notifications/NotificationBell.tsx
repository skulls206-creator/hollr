import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { NotificationPanel } from './NotificationPanel';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const notificationUnread = useAppStore(s => s.notificationUnread);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = () => setOpen(o => !o);
  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className="relative">
      <button
        onMouseDown={(e) => {
          if (open) {
            e.preventDefault();
          }
        }}
        onClick={toggle}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150',
          'text-muted-foreground hover:text-foreground hover:bg-accent',
          open && 'bg-accent text-foreground'
        )}
        title="Notifications"
        aria-label="Open notifications"
      >
        <Bell size={18} />
        {notificationUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold leading-none pointer-events-none">
            {notificationUnread > 99 ? '99+' : notificationUnread}
          </span>
        )}
      </button>

      <NotificationPanel open={open} onClose={close} containerRef={containerRef} />
    </div>
  );
}

export function useInitNotifications() {
  const setNotifications = useAppStore(s => s.setNotifications);

  useEffect(() => {
    fetch(`${BASE}api/notifications`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: import('@/store/use-app-store').AppNotification[]) => {
        setNotifications(data);
        // Seed per-thread DM unread row badges from server notification data
        // This fixes reload badge loss where localStorage was prematurely updated
        const store = useAppStore.getState();
        const activeDmThreadId = store.activeDmThreadId;
        const perThread: Record<string, number> = {};
        data.forEach(n => {
          if (n.read || n.type !== 'dm_message' || !n.link) return;
          const match = n.link.match(/[?&]threadId=([^&]+)/);
          if (!match) return;
          const tid = match[1];
          if (tid === activeDmThreadId) return; // skip currently open thread
          perThread[tid] = (perThread[tid] ?? 0) + 1;
        });
        // Only set counts where the notification data shows unread — don't clear existing ones
        Object.entries(perThread).forEach(([tid, count]) => {
          const existing = store.dmUnreadCounts[tid] ?? 0;
          if (count > existing) {
            // Set to the server count (more accurate than the localStorage-based one)
            const diff = count - existing;
            for (let i = 0; i < diff; i++) store.incrementDmUnreadCount(tid);
          }
        });
      })
      .catch(() => {});
  }, [setNotifications]);
}
