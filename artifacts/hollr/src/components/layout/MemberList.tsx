import { useListServerMembers, getListServerMembersQueryKey } from '@workspace/api-client-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { Crown, ShieldCheck } from 'lucide-react';
import type { Member } from '@workspace/api-client-react';
import { useAppStore } from '@/store/use-app-store';

function statusColor(status: string) {
  switch (status) {
    case 'online': return 'bg-emerald-500';
    case 'idle': return 'bg-yellow-400';
    case 'dnd': return 'bg-destructive';
    default: return 'bg-muted-foreground/40';
  }
}

function MemberRow({ member }: { member: Member }) {
  const { openProfileCard } = useAppStore();
  const isOnline = member.user.status !== 'offline';

  const handleClick = (e: React.MouseEvent) => {
    openProfileCard({
      userId: member.userId,
      joinedAt: member.joinedAt,
      role: member.role,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer group text-left ${!isOnline ? 'opacity-50' : ''}`}
    >
      <div className="relative shrink-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={member.user.avatarUrl || undefined} />
          <AvatarFallback className="bg-primary text-white text-xs">
            {getInitials(member.user.displayName || member.user.username)}
          </AvatarFallback>
        </Avatar>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-[#2B2D31] ${statusColor(member.user.status)}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-foreground truncate">
            {member.user.displayName || member.user.username}
          </span>
          {member.role === 'owner' && <Crown size={12} className="text-yellow-400 shrink-0" />}
          {member.role === 'admin' && <ShieldCheck size={12} className="text-primary shrink-0" />}
        </div>
        {member.user.customStatus && (
          <p className="text-xs text-muted-foreground truncate">{member.user.customStatus}</p>
        )}
      </div>
    </button>
  );
}

export function MemberList({ serverId }: { serverId: string }) {
  const { data: members = [], isLoading } = useListServerMembers(serverId, {
    query: { queryKey: getListServerMembersQueryKey(serverId) },
  });

  const online = members.filter(m => m.user.status !== 'offline');
  const offline = members.filter(m => m.user.status === 'offline');

  if (isLoading) {
    return (
      <div className="w-[240px] bg-[#2B2D31] shrink-0 flex items-center justify-center border-l border-border/5">
        <p className="text-xs text-muted-foreground">Loading members…</p>
      </div>
    );
  }

  return (
    <div className="w-[240px] bg-[#2B2D31] shrink-0 flex flex-col h-full border-l border-border/5 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar">

        {online.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
              Online — {online.length}
            </p>
            <div className="space-y-[2px]">
              {online.map(m => <MemberRow key={m.userId} member={m} />)}
            </div>
          </div>
        )}

        {offline.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
              Offline — {offline.length}
            </p>
            <div className="space-y-[2px]">
              {offline.map(m => <MemberRow key={m.userId} member={m} />)}
            </div>
          </div>
        )}

        {members.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No members found.</p>
        )}
      </div>
    </div>
  );
}
