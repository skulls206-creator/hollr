import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useListMyServers } from '@workspace/api-client-react';
import { cn, getInitials } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const ICON_BASE = 36;
const MAX_SCALE = 1.75;
const SCALE_RANGE: [number, number, number] = [0, 70, 140];
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
              'w-full h-full flex items-center justify-center rounded-xl transition-all duration-200 overflow-hidden',
              isActive
                ? 'rounded-xl ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary text-primary-foreground'
                : 'bg-secondary text-foreground hover:rounded-xl hover:bg-primary hover:text-primary-foreground'
            )}
          >
            {children}
          </div>
          {unreadCount != null && unreadCount > 0 && !isActive && (
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 bg-destructive text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none z-10">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-semibold mb-1 text-xs">{label}</TooltipContent>
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
        animate={{ opacity: isVisible ? 1 : 0.5, y: isVisible ? 0 : 3 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="flex items-end gap-2 bg-background/75 backdrop-blur-xl border border-border/40 shadow-lg rounded-2xl px-3 py-2"
        style={{ overflow: 'visible' }}
      >
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
              <span className="font-semibold text-sm tracking-wide">{getInitials(server.name)}</span>
            )}
          </DockItem>
        ))}

        {servers.length > 0 && (
          <div className="w-px h-5 bg-border/60 rounded-full self-center shrink-0 mx-0.5" />
        )}

        <DockItem
          mouseX={mouseX}
          label="Add a Server"
          onClick={() => setCreateServerModalOpen(true)}
        >
          <Plus size={16} className="text-emerald-400" />
        </DockItem>
      </motion.div>
    </motion.div>
  );
}
