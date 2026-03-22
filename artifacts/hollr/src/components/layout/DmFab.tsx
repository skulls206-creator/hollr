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
            'relative flex items-center justify-center w-9 h-9 rounded-xl shadow-lg transition-colors duration-200',
            isActive
              ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background'
              : 'bg-background/75 backdrop-blur-xl border border-border/40 text-foreground hover:bg-primary hover:text-primary-foreground'
          )}
        >
          <MessageSquare size={17} />
          {totalDmUnread > 0 && !isActive && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-1 bg-destructive text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
              {totalDmUnread > 99 ? '99+' : totalDmUnread}
            </span>
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-semibold mb-1 text-xs">Direct Messages</TooltipContent>
    </Tooltip>
  );
}
