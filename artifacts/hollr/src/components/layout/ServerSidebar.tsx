import { Plus, MessageSquare } from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { useListMyServers } from '@workspace/api-client-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getInitials } from '@/lib/utils';
import { motion } from 'framer-motion';

export function ServerSidebar() {
  const { activeServerId, setActiveServer, setActiveDmThread, setCreateServerModalOpen } = useAppStore();
  const { data: servers = [] } = useListMyServers();

  return (
    <div className="w-[72px] bg-[#1E1F22] shrink-0 flex flex-col items-center py-3 gap-2 overflow-y-auto overflow-x-hidden no-scrollbar border-r border-border/10 z-20">
      
      {/* Direct Messages Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => {
              setActiveServer(null);
              // setActiveDmThread logic handled by clicking specific DMs later
            }}
            className="relative group flex items-center justify-center w-12 h-12"
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
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-semibold ml-2">Direct Messages</TooltipContent>
      </Tooltip>

      <div className="w-8 h-[2px] bg-border/40 rounded-full my-3" />

      {/* Server List */}
      {servers.map((server) => (
        <Tooltip key={server.id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveServer(server.id)}
              className="relative group flex items-center justify-center w-12 h-12"
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
                {server.iconUrl ? (
                  <img src={server.iconUrl} alt={server.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-medium text-lg tracking-wider">{getInitials(server.name)}</span>
                )}
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-semibold ml-2">{server.name}</TooltipContent>
        </Tooltip>
      ))}

      {/* Add Server Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setCreateServerModalOpen(true)}
            className="relative group flex items-center justify-center w-12 h-12 mt-2"
          >
            <div className="w-12 h-12 flex items-center justify-center transition-all duration-300 overflow-hidden bg-secondary text-emerald-500 rounded-[24px] group-hover:rounded-2xl group-hover:bg-emerald-500 group-hover:text-white border border-dashed border-emerald-500/20 group-hover:border-transparent">
              <Plus size={24} />
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-semibold ml-2">Add a Server</TooltipContent>
      </Tooltip>


    </div>
  );
}
