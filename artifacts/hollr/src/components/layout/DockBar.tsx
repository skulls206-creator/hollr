import { useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquare, ExternalLink, Trash2, RotateCcw, Copy, LayoutGrid, RefreshCw, Settings, HelpCircle, UserPlus, ServerIcon } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useListMyServers } from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { useKhurkDismissals } from '@/components/layout/ServerSidebar';
import { KHURK_APPS, HollrIcon, type KhurkApp } from '@/lib/khurk-apps';

const ICON_BASE = 40;
const MAX_SCALE = 1.7;
const SCALE_RANGE: [number, number, number] = [0, 80, 160];
const SCALE_OUTPUT: [number, number, number] = [MAX_SCALE, 1.3, 1.0];

interface DockItemProps {
  mouseX: ReturnType<typeof useMotionValue<number>>;
  label: string;
  sublabel?: string;
  isActive?: boolean;
  unreadCount?: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

function DockItem({ mouseX, label, sublabel, isActive, unreadCount, onClick, onContextMenu, children }: DockItemProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const distance = useTransform(mouseX, (x: number) => {
    const el = ref.current;
    if (!el || x === Infinity) return Infinity;
    const { left, width } = el.getBoundingClientRect();
    return Math.abs(x - (left + width / 2));
  });

  const scaleRaw = useTransform(distance, SCALE_RANGE, SCALE_OUTPUT, { clamp: true });
  const scale = useSpring(scaleRaw, { mass: 0.1, stiffness: 180, damping: 14 });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          ref={ref}
          onClick={onClick}
          onContextMenu={onContextMenu}
          style={{ scale, transformOrigin: 'bottom center', width: ICON_BASE, height: ICON_BASE }}
          className="relative shrink-0 flex items-center justify-center"
        >
          <div className={cn(
            'w-full h-full flex items-center justify-center rounded-xl overflow-hidden transition-all duration-200',
            isActive && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
          )}>
            {children}
          </div>
          {unreadCount != null && unreadCount > 0 && !isActive && (
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 bg-destructive text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none z-10">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          {isActive && (
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-foreground" />
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="mb-1">
        <p className="font-bold text-xs">{label}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground leading-tight">{sublabel}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

function KhurkDockIcon({ app }: { app: KhurkApp }) {
  return (
    <div
      className="w-full h-full"
      style={{ background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)` }}
    >
      {app.imageSrc ? (
        <img src={app.imageSrc} alt={app.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <HollrIcon size={Math.round(ICON_BASE * 0.55)} />
        </div>
      )}
    </div>
  );
}

// ── Mini start-menu panel shown on left-click of the hollr icon ──
function StartMenu({ onClose, servers }: { onClose: () => void; servers: any[] }) {
  const {
    setActiveServer, setCreateServerModalOpen, setJoinServerModalOpen,
    setUserSettingsModalOpen, setHelpModalOpen,
  } = useAppStore();

  const action = (fn: () => void) => { fn(); onClose(); };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.96 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-full left-0 mb-3 w-56 bg-surface-1/95 backdrop-blur-xl border border-border/40 shadow-2xl shadow-black/40 rounded-2xl overflow-hidden z-50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-border/20"
          style={{ background: 'linear-gradient(135deg, #2d0a8c22 0%, #5b21b622 100%)' }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm shrink-0"
            style={{ background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)' }}
          >
            <HollrIcon size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground leading-tight">hollr.chat</p>
            <p className="text-[9px] text-muted-foreground leading-tight">Chat & Communities</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="p-1.5 flex flex-col gap-0.5">
          <button
            onClick={() => { window.location.reload(); onClose(); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left text-sm hover:bg-primary/15 hover:text-primary transition-colors group"
          >
            <RefreshCw size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
            <span>Refresh Page</span>
          </button>
          <button
            onClick={() => action(() => setActiveServer(null))}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left text-sm hover:bg-white/5 transition-colors group"
          >
            <MessageSquare size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Direct Messages</span>
          </button>
        </div>

        {/* Servers section */}
        {servers.length > 0 && (
          <>
            <div className="px-4 py-1">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">Your Servers</p>
            </div>
            <div className="px-1.5 pb-1.5 flex flex-col gap-0.5 max-h-[160px] overflow-y-auto">
              {servers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => action(() => setActiveServer(s.id))}
                  className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-xl text-left text-sm hover:bg-white/5 transition-colors group"
                >
                  <div className="w-5 h-5 rounded-md overflow-hidden bg-secondary shrink-0">
                    {s.iconUrl
                      ? <img src={s.iconUrl} alt={s.name} className="w-full h-full object-cover" />
                      : <span className="w-full h-full flex items-center justify-center text-[8px] font-bold">{getInitials(s.name)}</span>
                    }
                  </div>
                  <span className="truncate text-xs">{s.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Bottom actions */}
        <div className="border-t border-border/20 p-1.5 flex flex-col gap-0.5">
          <button
            onClick={() => action(() => setCreateServerModalOpen(true))}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left text-sm hover:bg-white/5 transition-colors group"
          >
            <Plus size={14} className="text-emerald-400" />
            <span>Create a Server</span>
          </button>
          <button
            onClick={() => action(() => setJoinServerModalOpen(true))}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left text-sm hover:bg-white/5 transition-colors group"
          >
            <UserPlus size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Join a Server</span>
          </button>
          <button
            onClick={() => action(() => setUserSettingsModalOpen(true))}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left text-sm hover:bg-white/5 transition-colors group"
          >
            <Settings size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => action(() => setHelpModalOpen(true))}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left text-sm hover:bg-white/5 transition-colors group"
          >
            <HelpCircle size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>Help</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function DockBar() {
  const { activeServerId, setActiveServer, setCreateServerModalOpen } = useAppStore();
  const { data: servers = [] } = useListMyServers();
  const mouseX = useMotionValue(Infinity);
  const { show: showMenu } = useContextMenu();
  const { visibleApps, hasAnyDismissed, dismissOne, dismissAll, restoreAll } = useKhurkDismissals();
  const [startMenuOpen, setStartMenuOpen] = useState(false);

  // Close start menu on outside click
  const handleStartMenuToggle = useCallback(() => {
    setStartMenuOpen(v => !v);
  }, []);

  const handleAppContextMenu = (e: React.MouseEvent, app: KhurkApp) => {
    e.preventDefault();
    const actions: any[] = [
      { id: 'open', label: 'Open App', icon: <LayoutGrid size={14} />, onClick: () => window.open(app.url, '_blank', 'noopener') },
      { id: 'open-tab', label: 'Open in New Tab', icon: <ExternalLink size={14} />, onClick: () => window.open(app.url, '_blank', 'noopener') },
      { id: 'copy-url', label: 'Copy Link', icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(app.url), dividerBefore: true },
      { id: 'remove', label: 'Remove from Dock', icon: <Trash2 size={14} />, onClick: () => dismissOne(app.id), danger: true, dividerBefore: true },
      { id: 'remove-all', label: 'Remove All KHURK Apps', icon: <Trash2 size={14} />, onClick: dismissAll, danger: true },
    ];
    if (hasAnyDismissed) {
      actions.push({ id: 'restore', label: 'Restore Hidden Apps', icon: <RotateCcw size={14} />, onClick: restoreAll, dividerBefore: true });
    }
    showMenu({ x: e.clientX, y: e.clientY, actions });
  };

  const handleHollrRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setStartMenuOpen(false);
    const actions = [
      { id: 'refresh', label: 'Refresh', icon: <RefreshCw size={14} />, onClick: () => window.location.reload() },
      { id: 'dms', label: 'Direct Messages', icon: <MessageSquare size={14} />, onClick: () => setActiveServer(null), dividerBefore: true },
      ...servers.slice(0, 5).map(s => ({
        id: `srv-${s.id}`, label: s.name, icon: <ServerIcon size={14} />, onClick: () => setActiveServer(s.id),
      })),
      { id: 'settings', label: 'Settings', icon: <Settings size={14} />, onClick: () => useAppStore.getState().setUserSettingsModalOpen(true), dividerBefore: true },
    ];
    showMenu({ x: e.clientX, y: e.clientY, actions });
  };

  // Hollr DockItem ref for magnification
  const hollrMotionRef = useRef<HTMLButtonElement>(null);
  const hollrDistance = useTransform(mouseX, (x: number) => {
    const el = hollrMotionRef.current;
    if (!el || x === Infinity) return Infinity;
    const { left, width } = el.getBoundingClientRect();
    return Math.abs(x - (left + width / 2));
  });
  const hollrScaleRaw = useTransform(hollrDistance, SCALE_RANGE, SCALE_OUTPUT, { clamp: true });
  const hollrScale = useSpring(hollrScaleRaw, { mass: 0.1, stiffness: 180, damping: 14 });

  return (
    <div
      className="flex items-end justify-center w-full select-none pb-2"
      onClick={() => startMenuOpen && setStartMenuOpen(false)}
    >
      <motion.div
        onMouseMove={(e) => { mouseX.set(e.clientX); }}
        onMouseLeave={() => { mouseX.set(Infinity); }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative flex items-end bg-background/70 backdrop-blur-2xl border border-border/30 shadow-2xl shadow-black/30 rounded-2xl px-3 py-2.5"
        style={{ overflow: 'visible', maxWidth: 'calc(100vw - 2rem)' }}
      >
        {/* ── hollr start-menu button (leftmost, permanent, NOT in scroll area) ── */}
        <div className="relative shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                ref={hollrMotionRef}
                onClick={(e) => { e.stopPropagation(); handleStartMenuToggle(); }}
                onContextMenu={handleHollrRightClick}
                style={{ scale: hollrScale, transformOrigin: 'bottom center', width: ICON_BASE, height: ICON_BASE }}
                className="relative shrink-0 flex items-center justify-center"
              >
                <div
                  className={cn(
                    'w-full h-full rounded-xl overflow-hidden shadow-lg transition-all duration-200',
                    startMenuOpen && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                  )}
                  style={{ background: 'linear-gradient(135deg, #2d0a8c 0%, #5b21b6 100%)' }}
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <HollrIcon size={Math.round(ICON_BASE * 0.55)} />
                  </div>
                </div>
                {startMenuOpen && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="top" className="mb-1">
              <p className="font-bold text-xs">hollr.chat</p>
              <p className="text-[10px] text-muted-foreground">Click for menu · Right-click for quick nav</p>
            </TooltipContent>
          </Tooltip>

          {/* Start menu panel */}
          <AnimatePresence>
            {startMenuOpen && (
              <StartMenu
                servers={servers}
                onClose={() => setStartMenuOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Thin divider between hollr and the scrollable section */}
        <div className="w-px self-stretch mx-1.5 bg-border/40 rounded-full shrink-0" />

        {/* ── Scrollable area: servers + add + KHURK apps ── */}
        <div
          className="flex items-end gap-1.5 min-w-0 [&::-webkit-scrollbar]:hidden"
          style={{
            overflowX: 'auto',
            overflowY: 'visible',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch' as any,
          }}
        >
          {/* Servers */}
          {servers.map((server) => (
            <DockItem
              key={server.id}
              mouseX={mouseX}
              label={server.name}
              isActive={activeServerId === server.id}
              onClick={() => setActiveServer(server.id)}
            >
              {server.iconUrl ? (
                <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover" />
              ) : (
                <div className={cn(
                  'w-full h-full flex items-center justify-center text-sm font-semibold transition-colors',
                  activeServerId === server.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground'
                )}>
                  {getInitials(server.name)}
                </div>
              )}
            </DockItem>
          ))}

          {/* Add Server */}
          <DockItem mouseX={mouseX} label="Add a Server" onClick={() => setCreateServerModalOpen(true)}>
            <div className="w-full h-full flex items-center justify-center bg-secondary text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors border border-dashed border-emerald-500/30 hover:border-transparent rounded-xl">
              <Plus size={16} />
            </div>
          </DockItem>

          {/* KHURK Apps */}
          {visibleApps.length > 0 && (
            <>
              <div className="w-px self-stretch mx-0.5 bg-border/40 rounded-full shrink-0" />
              {visibleApps.map((app) => (
                <DockItem
                  key={app.id}
                  mouseX={mouseX}
                  label={app.name}
                  sublabel={app.tagline}
                  onClick={() => window.open(app.url, '_blank', 'noopener')}
                  onContextMenu={(e) => handleAppContextMenu(e, app)}
                >
                  <KhurkDockIcon app={app} />
                </DockItem>
              ))}
            </>
          )}

          {/* Restore button when all hidden */}
          {visibleApps.length === 0 && hasAnyDismissed && (
            <>
              <div className="w-px self-stretch mx-0.5 bg-border/40 rounded-full shrink-0" />
              <DockItem mouseX={mouseX} label="Restore KHURK Apps" onClick={restoreAll}>
                <div className="w-full h-full flex items-center justify-center bg-surface-2 text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/40 rounded-xl">
                  <RotateCcw size={15} />
                </div>
              </DockItem>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
