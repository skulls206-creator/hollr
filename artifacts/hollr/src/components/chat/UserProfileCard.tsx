import { useRef, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { MessageSquare, AtSign, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import { getListDmThreadsQueryKey } from '@workspace/api-client-react';

function statusColor(status: string) {
  switch (status) {
    case 'online': return 'bg-emerald-500';
    case 'idle': return 'bg-yellow-400';
    case 'dnd': return 'bg-destructive';
    default: return 'bg-muted-foreground/40';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'online': return 'Online';
    case 'idle': return 'Idle';
    case 'dnd': return 'Do Not Disturb';
    default: return 'Offline';
  }
}

async function fetchUserProfile(userId: string) {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}api/users/${userId}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

interface Props {
  userId: string;
  joinedAt?: string;
  role?: string;
  onClose: () => void;
  position?: { x: number; y: number };
}

export function UserProfileCard({ userId, joinedAt, role, onClose, position }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [dmLoading, setDmLoading] = useState(false);
  const qc = useQueryClient();

  const { activeChannelId, setActiveDmThread, triggerMention, closeProfileCard } = useAppStore();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchUserProfile(userId),
    staleTime: 60_000,
  });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleMessage = async () => {
    if (!profile || dmLoading) return;
    setDmLoading(true);
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}api/dms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('Failed to open DM');
      const thread = await res.json();
      // Seed the DM threads cache immediately so Layout resolves the recipient name/avatar
      // before the background refetch completes
      qc.setQueryData(getListDmThreadsQueryKey(), (old: any[]) => {
        const existing = (old || []).filter((t: any) => t.id !== thread.id);
        return [...existing, thread];
      });
      setActiveDmThread(thread.id);
      closeProfileCard();
    } catch (err) {
      console.error('[ProfileCard] DM open failed:', err);
    } finally {
      setDmLoading(false);
    }
  };

  const handleMention = () => {
    if (!profile) return;
    const name = profile.displayName || profile.username;
    triggerMention(name);
    closeProfileCard();
  };

  const style = position
    ? {
        position: 'fixed' as const,
        left: Math.min(position.x, window.innerWidth - 300),
        top: Math.min(position.y, window.innerHeight - 300),
        zIndex: 100,
      }
    : { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 100 };

  return (
    <div
      ref={cardRef}
      style={style}
      className="w-72 bg-[#1E1F22] rounded-2xl shadow-2xl border border-border/20 overflow-hidden z-[101]"
    >
        {/* Color banner */}
        <div className="h-16 bg-gradient-to-br from-indigo-600 to-purple-700" />

        {/* Avatar */}
        <div className="px-4 pb-4">
          <div className="flex items-start justify-between -mt-8 mb-3">
            <div className="relative">
              <Avatar className="h-16 w-16 border-[4px] border-[#1E1F22] rounded-full">
                <AvatarImage src={profile?.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-white text-xl">
                  {isLoading ? '…' : getInitials(profile?.displayName || profile?.username || '?')}
                </AvatarFallback>
              </Avatar>
              {profile && (
                <div className={cn(
                  'absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-[#1E1F22]',
                  statusColor(profile.status)
                )} style={{ width: 18, height: 18 }} />
              )}
            </div>
            <button onClick={onClose} className="mt-2 text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <div className="h-4 bg-secondary rounded animate-pulse w-32" />
              <div className="h-3 bg-secondary rounded animate-pulse w-24" />
            </div>
          ) : profile ? (
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-foreground text-base leading-tight">{profile.displayName}</h3>
                <p className="text-sm text-muted-foreground">@{profile.username}</p>
              </div>

              {profile.customStatus && (
                <p className="text-xs text-muted-foreground italic">{profile.customStatus}</p>
              )}

              <div className="h-px bg-border/20" />

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', statusColor(profile.status))} />
                  <span>{statusLabel(profile.status)}</span>
                </div>
                {joinedAt && (
                  <p>Joined server {format(new Date(joinedAt), 'MMM d, yyyy')}</p>
                )}
                {role && (
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold capitalize">{role}</span>
                  </div>
                )}
              </div>

              <div className="h-px bg-border/20" />

              <div className="flex gap-2">
                <button
                  onClick={handleMessage}
                  disabled={dmLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-medium text-foreground transition-colors disabled:opacity-60"
                >
                  {dmLoading ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                  Message
                </button>
                <button
                  onClick={handleMention}
                  disabled={!activeChannelId}
                  title={!activeChannelId ? 'Open a text channel first' : 'Insert mention in composer'}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-medium text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <AtSign size={13} />
                  Mention
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Profile not found.</p>
          )}
        </div>
    </div>
  );
}
