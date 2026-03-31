import { Plus, MessageSquare, UserPlus, Settings, LogOut, Copy, Bell, Hash, ExternalLink, Trash2, RotateCcw, LayoutGrid, RefreshCw, HelpCircle, ServerIcon, ArrowUp, ArrowDown, Lock, Unlock } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useListMyServers } from '@workspace/api-client-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getInitials } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useAuth } from '@workspace/replit-auth-web';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useRef, useCallback } from 'react';
import { KHURK_APPS, HollrIcon, getKhurkIconFilter, type KhurkApp, type KhurkThemeId } from '@/lib/khurk-apps';
import { useKhurkDismissals } from '@/hooks/use-khurk-dismissals';
import { SupporterDiamondButton } from '@/components/ui/SupporterDiamondButton';
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, closestCenter,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Persistence helpers ───────────────────────────────────────────────────────
const SIDEBAR_ORDER_KEY = 'hollr:sidebar:server-order';
const KHURK_ORDER_KEY   = 'hollr:sidebar:khurk-order';

function loadOrder(key: string): string[] | null {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveOrder(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
    // Broadcast to DashboardView (and any other subscriber) when the KHURK
    // app order changes, regardless of layout mode.
    if (key === KHURK_ORDER_KEY) {
      window.dispatchEvent(new CustomEvent('hollr:dock-order', { detail: ids }));
    }
  } catch {}
}

// Prefix used on KHURK drag IDs to keep them separate from server IDs in one DndContext
const KHURK_PREFIX = 'khurk:';

const BASE = import.meta.env.BASE_URL;

// ─── KHURK app icon renderer ──────────────────────────────────────────────────
function KhurkAppIcon({ app }: { app: KhurkApp }) {
  const fit = app.iconFit ?? 'cover';
  const theme = useAppStore(s => s.theme) as KhurkThemeId;
  const iconFilter = getKhurkIconFilter(theme, app.id);
  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
        filter: iconFilter || undefined,
        transition: 'filter 0.4s ease',
      }}
    >
      {app.imageSrc ? (
        <img
          src={app.imageSrc}
          alt={app.name}
          className={fit === 'contain' ? 'w-[82%] h-[82%] object-contain' : 'w-full h-full object-cover'}
        />
      ) : (
        <HollrIcon size={26} />
      )}
    </div>
  );
}

