import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useListMyServers } from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const ICON_BASE = 48;
const MAX_SCALE = 1.75;
const SCALE_RANGE: [number, number, number] = [0, 80, 160];
const SCALE_OUTPUT: [number, number, number] = [MAX_SCALE, 1.3, 1.0];

interface DockItemProps {
  mouseX: ReturnType<typeof useMotionValue<number>>;
  label: string;
  isActive?: boolean;
  unreadCount?: number;
  onClick: () => void;
  children: React.ReactNode;
}

function DockItem({ mouseX, label, isActive, unreadCount, onClick, children }: DockItemProps) {
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
          style={{ scale, transformOrigin: 'bottom center', width: ICON_BASE, height: ICON_BASE }}
          className="relative shrink-0 flex items-center justify-center"
        >
          <div
            className={cn(
              'w-full h-full flex items-center justify-center rounded-[24px] transition-all duration-200 overflow-hidden shadow-lg',
              isActive
                ? 'rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary text-primary-foreground'
                : 'bg-surface-1 text-foreground hover:rounded-2xl hover:bg-primary hover:text-primary-foreground'
            )}
          >
            {children}
          </div>
          {unreadCount != null && unreadCount > 0 && !isActive && (
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-destructive text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none z-10">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-semibold mb-2">{label}</TooltipContent>
    </Tooltip>
  );
}

export function DockBar() {
  const { activeServerId, setActiveServer, setCreateServerModalOpen } = useAppStore();
  const { data: servers = [] } = useListMyServers();
  const mouseX = useMotionValue(Infinity);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isVisible = hovered || mobileOpen;


  return (
    <motion.div
      className="flex items-end justify-center w-full select-none"
      onMouseMove={(e) => { mouseX.set(e.clientX); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { mouseX.set(Infinity); setHovered(false); }}
      onTouchStart={() => setMobileOpen((v) => !v)}
    >
      <motion.div
        animate={{ opacity: isVisible ? 1 : 0.55, y: isVisible ? 0 : 4 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex items-end gap-2.5 bg-surface-0/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl px-4 py-3"
        style={{ overflow: 'visible' }}
      >
        {servers.map((server) => {
          const serverUnread = 0;
          return (
            <DockItem
              key={server.id}
              mouseX={mouseX}
              label={server.name}
              isActive={activeServerId === server.id}
              unreadCount={serverUnread}
              onClick={() => setActiveServer(server.id)}
            >
              {server.iconUrl ? (
                <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-semibold text-base tracking-wide">{getInitials(server.name)}</span>
              )}
            </DockItem>
          );
        })}

        {servers.length > 0 && (
          <div className="w-px h-8 bg-white/10 rounded-full self-center shrink-0 mx-0.5" />
        )}

        <DockItem
          mouseX={mouseX}
          label="Add a Server"
          onClick={() => setCreateServerModalOpen(true)}
        >
          <Plus size={22} className="text-emerald-400 group-hover:text-white transition-colors" />
        </DockItem>
      </motion.div>
    </motion.div>
  );
}
