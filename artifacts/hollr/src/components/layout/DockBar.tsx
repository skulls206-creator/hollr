import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Plus, MessageSquare, ExternalLink, Trash2, RotateCcw, Copy, LayoutGrid, RefreshCw, Settings, ServerIcon } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '@/store/use-app-store';
import { useListMyServers } from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { useKhurkDismissals } from '@/hooks/use-khurk-dismissals';
import { KHURK_APPS, HollrIcon, type KhurkApp } from '@/lib/khurk-apps';

const ICON_BASE = 40;
const MAX_SCALE = 1.7;
const SCALE_RANGE: [number, number, number] = [0, 80, 160];
const SCALE_OUTPUT: [number, number, number] = [MAX_SCALE, 1.3, 1.0];

// ─── Types for the flat sortable list ───────────────────────────────────────

type DockEntryServer = { kind: 'server'; id: string };
type DockEntryApp = { kind: 'app'; id: string };
type DockEntry = DockEntryServer | DockEntryApp;

// ─── Order persistence ───────────────────────────────────────────────────────

const LS_KEY = 'hollr:dock:order';

function loadOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveOrder(ids: string[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(ids)); } catch {}
}

// ─── Magnification ───────────────────────────────────────────────────────────

interface DockItemProps {
  mouseX: ReturnType<typeof useMotionValue<number>>;
  label: string;
  sublabel?: string;
  isActive?: boolean;
  unreadCount?: number;
  isDragging?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

function DockItem({
  mouseX, label, sublabel, isActive, unreadCount, isDragging,
  onClick, onContextMenu, children,
}: DockItemProps) {
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
          style={{
            scale: isDragging ? 1 : scale,
            transformOrigin: 'bottom center',
            width: ICON_BASE,
            height: ICON_BASE,
            opacity: isDragging ? 0 : 1,
          }}
          className={cn(
            'relative shrink-0 flex items-center justify-center rounded-xl pointer-events-auto transition-opacity duration-150',
            isActive && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
          )}
        >
          <div className="w-full h-full flex items-center justify-center rounded-xl overflow-hidden">
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

// ─── Sortable wrapper ─────────────────────────────────────────────────────────
// IMPORTANT: the ref/transform/listeners live on the *wrapper div*, NOT on the
// motion.button inside DockItem. Using display:contents on the wrapper gave
// dnd-kit a zero-rect → ghost snapped to 0,0 (top-left). Using inline-flex
// gives it a proper measured box. Keeping transforms off the motion.button
// also prevents conflicts between dnd-kit translate and Framer Motion scale.

function SortableDockItem(props: DockItemProps & { id: string }) {
  const { id, ...rest } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        touchAction: 'none',
      }}
    >
      <DockItem {...rest} isDragging={isDragging} />
    </div>
  );
}

// ─── Standalone overlay ghost (no magnification, just floats) ────────────────

function OverlayIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ width: ICON_BASE, height: ICON_BASE }}
      className="relative flex items-center justify-center"
    >
      <motion.div
        className="w-full h-full rounded-xl overflow-hidden shadow-2xl shadow-black/60 ring-2 ring-white/20"
        initial={{ scale: 1.08 }}
        animate={{ scale: 1.08 }}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ─── KhurkDockIcon ────────────────────────────────────────────────────────────