// ─── Sortable server icon ──────────────────────────────────────────────────────
function SortableServerItem({
  server, isActive, isPrivate, onClick, onContextMenu,
}: {
  server: any; isActive: boolean; isPrivate?: boolean; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: server.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined, touchAction: 'pan-y', opacity: isDragging ? 0 : 1 }}
      className="py-0.5 w-full"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            data-server-icon
            onClick={onClick}
            onContextMenu={onContextMenu}
            className="relative group flex items-center justify-center w-full h-12"
            whileTap={{ scale: 0.92 }}
          >
            <div className={cn(
              "absolute left-0 w-1 bg-foreground rounded-r-full transition-all duration-300",
              isActive ? "h-10 opacity-100" : "h-0 opacity-0 group-hover:h-5 group-hover:opacity-100"
            )} />
            <div className={cn(
              "w-12 h-12 flex items-center justify-center transition-all duration-300 overflow-hidden shadow-sm",
              isActive
                ? "bg-primary text-primary-foreground rounded-2xl shadow-primary/20"
                : "bg-secondary text-foreground rounded-[24px] group-hover:rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground"
            )}>
              {server.iconUrl
                ? <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover" />
                : <span className="font-medium text-lg tracking-wider">{getInitials(server.name)}</span>
              }
            </div>
            {isPrivate && (
              <span className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center rounded-full bg-surface-0 ring-1 ring-border/30 shadow-sm pointer-events-none">
                <Lock size={8} className="text-muted-foreground" />
              </span>
            )}
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-semibold ml-2">{server.name}</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── Sortable KHURK app icon ───────────────────────────────────────────────────
function SortableKhurkItem({
  app, onClick, onContextMenu,
}: {
  app: KhurkApp; onClick: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const sortableId = `${KHURK_PREFIX}${app.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined, touchAction: 'pan-y', opacity: isDragging ? 0 : 1 }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            data-app-icon
            onClick={onClick}
            onContextMenu={onContextMenu}
            className="relative group flex items-center justify-center w-full h-12"
            whileTap={{ scale: 0.9 }}
          >
            <div className="absolute left-0 w-1 rounded-r-full transition-all duration-300 h-0 group-hover:h-4 bg-white/40 opacity-0 group-hover:opacity-100" />
            <div className="w-12 h-12 transition-all duration-300 overflow-hidden shadow-md rounded-[24px] group-hover:rounded-2xl group-hover:shadow-xl group-hover:scale-105">
              <KhurkAppIcon app={app} />
            </div>
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="right" className="ml-2 p-2">
          <p className="font-bold text-xs">{app.name}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{app.tagline}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── Main sidebar ──────────────────────────────────────────────────────────────
export function ServerSidebar() {
  const {
    activeServerId, setActiveServer, setCreateServerModalOpen,
    dmUnreadCounts, activeDmThreadId, setInviteModalOpen, setServerSettingsModalOpen,
    setUserSettingsModalOpen, setJoinServerModalOpen, setHelpModalOpen,
    toggleServerPrivacy, isServerPrivate,
  } = useAppStore();
  const { data: rawServers = [] } = useListMyServers();
  const { user } = useAuth();
  const { show: showMenu } = useContextMenu();
  const { toast } = useToast();
  const totalDmUnread = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);
  const { visibleApps, hasAnyDismissed, dismissOne, dismissAll, restoreAll } = useKhurkDismissals();

  // ── Blank-area long-press (server rail) ──────────────────────────────────
  const railLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const railLongPressTriggered = useRef(false);

  const openRailContextMenu = useCallback((x: number, y: number) => {
    const store = useAppStore.getState();
    const actions: any[] = [
      {
        id: 'reload-app',
        label: 'Reload App',
        icon: <RefreshCw size={14} />,
        onClick: () => window.location.reload(),
      },
      {
        id: 'create-server',
        label: 'Create a Server',
        icon: <Plus size={14} />,
        onClick: () => store.setCreateServerModalOpen(true),
        dividerBefore: true,
      },
      {
        id: 'join-server',
        label: 'Join a Server',
        icon: <UserPlus size={14} />,
        onClick: () => store.setJoinServerModalOpen(true),
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: <Settings size={14} />,
        onClick: () => store.setUserSettingsModalOpen(true),
        dividerBefore: true,
      },
    ];
    showMenu({ x, y, actions });
  }, [showMenu]);

  const handleRailContextMenu = useCallback((e: React.MouseEvent) => {
    // Only fire on the rail background, not on any clickable icon button
    if ((e.target as HTMLElement).closest('button,a,[role="button"]')) return;
    e.preventDefault();
    openRailContextMenu(e.clientX, e.clientY);
  }, [openRailContextMenu]);

  const handleRailTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button,a,[role="button"]')) return;
    railLongPressTriggered.current = false;
    const touch = e.touches[0];
    const x = touch.clientX; const y = touch.clientY;
    railLongPressTimer.current = setTimeout(() => {
      railLongPressTriggered.current = true;
      openRailContextMenu(x, y);
    }, 600);
  }, [openRailContextMenu]);

  const handleRailTouchEnd = useCallback(() => {
    if (railLongPressTimer.current) { clearTimeout(railLongPressTimer.current); railLongPressTimer.current = null; }
  }, []);

  // ── Server order ──
  const [serverOrder, setServerOrder] = useState<string[]>([]);
  const rawServerIds = rawServers.map((s: any) => s.id).join(',');
  useEffect(() => {
    const saved = loadOrder(SIDEBAR_ORDER_KEY);
    const ids = rawServers.map((s: any) => s.id);
    if (!saved) { setServerOrder(ids); return; }
    const filtered = saved.filter((id: string) => ids.includes(id));
    const added = ids.filter((id: string) => !saved.includes(id));
    setServerOrder([...filtered, ...added]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawServerIds]);
  const servers = serverOrder.map((id: string) => rawServers.find((s: any) => s.id === id)).filter(Boolean) as any[];

  // ── KHURK app order ──
  const [khurkOrder, setKhurkOrder] = useState<string[]>([]);
  const visibleAppIds = visibleApps.map(a => a.id).join(',');
  useEffect(() => {
    const saved = loadOrder(KHURK_ORDER_KEY);
    const ids = visibleApps.map(a => a.id);
    if (!saved) { setKhurkOrder(ids); return; }
    const filtered = saved.filter((id: string) => ids.includes(id));
    const added = ids.filter((id: string) => !saved.includes(id));
    setKhurkOrder([...filtered, ...added]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAppIds]);
  const orderedApps = khurkOrder.map(id => visibleApps.find(a => a.id === id)).filter(Boolean) as KhurkApp[];

  // ── DND — single DndContext, two SortableContexts, routed by khurk: prefix ──
  const sidebarSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require a 250 ms hold before a drag activates.
        // If the pointer moves more than 8 px during that hold the drag is
        // cancelled, so a quick scroll swipe is never mistaken for a reorder.
        delay: 250,
        tolerance: 8,
      },
    }),
  );

  // Track which item type is being dragged: 'server' | 'khurk' | null
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const isDraggingKhurk = draggingId?.startsWith(KHURK_PREFIX) ?? false;
  const draggingServerId = !isDraggingKhurk ? draggingId : null;
  const draggingKhurkId  = isDraggingKhurk ? draggingId?.slice(KHURK_PREFIX.length) : null;

  const handleDragStart = ({ active }: DragStartEvent) => setDraggingId(active.id as string);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingId(null);
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;
    const overId   = over.id as string;

    if (activeId.startsWith(KHURK_PREFIX) && overId.startsWith(KHURK_PREFIX)) {
      // KHURK-to-KHURK reorder
      const rawActive = activeId.slice(KHURK_PREFIX.length);
      const rawOver   = overId.slice(KHURK_PREFIX.length);
      setKhurkOrder(prev => {
        const next = arrayMove(prev, prev.indexOf(rawActive), prev.indexOf(rawOver));
        saveOrder(KHURK_ORDER_KEY, next);
        return next;
      });
    } else if (!activeId.startsWith(KHURK_PREFIX) && !overId.startsWith(KHURK_PREFIX)) {
      // Server-to-server reorder
      setServerOrder(prev => {
        const next = arrayMove(prev, prev.indexOf(activeId), prev.indexOf(overId));
        saveOrder(SIDEBAR_ORDER_KEY, next);
        return next;
      });
    }
    // Cross-list drops are ignored
  };

  const leaveServer = async (serverId: string, serverName: string) => {
    if (!confirm(`Leave "${serverName}"? You can rejoin later if invited.`)) return;
    try {
      const res = await fetch(`${BASE}api/servers/${serverId}/leave`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error();
      if (activeServerId === serverId) setActiveServer(null);
      toast({ title: `Left ${serverName}` });
    } catch {
      toast({ title: 'Could not leave server', variant: 'destructive' });
    }
  };

  const handleServerContextMenu = (e: React.MouseEvent, server: any) => {
    e.preventDefault();
    const isOwner = server.ownerId === user?.id;
    const actions: any[] = [
      { id: 'go', label: server.id === activeServerId ? 'Currently Viewing' : 'Go to Server', icon: <Hash size={14} />, onClick: () => setActiveServer(server.id), disabled: server.id === activeServerId },
      { id: 'invite', label: 'Invite People', icon: <UserPlus size={14} />, onClick: () => { setActiveServer(server.id); setInviteModalOpen(true); }, dividerBefore: true },
      { id: 'copy-name', label: 'Copy Server Name', icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(server.name) },
      { id: 'copy-id', label: 'Copy Server ID', icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(server.id) },
    ];
    if (isOwner) actions.push({ id: 'settings', label: 'Server Settings', icon: <Settings size={14} />, onClick: () => { setActiveServer(server.id); setServerSettingsModalOpen(true); }, dividerBefore: true });
    const isPrivate = isServerPrivate(server.id);
    actions.push({
      id: 'privacy',
      label: isPrivate ? 'Make Public (Remove Privacy)' : 'Make Private (Hide from Search)',
      icon: isPrivate ? <Unlock size={14} /> : <Lock size={14} />,
      onClick: () => toggleServerPrivacy(server.id),
      dividerBefore: !isOwner,
    });
    if (!isOwner) actions.push({ id: 'leave', label: 'Leave Server', icon: <LogOut size={14} />, onClick: () => leaveServer(server.id, server.name), danger: true, dividerBefore: true });
    showMenu({ x: e.clientX, y: e.clientY, actions, title: server.name, titleIcon: server.iconUrl || undefined });
  };

  const handleDmContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    showMenu({
      x: e.clientX, y: e.clientY,
      actions: [
        { id: 'open-dms', label: 'Open Direct Messages', icon: <MessageSquare size={14} />, onClick: () => setActiveServer(null) },
        { id: 'mark-read', label: 'Mark All DMs Read', icon: <Bell size={14} />, onClick: () => Object.keys(dmUnreadCounts).forEach(id => useAppStore.getState().clearDmUnreadCount(id)), dividerBefore: true },
      ],
    });
  };

  const { setActiveKhurkAppId, openKhurkDashboard, khurkDashboardOpen, setKhurkDashboardOpen, activeKhurkAppId: activeApp } = useAppStore();

  const handleAppClick = (app: KhurkApp) => {
    if (app.openMode === 'tab') window.open(app.url, '_blank', 'noopener');
    else setActiveKhurkAppId(app.id);
  };

  const handleAppContextMenu = (e: React.MouseEvent, app: KhurkApp) => {
    e.preventDefault();
    const idx = khurkOrder.indexOf(app.id);
    const canMoveUp = idx > 0;
    const canMoveDown = idx < khurkOrder.length - 1;
    const moveApp = (from: number, to: number) => {
      setKhurkOrder(prev => {
        const next = [...prev];
        [next[from], next[to]] = [next[to], next[from]];
        saveOrder(KHURK_ORDER_KEY, next);
        return next;
      });
    };
    const actions: any[] = [
      { id: 'open', label: app.openMode === 'tab' ? 'Open in New Tab' : 'Open App', icon: <LayoutGrid size={14} />, onClick: () => handleAppClick(app) },
      { id: 'open-tab', label: 'Open in New Tab', icon: <ExternalLink size={14} />, onClick: () => window.open(app.url, '_blank', 'noopener') },
      ...(canMoveUp ? [{ id: 'move-up', label: 'Move Up', icon: <ArrowUp size={14} />, onClick: () => moveApp(idx, idx - 1), dividerBefore: true }] : []),
      ...(canMoveDown ? [{ id: 'move-down', label: 'Move Down', icon: <ArrowDown size={14} />, onClick: () => moveApp(idx, idx + 1), dividerBefore: !canMoveUp }] : []),
      { id: 'copy-url', label: 'Copy Link', icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(app.url), dividerBefore: true },
      { id: 'remove', label: 'Remove from Sidebar', icon: <Trash2 size={14} />, onClick: () => dismissOne(app.id), danger: true, dividerBefore: true },
      { id: 'remove-all', label: 'Remove All KHURK Apps', icon: <Trash2 size={14} />, onClick: dismissAll, danger: true },
    ];
    if (hasAnyDismissed) actions.push({ id: 'restore', label: 'Restore Hidden Apps', icon: <RotateCcw size={14} />, onClick: restoreAll, dividerBefore: true });
    showMenu({ x: e.clientX, y: e.clientY, actions, title: app.name, subtitle: app.tagline, titleIcon: app.imageSrc });
  };

  const handleHollrContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const actions: any[] = [
      { id: 'refresh', label: 'Refresh', icon: <RefreshCw size={14} />, onClick: () => window.location.reload() },
      { id: 'dms', label: 'Direct Messages', icon: <MessageSquare size={14} />, onClick: () => setActiveServer(null), dividerBefore: true },
    ];
    servers.slice(0, 5).forEach(s => actions.push({ id: `srv-${s.id}`, label: s.name, icon: <ServerIcon size={14} />, onClick: () => setActiveServer(s.id) }));
    actions.push(
      { id: 'new-server', label: 'Create a Server', icon: <Plus size={14} />, onClick: () => setCreateServerModalOpen(true), dividerBefore: true },
      { id: 'join-server', label: 'Join a Server', icon: <UserPlus size={14} />, onClick: () => setJoinServerModalOpen(true) },
      { id: 'settings', label: 'Settings', icon: <Settings size={14} />, onClick: () => setUserSettingsModalOpen(true), dividerBefore: true },
      { id: 'help', label: 'Help', icon: <HelpCircle size={14} />, onClick: () => setHelpModalOpen(true) },
    );
    showMenu({ x: e.clientX, y: e.clientY, actions, title: 'hollr.chat', subtitle: 'Real-time messaging & voice' });
  };

  // Drag ghost data
  const draggingServer = rawServers.find((sv: any) => sv.id === draggingServerId);
  const draggingKhurkApp = draggingKhurkId ? KHURK_APPS.find(a => a.id === draggingKhurkId) : null;
  const isAnyDragging = draggingId !== null;

  // Sortable ID lists (KHURK list uses prefixed IDs so they never collide with server IDs)
  const khurkSortableIds = khurkOrder.map(id => `${KHURK_PREFIX}${id}`);

  return (
    <DndContext
      sensors={sidebarSensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="w-[72px] h-full bg-surface-0 shrink-0 flex flex-col overflow-hidden border-r border-border/10 z-20">
      {/* ── Scrollable section (servers + apps) ── */}
      <div
        className={cn(
          "flex-1 flex flex-col items-center py-3 gap-2 overflow-x-hidden no-scrollbar",
          isAnyDragging ? "overflow-y-hidden" : "overflow-y-auto"
        )}
        onContextMenu={handleRailContextMenu}
        onTouchStart={handleRailTouchStart}
        onTouchEnd={handleRailTouchEnd}
        onTouchMove={handleRailTouchEnd}
      >

        {/* Direct Messages */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveServer(null)}
              onContextMenu={handleDmContextMenu}
              className="relative group flex items-center justify-center w-full h-12"
            >
              <div className={cn(
                "absolute left-0 w-1 bg-foreground rounded-r-full transition-all duration-300",
                activeServerId === null ? "h-10 opacity-100" : "h-0 opacity-0 group-hover:h-5 group-hover:opacity-100"
              )} />
              <div className={cn(
                "w-12 h-12 relative overflow-hidden transition-all duration-300",
                activeServerId === null ? "rounded-2xl" : "rounded-[24px] group-hover:rounded-2xl"
              )} style={{
                background: activeServerId === null
                  ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                  : 'hsl(var(--secondary))',
              }}>
                {/* Back bubble */}
                <div style={{
                  position: 'absolute', width: '54%', height: '50%',
                  top: '12%', right: '8%',
                  background: activeServerId === null
                    ? 'rgba(255,255,255,0.25)' : 'rgba(128,128,160,0.18)',
                  borderRadius: '7px 7px 2px 7px',
                }} />
                {/* Front bubble with typing dots */}
                <div style={{
                  position: 'absolute', width: '62%', height: '54%',
                  bottom: '12%', left: '8%',
                  background: activeServerId === null
                    ? 'rgba(255,255,255,0.93)' : 'rgba(128,128,160,0.35)',
                  borderRadius: '7px 7px 7px 2px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3.5px',
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: activeServerId === null ? '#6366f1' : 'rgba(128,128,180,0.7)',
                    }} />
                  ))}
                </div>
              </div>
              {totalDmUnread > 0 && activeServerId !== null && (
                <span className="absolute bottom-0.5 right-1 min-w-[16px] h-4 px-1 bg-destructive text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
                  {totalDmUnread > 99 ? '99+' : totalDmUnread}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-semibold ml-2">Direct Messages</TooltipContent>
        </Tooltip>

        <div className="w-8 h-[2px] bg-border/40 rounded-full my-1" />

        {/* ── Supporter diamond ── */}
        <SupporterDiamondButton variant="sidebar" />

        {/* ── Server list — drag-to-reorder ── */}
        <SortableContext items={serverOrder} strategy={verticalListSortingStrategy}>
          {servers.map((server) => (
            <SortableServerItem
              key={server.id}
              server={server}
              isActive={activeServerId === server.id}
              isPrivate={isServerPrivate(server.id)}
              onClick={() => setActiveServer(server.id)}
              onContextMenu={(e) => handleServerContextMenu(e, server)}
            />
          ))}
        </SortableContext>

        {/* Add Server */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setCreateServerModalOpen(true)} className="relative group flex items-center justify-center w-12 h-12 mt-1">
              <div className="w-12 h-12 flex items-center justify-center transition-all duration-300 overflow-hidden bg-secondary text-emerald-500 rounded-[24px] group-hover:rounded-2xl group-hover:bg-emerald-500 group-hover:text-white border border-dashed border-emerald-500/20 group-hover:border-transparent">
                <Plus size={24} />
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-semibold ml-2">Add a Server</TooltipContent>
        </Tooltip>

        {/* ── KHURK Apps — drag-to-reorder ── */}
        {(orderedApps.length > 0 || hasAnyDismissed) && (
          <>
            <div className="w-full flex flex-col items-center gap-1 mt-2 px-3">
              <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-border/50 to-transparent" />
              <span className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground/35 select-none">KHURK</span>
            </div>

            <SortableContext items={khurkSortableIds} strategy={verticalListSortingStrategy}>
              {orderedApps.map((app) => (
                <SortableKhurkItem
                  key={app.id}
                  app={app}
                  onClick={() => handleAppClick(app)}
                  onContextMenu={(e) => handleAppContextMenu(e, app)}
                />
              ))}
            </SortableContext>

            {orderedApps.length === 0 && hasAnyDismissed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={restoreAll} className="relative group flex items-center justify-center w-12 h-12">
                    <div className="w-12 h-12 flex items-center justify-center transition-all duration-300 overflow-hidden bg-surface-2 text-muted-foreground rounded-[24px] group-hover:rounded-2xl group-hover:text-foreground border border-dashed border-border/40">
                      <RotateCcw size={18} />
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-semibold ml-2">Restore KHURK Apps</TooltipContent>
              </Tooltip>
            )}
          </>
        )}

      </div>{/* end scrollable section */}

      {/* ── Hollr / KHURK OS icon — always pinned to the bottom, never scrolls ── */}
      <div
        className="shrink-0 flex flex-col items-center gap-1 px-3"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
      >
        <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-border/30 to-transparent mb-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              onClick={() => {
                const dashboardActive = khurkDashboardOpen && !activeServerId && !activeDmThreadId && !activeApp;
                if (dashboardActive) setKhurkDashboardOpen(false);
                else openKhurkDashboard();
              }}
              onContextMenu={handleHollrContextMenu}
              className="relative group flex items-center justify-center w-full h-12"
              whileTap={{ scale: 0.92 }}
            >
              <div className={cn(
                'w-12 h-12 flex items-center justify-center transition-all duration-300 overflow-hidden rounded-[24px] group-hover:rounded-2xl group-hover:scale-105',
                'shadow-lg group-hover:shadow-[0_0_16px_3px_rgba(34,211,238,0.35)]',
                khurkDashboardOpen && !activeServerId && !activeDmThreadId && !activeApp
                  ? 'ring-2 ring-[#22d3ee] ring-offset-2 ring-offset-surface-0 rounded-2xl'
                  : ''
              )}
                style={{ background: '#0a1a1f' }}
              >
                <img
                  src="/khurk-logo.png"
                  alt="KHURK OS"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="right" className="ml-2 p-2">
            <p className="font-bold text-xs">KHURK OS</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Click to toggle · Right-click for menu</p>
          </TooltipContent>
        </Tooltip>
      </div>
      </div>{/* end outer sidebar wrapper */}

      {/* DragOverlay — portalled to document.body, handles both server and KHURK ghosts */}
      <DragOverlay dropAnimation={{ duration: 160, easing: 'ease' }}>
        {draggingServer ? (
          <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-2 ring-white/20 opacity-90">
            {draggingServer.iconUrl
              ? <img src={draggingServer.iconUrl} alt={draggingServer.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground font-medium text-lg">{getInitials(draggingServer.name)}</div>
            }
          </div>
        ) : draggingKhurkApp ? (
          <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-2 ring-white/20 opacity-90">
            <KhurkAppIcon app={draggingKhurkApp} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
