import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Plus, MessageSquare, ExternalLink, Trash2, RotateCcw, Copy, LayoutGrid } from 'lucide-react';
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
          <div
            className={cn(
              'w-full h-full flex items-center justify-center rounded-xl transition-all duration-200 overflow-hidden',
              isActive
                ? 'rounded-xl ring-2 ring-primary ring-offset-1 ring-offset-background'
                : 'hover:scale-[1.03]'
            )}
          >
            {children}
          </div>
          {unreadCount != null && unreadCount > 0 && !isActive && (
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 bg-destructive text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none z-10">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          {/* Active dot */}
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
      style={{
        background: `linear-gradient(135deg, ${app.gradient[0]} 0%, ${app.gradient[1]} 100%)`,
      }}
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

export function DockBar() {
  const { activeServerId, setActiveServer, setCreateServerModalOpen, dmUnreadCounts } = useAppStore();
  const { data: servers = [] } = useListMyServers();
  const mouseX = useMotionValue(Infinity);
  const { show: showMenu } = useContextMenu();
  const totalDmUnread = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);
  const { visibleApps, hasAnyDismissed, dismissOne, dismissAll, restoreAll } = useKhurkDismissals();

  const handleAppContextMenu = (e: React.MouseEvent, app: KhurkApp) => {
    e.preventDefault();
    const actions: any[] = [
      {
        id: 'open', label: 'Open App', icon: <LayoutGrid size={14} />,
        onClick: () => window.open(app.url, '_blank', 'noopener'),
      },
      {
        id: 'open-tab', label: 'Open in New Tab', icon: <ExternalLink size={14} />,
        onClick: () => window.open(app.url, '_blank', 'noopener'),
      },
      {
        id: 'copy-url', label: 'Copy Link', icon: <Copy size={14} />,
        onClick: () => navigator.clipboard.writeText(app.url),
        dividerBefore: true,
      },
      {
        id: 'remove', label: 'Remove from Dock', icon: <Trash2 size={14} />,
        onClick: () => dismissOne(app.id),
        danger: true, dividerBefore: true,
      },
      {
        id: 'remove-all', label: 'Remove All KHURK Apps', icon: <Trash2 size={14} />,
        onClick: dismissAll, danger: true,
      },
    ];
    if (hasAnyDismissed) {
      actions.push({
        id: 'restore', label: 'Restore Hidden Apps', icon: <RotateCcw size={14} />,
        onClick: restoreAll, dividerBefore: true,
      });
    }
    showMenu({ x: e.clientX, y: e.clientY, actions });
  };

  const hasDockContent = servers.length > 0 || visibleApps.length > 0;

  return (
    <motion.div
      className="flex items-end justify-center w-full select-none pb-2"
      onMouseMove={(e) => { mouseX.set(e.clientX); }}
      onMouseLeave={() => { mouseX.set(Infinity); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex items-end gap-1.5 bg-background/70 backdrop-blur-2xl border border-border/30 shadow-2xl shadow-black/30 rounded-2xl px-3 py-2.5 max-w-[calc(100vw-2rem)] overflow-x-auto no-scrollbar"
        style={{ overflow: 'visible' }}
      >
        {/* DM / Home button */}
        <DockItem
          mouseX={mouseX}
          label="Direct Messages"
          isActive={activeServerId === null}
          unreadCount={totalDmUnread}
          onClick={() => setActiveServer(null)}
        >
          <div className={cn(
            'w-full h-full flex items-center justify-center',
            activeServerId === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground transition-colors'
          )}>
            <MessageSquare size={18} />
          </div>
        </DockItem>

        {/* Server list */}
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
                'w-full h-full flex items-center justify-center text-sm font-semibold',
                activeServerId === server.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
              )}>
                {getInitials(server.name)}
              </div>
            )}
          </DockItem>
        ))}

        {/* Add server */}
        <DockItem
          mouseX={mouseX}
          label="Add a Server"
          onClick={() => setCreateServerModalOpen(true)}
        >
          <div className="w-full h-full flex items-center justify-center bg-secondary text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors border border-dashed border-emerald-500/30 hover:border-transparent rounded-xl">
            <Plus size={16} />
          </div>
        </DockItem>

        {/* KHURK Apps divider + icons */}
        {visibleApps.length > 0 && (
          <>
            <div className="w-px self-stretch mx-0.5 bg-border/40 rounded-full" />
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

        {/* Restore button when all KHURK apps are hidden */}
        {visibleApps.length === 0 && hasAnyDismissed && (
          <>
            <div className="w-px self-stretch mx-0.5 bg-border/40 rounded-full" />
            <DockItem
              mouseX={mouseX}
              label="Restore KHURK Apps"
              onClick={restoreAll}
            >
              <div className="w-full h-full flex items-center justify-center bg-surface-2 text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/40 rounded-xl">
                <RotateCcw size={15} />
              </div>
            </DockItem>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