function KhurkDockIcon({ app }: { app: KhurkApp }) {
  const fit = app.iconFit ?? 'cover';
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)` }}
    >
      {app.imageSrc ? (
        <img
          src={app.imageSrc}
          alt={app.name}
          className={fit === 'contain' ? 'w-[82%] h-[82%] object-contain' : 'w-full h-full object-cover'}
        />
      ) : (
        <HollrIcon size={Math.round(ICON_BASE * 0.55)} />
      )}
    </div>
  );
}


// ─── Main DockBar ─────────────────────────────────────────────────────────────

// ─── Server icon gradient (seeded from name so each server has a stable colour)

const SERVER_GRAD_PAIRS: [string, string][] = [
  ['#5b21b6', '#7c3aed'],
  ['#1d4ed8', '#3b82f6'],
  ['#047857', '#10b981'],
  ['#b45309', '#f59e0b'],
  ['#be185d', '#ec4899'],
  ['#0e7490', '#22d3ee'],
  ['#dc2626', '#f87171'],
  ['#4338ca', '#818cf8'],
];

function serverGradient(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return SERVER_GRAD_PAIRS[Math.abs(h) % SERVER_GRAD_PAIRS.length];
}

export function DockBar() {
  const {
    activeServerId, setActiveServer, setCreateServerModalOpen, dmUnreadCounts, setNewDmModalOpen,
    setActiveKhurkAppId, activeDmThreadId, setActiveDmThread,
    khurkDashboardOpen, setKhurkDashboardOpen, openKhurkDashboard, activeKhurkAppId,
  } = useAppStore();
  const totalDmUnread = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);
  const { data: servers = [] } = useListMyServers();
  const mouseX = useMotionValue(Infinity);
  const { show: showMenu } = useContextMenu();
  const { visibleApps, hasAnyDismissed, dismissOne, dismissAll, restoreAll } = useKhurkDismissals();

  // Build the canonical ordered list: servers first, then KHURK apps
  const buildDefaultEntries = useCallback((): DockEntry[] => {
    const s: DockEntry[] = servers.map(s => ({ kind: 'server', id: s.id }));
    const a: DockEntry[] = visibleApps.map(a => ({ kind: 'app', id: a.id }));
    return [...s, ...a];
  }, [servers, visibleApps]);

  const [entries, setEntries] = useState<DockEntry[]>([]);

  // Use stable primitive keys as deps — array references from servers/visibleApps
  // change every render (new Array from .filter / React Query), which would cause
  // an infinite loop if we depended on them directly.
  const serverIds = servers.map(s => s.id).join(',');
  const appIds = visibleApps.map(a => a.id).join(',');

  // Sync entries when server list or apps change (add new ones, remove old ones)
  useEffect(() => {
    const saved = loadOrder();
    const defaults = buildDefaultEntries();
    const defaultIds = defaults.map(e => e.id);

    if (!saved) {
      setEntries(defaults);
      return;
    }

    // Keep saved order, but add any new entries that don't exist yet
    const savedFiltered = saved
      .filter(id => defaultIds.includes(id))
      .map(id => defaults.find(e => e.id === id)!);
    const newEntries = defaults.filter(e => !saved.includes(e.id));
    setEntries([...savedFiltered, ...newEntries]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverIds, appIds]);

  // dnd sensors — mouse: 5px movement; touch: 600ms long-press (fires AFTER the
  // native contextmenu event at ~500ms so they never clash), 10px tolerance so
  // a finger wiggle during the hold doesn't cancel the drag
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 600, tolerance: 10 } }),
  );

  const [activeEntry, setActiveEntry] = useState<DockEntry | null>(null);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const entry = entries.find(e => e.id === active.id) ?? null;
    setActiveEntry(entry);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveEntry(null);
    if (!over || active.id === over.id) return;
    setEntries(prev => {
      const oldIdx = prev.findIndex(e => e.id === active.id);
      const newIdx = prev.findIndex(e => e.id === over.id);
      const next = arrayMove(prev, oldIdx, newIdx);
      saveOrder(next.map(e => e.id));
      return next;
    });
  };

  const handleAppClick = (app: KhurkApp) => {
    if (app.openMode === 'tab') {
      window.open(app.url, '_blank', 'noopener');
    } else {
      setActiveKhurkAppId(app.id);
    }
  };

  const handleAppContextMenu = (e: React.MouseEvent, app: KhurkApp) => {
    e.preventDefault();
    const actions: any[] = [
      {
        id: 'open',
        label: app.openMode === 'tab' ? 'Open in New Tab' : 'Open App',
        icon: <LayoutGrid size={14} />,
        onClick: () => handleAppClick(app),
      },
      { id: 'open-tab', label: 'Open in New Tab', icon: <ExternalLink size={14} />, onClick: () => window.open(app.url, '_blank', 'noopener') },
      { id: 'copy-url', label: 'Copy Link', icon: <Copy size={14} />, onClick: () => navigator.clipboard.writeText(app.url), dividerBefore: true },
      { id: 'remove', label: 'Remove from Dock', icon: <Trash2 size={14} />, onClick: () => dismissOne(app.id), danger: true, dividerBefore: true },
      { id: 'remove-all', label: 'Remove All KHURK Apps', icon: <Trash2 size={14} />, onClick: dismissAll, danger: true },
    ];
    if (hasAnyDismissed) {
      actions.push({ id: 'restore', label: 'Restore Hidden Apps', icon: <RotateCcw size={14} />, onClick: restoreAll, dividerBefore: true });
    }
    showMenu({ x: e.clientX, y: e.clientY, actions, title: app.name, subtitle: app.tagline, titleIcon: app.imageSrc });
  };

  const handleHollrRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const actions = [
      { id: 'refresh', label: 'Refresh', icon: <RefreshCw size={14} />, onClick: () => window.location.reload() },
      { id: 'dms', label: 'Direct Messages', icon: <MessageSquare size={14} />, onClick: () => setActiveServer(null), dividerBefore: true },
      ...servers.slice(0, 5).map(s => ({
        id: `srv-${s.id}`, label: s.name, icon: <ServerIcon size={14} />, onClick: () => setActiveServer(s.id),
      })),
      { id: 'settings', label: 'Settings', icon: <Settings size={14} />, onClick: () => useAppStore.getState().setUserSettingsModalOpen(true), dividerBefore: true },
    ];
    showMenu({ x: e.clientX, y: e.clientY, actions, title: 'hollr.chat', subtitle: 'Real-time messaging & voice' });
  };

  // Hollr icon magnification
  const hollrMotionRef = useRef<HTMLButtonElement>(null);
  const hollrDistance = useTransform(mouseX, (x: number) => {
    const el = hollrMotionRef.current;
    if (!el || x === Infinity) return Infinity;
    const { left, width } = el.getBoundingClientRect();
    return Math.abs(x - (left + width / 2));
  });
  const hollrScaleRaw = useTransform(hollrDistance, SCALE_RANGE, SCALE_OUTPUT, { clamp: true });
  const hollrScale = useSpring(hollrScaleRaw, { mass: 0.1, stiffness: 180, damping: 14 });

  // Render the content for any sortable entry
  const renderEntryContent = (entry: DockEntry) => {
    if (entry.kind === 'server') {
      const server = servers.find(s => s.id === entry.id);
      if (!server) return null;
      return (
        <SortableDockItem
          key={server.id}
          id={server.id}
          mouseX={mouseX}
          label={server.name}
          isActive={activeServerId === server.id}
          onClick={() => setActiveServer(server.id)}
        >
          {server.iconUrl ? (
            <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover rounded-xl" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-sm font-bold rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${serverGradient(server.name)[0]} 0%, ${serverGradient(server.name)[1]} 100%)` }}
            >
              {getInitials(server.name)}
            </div>
          )}
        </SortableDockItem>
      );
    } else {
      const app = visibleApps.find(a => a.id === entry.id);
      if (!app) return null;
      return (
        <SortableDockItem
          key={app.id}
          id={app.id}
          mouseX={mouseX}
          label={app.name}
          sublabel={app.tagline}
          onClick={() => handleAppClick(app)}
          onContextMenu={(e) => handleAppContextMenu(e, app)}
        >
          <KhurkDockIcon app={app} />
        </SortableDockItem>
      );
    }
  };

  // Content for DragOverlay ghost
  const renderOverlayContent = () => {
    if (!activeEntry) return null;
    if (activeEntry.kind === 'server') {
      const server = servers.find(s => s.id === activeEntry.id);
      if (!server) return null;
      return (
        <OverlayIcon>
          {server.iconUrl ? (
            <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${serverGradient(server.name)[0]} 0%, ${serverGradient(server.name)[1]} 100%)` }}
            >
              {getInitials(server.name)}
            </div>
          )}
        </OverlayIcon>
      );
    } else {
      const app = visibleApps.find(a => a.id === activeEntry.id);
      if (!app) return null;
      return (
        <OverlayIcon>
          <KhurkDockIcon app={app} />
        </OverlayIcon>
      );
    }
  };

  const serverEntries = entries.filter(e => e.kind === 'server');
  const appEntries = entries.filter(e => e.kind === 'app');
  const hasAppSeparator = appEntries.length > 0 && serverEntries.length > 0;

  return (
    // DndContext is the single root. The DragOverlay uses a portal so it
    // renders at document.body regardless of where it sits in the JSX tree —
    // Framer Motion's CSS transform on the dock pill won't displace it.
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-end justify-center w-full select-none">
        <motion.div
          onPointerMove={(e) => { if (e.pointerType === 'mouse') mouseX.set(e.clientX); }}
          onPointerLeave={() => { mouseX.set(Infinity); }}
          onPointerUp={() => { mouseX.set(Infinity); }}
          onTouchEnd={() => { mouseX.set(Infinity); }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative flex items-end bg-background/70 backdrop-blur-2xl border border-border/30 shadow-2xl shadow-black/30 rounded-2xl px-4 py-2.5"
          style={{ overflow: 'visible', maxWidth: '100%', pointerEvents: 'auto' }}
        >
          {/* ── hollr logo — toggles the KHURK OS Dashboard ── */}
          <div className="relative shrink-0" style={{ paddingLeft: '30px', marginLeft: '-30px' }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  ref={hollrMotionRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    const dashboardActive = khurkDashboardOpen && !activeServerId && !activeDmThreadId && !activeKhurkAppId;
                    if (dashboardActive) {
                      setKhurkDashboardOpen(false);
                    } else {
                      openKhurkDashboard();
                    }
                  }}
                  onContextMenu={handleHollrRightClick}
                  style={{ scale: hollrScale, transformOrigin: 'bottom right', width: ICON_BASE, height: ICON_BASE }}
                  className="relative shrink-0 flex items-center justify-center"
                >
                  <div
                    className={cn(
                      'w-full h-full rounded-xl overflow-hidden shadow-lg transition-all duration-200',
                      khurkDashboardOpen && !activeServerId && !activeDmThreadId && !activeKhurkAppId
                        ? 'ring-2 ring-[#22d3ee] ring-offset-1 ring-offset-background'
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
                  {khurkDashboardOpen && !activeServerId && !activeDmThreadId && !activeKhurkAppId && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-foreground" />
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="top" className="mb-1">
                <p className="font-bold text-xs">KHURK OS</p>
                <p className="text-[10px] text-muted-foreground">Tap to toggle app launcher · Right-click for nav</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Divider separating KHURK OS from nav buttons */}
          <div className="w-px self-stretch mx-2 bg-border/40 rounded-full shrink-0" />

          {/* ── DM button — wrapped in DockItem for macOS-style magnification ── */}
          <div className="shrink-0">
            <DockItem
              mouseX={mouseX}
              label="Direct Messages"
              sublabel={activeServerId === null && !khurkDashboardOpen && !activeDmThreadId ? 'Click to start a new DM' : undefined}
              isActive={activeServerId === null && !khurkDashboardOpen}
              unreadCount={totalDmUnread}
              onClick={() => {
                if (khurkDashboardOpen) {
                  setKhurkDashboardOpen(false);
                } else if (activeServerId === null && !activeDmThreadId) {
                  setNewDmModalOpen(true);
                } else {
                  setActiveServer(null);
                }
              }}
            >
              <div className={cn(
                'w-full h-full flex items-center justify-center transition-all duration-200',
                activeServerId === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-2 text-muted-foreground hover:bg-primary/20 hover:text-primary'
              )}>
                <MessageSquare size={Math.round(ICON_BASE * 0.42)} />
              </div>
            </DockItem>
          </div>

          {/* Divider */}
          <div className="w-px self-stretch mx-2 bg-border/40 rounded-full shrink-0" />

          {/* ── Scrollable sortable area ──
               overflow-y: 'clip' is crucial here. CSS spec forces overflow-y to
               become 'auto' (i.e. hidden) when overflow-x is 'auto', UNLESS we
               use 'clip'. With clip, overflow-x: auto can coexist. The paddingTop
               + negative marginTop give headroom inside the element's padding box
               (which 'clip' does NOT cut off) so magnified icons can pop upward
               without being clipped. */}
          <div
            className="flex items-end gap-3 min-w-0 [&::-webkit-scrollbar]:hidden"
            style={{
              overflowX: 'auto',
              overflowY: 'clip',
              // pointer-events: none on the scrollable container so the 56px
              // invisible headroom zone (paddingTop) never blocks taps to
              // elements above the dock (user panel, settings buttons, etc.).
              // Each icon button restores pointer-events: auto individually.
              pointerEvents: 'none',
              paddingTop: '56px',
              marginTop: '-56px',
              paddingBottom: '8px',
              marginBottom: '-8px',
              // Left/right padding ensures the first and last icons are never
              // flush-clipped at the scroll boundary (especially when magnified).
              paddingLeft: '8px',
              paddingRight: '12px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch' as any,
            }}
          >
            <SortableContext items={entries.map(e => e.id)} strategy={horizontalListSortingStrategy}>
              {/* Servers */}
              {serverEntries.map(entry => renderEntryContent(entry))}

              {/* Add Server (never sortable, stays after servers) */}
              <DockItem mouseX={mouseX} label="Add a Server" onClick={() => setCreateServerModalOpen(true)}>
                <div className="w-full h-full flex items-center justify-center bg-secondary text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors border border-dashed border-emerald-500/30 hover:border-transparent rounded-xl">
                  <Plus size={16} />
                </div>
              </DockItem>

              {/* App separator */}
              {hasAppSeparator && (
                <div className="w-px self-stretch mx-0 bg-border/40 rounded-full shrink-0" />
              )}

              {/* KHURK Apps */}
              {appEntries.map(entry => renderEntryContent(entry))}
            </SortableContext>

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

      {/* DragOverlay is inside DndContext but outside the animated motion.div
          so Framer Motion's CSS transform never displaces the ghost position */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
        {renderOverlayContent()}
      </DragOverlay>
    </DndContext>
  );
}
