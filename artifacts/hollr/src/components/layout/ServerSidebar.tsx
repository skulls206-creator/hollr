import { Plus, MessageSquare, UserPlus, Settings, LogOut, Copy, Bell, Hash, ExternalLink, Trash2, RotateCcw, LayoutGrid, RefreshCw, HelpCircle, ServerIcon } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useListMyServers } from '@workspace/api-client-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getInitials } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useAuth } from '@workspace/replit-auth-web';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useCallback } from 'react';
import { KHURK_APPS, HollrIcon, type KhurkApp } from '@/lib/khurk-apps';

const BASE = import.meta.env.BASE_URL;

export function useKhurkDismissals() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchDismissed = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${BASE}api/khurk-apps/dismissed`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDismissed(new Set(data.dismissed ?? []));
      }
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { fetchDismissed(); }, [fetchDismissed]);

  const dismissOne = useCallback(async (appId: string) => {
    setDismissed(prev => new Set([...prev, appId]));
    await fetch(`${BASE}api/khurk-apps/dismiss/${appId}`, { method: 'POST', credentials: 'include' });
  }, []);

  const dismissAll = useCallback(async () => {
    setDismissed(new Set(KHURK_APPS.map(a => a.id)));
    await fetch(`${BASE}api/khurk-apps/dismiss-all`, { method: 'POST', credentials: 'include' });
  }, []);

  const restoreAll = useCallback(async () => {
    setDismissed(new Set());
    await fetch(`${BASE}api/khurk-apps/dismissed`, { method: 'DELETE', credentials: 'include' });
  }, []);

  const visibleApps = KHURK_APPS.filter(a => !dismissed.has(a.id));
  const hasAnyDismissed = dismissed.size > 0;

  return { visibleApps, hasAnyDismissed, dismissOne, dismissAll, restoreAll };
}

function KhurkAppIcon({ app }: { app: KhurkApp }) {
  const fit = app.iconFit ?? 'cover';
  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)` }}
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

