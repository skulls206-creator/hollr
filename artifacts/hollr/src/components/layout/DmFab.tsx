import { MessageSquare } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from 'framer-motion';

export function DmFab() {
  const { activeServerId, setActiveServer, dmUnreadCounts } = useAppStore();
  const totalDmUnread = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);
  const isActive = activeServerId === null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          onClick={() => setActiveServer(null)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          className={cn(
            'relative flex items-center justify-center w-12 h-12 rounded-2xl shadow-lg transition-colors duration-200',
            isActive
              ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background'
              : 'bg-surface-0/90 backdrop-blur-xl border border-white/10 text-foreground hover:bg-primary hover:text-primary-foreground'
          )}
        >
          <MessageSquare size={22} />
          {totalDmUnread > 0 && !isActive && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-destructive text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
              {totalDmUnread > 99 ? '99+' : totalDmUnread}
            </span>
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-semibold mb-2">Direct Messages</TooltipContent>
    </Tooltip>
  );
}
