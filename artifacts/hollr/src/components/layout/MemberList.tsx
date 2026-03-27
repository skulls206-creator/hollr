import { useState, useRef } from 'react';
import { useListServerMembers, getListServerMembersQueryKey, getListDmThreadsQueryKey } from '@workspace/api-client-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { Crown, ShieldCheck, UserX, Ban, Loader2, Copy, MessageSquare, AtSign, User, ShieldBan } from 'lucide-react';
import { KhurkDiamondBadge } from '@/components/ui/KhurkDiamondBadge';
import type { Member } from '@workspace/api-client-react';
import { useAppStore } from '@/store/use-app-store';
import { useAuth } from '@workspace/replit-auth-web';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useContextMenu } from '@/contexts/ContextMenuContext';

const BASE = import.meta.env.BASE_URL;

function statusColor(status: string) {
  switch (status) {
    case 'online': return 'bg-emerald-500';
    case 'idle': return 'bg-yellow-400';
    case 'dnd': return 'bg-destructive';
    default: return 'bg-muted-foreground/40';
  }
}

function roleLabel(role: string) {
  if (role === 'owner') return 'Server Owner';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

function MemberRow({
  member,
  serverId,
  canModerate,
  actorRole,
}: {
  member: Member;
  serverId: string;
  canModerate: boolean;
  actorRole: string;
}) {
  const { openProfileCard, setActiveDmThread, triggerMention } = useAppStore();
  const { user: me } = useAuth();
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { show: showMenu } = useContextMenu();
  const isOnline = member.user.status !== 'offline';
  const isSelf = member.userId === me?.id;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canActOn =
    canModerate &&
    !isSelf &&
    member.role !== 'owner' &&
    !(actorRole === 'admin' && member.role === 'admin');

  const handleClick = (e: React.MouseEvent) => {
    openProfileCard({
      userId: member.userId,
      joinedAt: member.joinedAt,
      role: member.role,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const openDm = async () => {
    if (isSelf) return;
    try {
      const res = await fetch(`${BASE}api/dms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: member.userId }),
      });
      if (!res.ok) throw new Error('Failed to open DM');
      const thread = await res.json();
      qc.setQueryData(getListDmThreadsQueryKey(), (old: any[]) => {
        const existing = (old || []).filter((t: any) => t.id !== thread.id);
        return [...existing, thread];
      });
      setActiveDmThread(thread.id);
    } catch {
      toast({ title: 'Could not open DM', variant: 'destructive' });
    }
  };

  const doAction = async (action: 'kick' | 'ban') => {
    setBusy(true);
    try {
      const url = action === 'kick'
        ? `${BASE}api/servers/${serverId}/members/${member.userId}`
        : `${BASE}api/servers/${serverId}/bans/${member.userId}`;
      const method = action === 'kick' ? 'DELETE' : 'POST';
      const res = await fetch(url, { method, credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to ${action}`);
      }
      toast({ title: action === 'kick' ? 'Member kicked' : 'Member banned' });
      qc.invalidateQueries({ queryKey: getListServerMembersQueryKey(serverId) });
    } catch (err: any) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const actions: any[] = [
      {
        id: 'view-profile',
        label: 'View Profile',
        icon: <User size={14} />,
        onClick: () => openProfileCard({
          userId: member.userId,
          joinedAt: member.joinedAt,
          role: member.role,
          position: { x: e.clientX, y: e.clientY },
        }),
      },
    ];

    if (!isSelf) {
      actions.push(
        {
          id: 'message',
          label: 'Message',
          icon: <MessageSquare size={14} />,
          onClick: openDm,
        },
        {
          id: 'mention',
          label: 'Mention in Chat',
          icon: <AtSign size={14} />,
          onClick: () => triggerMention(member.user.displayName || member.user.username),
        },
      );
    }

    actions.push(
      {
        id: 'copy-username',
        label: 'Copy Username',
        icon: <Copy size={14} />,
        onClick: () => navigator.clipboard.writeText(member.user.username || ''),
        dividerBefore: true,
      },
      {
        id: 'copy-id',
        label: 'Copy User ID',
        icon: <Copy size={14} />,
        onClick: () => navigator.clipboard.writeText(member.userId),
      },
      {
        id: 'role-label',
        label: roleLabel(member.role),
        icon: member.role === 'owner'
          ? <Crown size={14} />
          : member.role === 'admin'
            ? <ShieldCheck size={14} />
            : <User size={14} />,
        onClick: () => {},
        disabled: true,
        dividerBefore: true,
      },
    );

    if (canActOn) {
      actions.push(
        {
          id: 'kick',
          label: 'Kick Member',
          icon: <UserX size={14} />,
          onClick: () => doAction('kick'),
          danger: true,
          dividerBefore: true,
        },
        {
          id: 'ban',
          label: 'Ban Member',
          icon: <ShieldBan size={14} />,
          onClick: () => doAction('ban'),
          danger: true,
        },
      );
    }

    showMenu({ x: e.clientX, y: e.clientY, actions });
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      onTouchStart={e => {
        const touch = e.touches[0];
        const x = touch.clientX;
        const y = touch.clientY;
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          handleContextMenu({ clientX: x, clientY: y, preventDefault: () => {}, stopPropagation: () => {} } as any);
        }, 400);
      }}
      onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
      onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
      className={`flex items-center gap-3 px-2 py-2 rounded-md hover:bg-secondary/50 transition-colors group ${!isOnline ? 'opacity-50' : ''}`}
    >
      <button
        onClick={handleClick}
        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
      >
        <div className="relative shrink-0">
          <Avatar className="h-10 w-10">
            <AvatarImage src={member.user.avatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-white text-sm">
              {getInitials(member.user.displayName || member.user.username)}
            </AvatarFallback>
          </Avatar>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-[#2B2D31] ${statusColor(member.user.status ?? '')}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate min-w-0">
              {member.user.displayName || member.user.username}
            </span>
            {member.user.isSupporter && <KhurkDiamondBadge size="md" />}
            {member.role === 'owner' && <Crown size={13} className="text-yellow-400 shrink-0" />}
            {member.role === 'admin' && <ShieldCheck size={13} className="text-primary shrink-0" />}
          </div>
          {member.user.customStatus && (
            <p className="text-xs text-muted-foreground truncate">{member.user.customStatus}</p>
          )}
        </div>
      </button>

      {canActOn && (
        <button
          onClick={(e) => { e.stopPropagation(); handleContextMenu(e); }}
          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded transition-all shrink-0"
          disabled={busy}
          title="Member options"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
        </button>
      )}
    </div>
  );
}

export function MemberList({ serverId }: { serverId: string }) {
  const { user: me } = useAuth();
  const { data: members = [], isLoading } = useListServerMembers(serverId, {
    query: { queryKey: getListServerMembersQueryKey(serverId) },
  });

  const myMembership = members.find(m => m.userId === me?.id);
  const myRole = myMembership?.role ?? 'member';
  const canModerate = myRole === 'owner' || myRole === 'admin';

  const online = members.filter(m => m.user.status !== 'offline');
  const offline = members.filter(m => m.user.status === 'offline');

  if (isLoading) {
    return (
      <div className="w-[240px] bg-surface-1 shrink-0 flex items-center justify-center border-l border-border/5">
        <p className="text-xs text-muted-foreground">Loading members…</p>
      </div>
    );
  }

  const renderMember = (m: Member) => (
    <MemberRow
      key={m.userId}
      member={m}
      serverId={serverId}
      canModerate={canModerate}
      actorRole={myRole}
    />
  );

  return (
    <div className="w-[240px] bg-surface-2 shrink-0 flex flex-col h-full border-l border-border/5 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar">

        {online.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
              Online — {online.length}
            </p>
            <div className="space-y-[2px]">
              {online.map(renderMember)}
            </div>
          </div>
        )}

        {offline.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
              Offline — {offline.length}
            </p>
            <div className="space-y-[2px]">
              {offline.map(renderMember)}
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