export function ServerSidebar() {
  const {
    activeServerId, setActiveServer, setCreateServerModalOpen,
    dmUnreadCounts, setInviteModalOpen, setServerSettingsModalOpen,
    setUserSettingsModalOpen, setJoinServerModalOpen, setHelpModalOpen,
  } = useAppStore();
  const { data: servers = [] } = useListMyServers();
  const { user } = useAuth();
  const { show: showMenu } = useContextMenu();
  const { toast } = useToast();
  const totalDmUnread = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);
  const { visibleApps, hasAnyDismissed, dismissOne, dismissAll, restoreAll } = useKhurkDismissals();

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
      {
        id: 'go', label: server.id === activeServerId ? 'Currently Viewing' : 'Go to Server',
        icon: <Hash size={14} />, onClick: () => setActiveServer(server.id),
        disabled: server.id === activeServerId,
      },
      {
        id: 'invite', label: 'Invite People', icon: <UserPlus size={14} />,
        onClick: () => { setActiveServer(server.id); setInviteModalOpen(true); },
        dividerBefore: true,
      },
      { id: 'copy-name', label: 'Copy Server Name', icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(server.name) },
      { id: 'copy-id', label: 'Copy Server ID', icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(server.id) },
    ];
    if (isOwner) {
      actions.push({ id: 'settings', label: 'Server Settings', icon: <Settings size={14} />, onClick: () => { setActiveServer(server.id); setServerSettingsModalOpen(true); }, dividerBefore: true });
    }
    if (!isOwner) {
      actions.push({ id: 'leave', label: 'Leave Server', icon: <LogOut size={14} />, onClick: () => leaveServer(server.id, server.name), danger: true, dividerBefore: true });
    }
    showMenu({ x: e.clientX, y: e.clientY, actions });
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

  const handleAppContextMenu = (e: React.MouseEvent, app: KhurkApp) => {
    e.preventDefault();
    const actions: any[] = [
      { id: 'open', label: 'Open App', icon: <LayoutGrid size={14} />, onClick: () => window.open(app.url, '_blank', 'noopener') },
      { id: 'open-tab', label: 'Open in New Tab', icon: <ExternalLink size={14} />, onClick: () => window.open(app.url, '_blank', 'noopener') },
      { id: 'copy-url', label: 'Copy Link', icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(app.url), dividerBefore: true },
      { id: 'remove', label: 'Remove from Sidebar', icon: <Trash2 size={14} />, onClick: () => dismissOne(app.id), danger: true, dividerBefore: true },
      { id: 'remove-all', label: 'Remove All KHURK Apps', icon: <Trash2 size={14} />, onClick: dismissAll, danger: true },
    ];
    if (hasAnyDismissed) {
      actions.push({ id: 'restore', label: 'Restore Hidden Apps', icon: <RotateCcw size={14} />, onClick: restoreAll, dividerBefore: true });
    }
    showMenu({
      x: e.clientX,
      y: e.clientY,
      actions,
      title: app.name,
      subtitle: app.tagline,
      titleIcon: app.imageSrc,
    });
  };

  // Hollr icon right-click — navigate to sections, cannot remove
  const handleHollrContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const actions: any[] = [
      { id: 'refresh', label: 'Refresh', icon: <RefreshCw size={14} />, onClick: () => window.location.reload() },
      { id: 'dms', label: 'Direct Messages', icon: <MessageSquare size={14} />, onClick: () => setActiveServer(null), dividerBefore: true },
    ];
    if (servers.length > 0) {
      servers.slice(0, 5).forEach(s => {
        actions.push({ id: `srv-${s.id}`, label: s.name, icon: <ServerIcon size={14} />, onClick: () => setActiveServer(s.id) });
      });
    }
    actions.push(
      { id: 'new-server', label: 'Create a Server', icon: <Plus size={14} />, onClick: () => setCreateServerModalOpen(true), dividerBefore: true },
      { id: 'join-server', label: 'Join a Server', icon: <UserPlus size={14} />, onClick: () => setJoinServerModalOpen(true) },
      { id: 'settings', label: 'Settings', icon: <Settings size={14} />, onClick: () => setUserSettingsModalOpen(true), dividerBefore: true },
      { id: 'help', label: 'Help', icon: <HelpCircle size={14} />, onClick: () => setHelpModalOpen(true) },
    );
    showMenu({ x: e.clientX, y: e.clientY, actions, title: 'hollr.chat', subtitle: 'Real-time messaging & voice' });
  };

  return (
    <div className="w-[72px] bg-surface-0 shrink-0 flex flex-col items-center py-3 gap-2 overflow-y-auto overflow-x-hidden no-scrollbar border-r border-border/10 z-20">

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
              "w-12 h-12 flex items-center justify-center transition-all duration-300 overflow-hidden",
              activeServerId === null
                ? "bg-primary text-primary-foreground rounded-2xl"
                : "bg-secondary text-foreground rounded-[24px] group-hover:rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground"
            )}>
              <MessageSquare size={24} />
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

      {/* Server List */}
      {servers.map((server) => (
        <Tooltip key={server.id}>
          <TooltipTrigger asChild>
            <motion.button
              onClick={() => setActiveServer(server.id)}
              onContextMenu={(e) => handleServerContextMenu(e, server)}
              className="relative group flex items-center justify-center w-full h-12"
              whileTap={{ scale: 0.92 }}
            >
              <div className={cn(
                "absolute left-0 w-1 bg-foreground rounded-r-full transition-all duration-300",
                activeServerId === server.id ? "h-10 opacity-100" : "h-0 opacity-0 group-hover:h-5 group-hover:opacity-100"
              )} />
              <div className={cn(
                "w-12 h-12 flex items-center justify-center transition-all duration-300 overflow-hidden shadow-sm",
                activeServerId === server.id
                  ? "bg-primary text-primary-foreground rounded-2xl shadow-primary/20"
                  : "bg-secondary text-foreground rounded-[24px] group-hover:rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground"
              )}>
                {server.iconUrl
                  ? <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover" />
                  : <span className="font-medium text-lg tracking-wider">{getInitials(server.name)}</span>
                }
              </div>
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-semibold ml-2">{server.name}</TooltipContent>
        </Tooltip>
      ))}

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

      {/* ── KHURK Apps ── */}
      {(visibleApps.length > 0 || hasAnyDismissed) && (
        <>
          <div className="w-full flex flex-col items-center gap-1 mt-2 px-3">
            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-border/50 to-transparent" />
            <span className="text-[7.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground/35 select-none">KHURK</span>
          </div>

          {visibleApps.map((app) => (
            <Tooltip key={app.id}>
              <TooltipTrigger asChild>
                <motion.button
                  onClick={() => window.open(app.url, '_blank', 'noopener')}
                  onContextMenu={(e) => handleAppContextMenu(e, app)}
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
          ))}

          {visibleApps.length === 0 && hasAnyDismissed && (
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

      {/* ── Spacer pushes hollr icon to the bottom ── */}
      <div className="flex-1" />

      {/* ── Permanent hollr icon — pinned to bottom, never removable ── */}
      <div className="w-full flex flex-col items-center gap-1 pb-1 px-3">
        <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-border/30 to-transparent mb-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              onClick={() => window.location.reload()}
              onContextMenu={handleHollrContextMenu}
              className="relative group flex items-center justify-center w-full h-12"
              whileTap={{ scale: 0.92 }}
            >
              <div
                className="w-12 h-12 flex items-center justify-center transition-all duration-300 overflow-hidden shadow-lg rounded-[24px] group-hover:rounded-2xl group-hover:shadow-primary/40 group-hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)' }}
              >
                <HollrIcon size={26} />
              </div>
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="right" className="ml-2 p-2">
            <p className="font-bold text-xs">hollr.chat</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Click to refresh · Right-click for menu</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
