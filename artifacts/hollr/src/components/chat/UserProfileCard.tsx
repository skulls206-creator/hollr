import { useRef, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { MessageSquare, AtSign, X, Loader2, Phone, Star } from 'lucide-react';
import { KhurkDiamondBadge } from '@/components/ui/KhurkDiamondBadge';
import { GrandfatheredBadge } from '@/components/ui/GrandfatheredBadge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import { getListDmThreadsQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@workspace/replit-auth-web';
import { sendDmCallSignal } from '@/hooks/use-realtime';
import { useToast } from '@/hooks/use-toast';

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

async function fetchIsAdmin() {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}api/admin/check`, { credentials: 'include' });
  if (!res.ok) return { isAdmin: false };
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
  const [grandfatherLoading, setGrandfatherLoading] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { activeChannelId, setActiveDmThread, triggerMention, closeProfileCard, dmCall, setDmCallState } = useAppStore();
  const { user } = useAuth();

  const { data: profile, isLoading, refetch: refetchProfile } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchUserProfile(userId),
    staleTime: 60_000,
  });

  const { data: adminData } = useQuery({
    queryKey: ['admin-check'],
    queryFn: fetchIsAdmin,
    staleTime: 5 * 60_000,
  });

  const isAdmin = adminData?.isAdmin === true;

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

  const handleCall = async () => {
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
      qc.setQueryData(getListDmThreadsQueryKey(), (old: any[]) => {
        const existing = (old || []).filter((t: any) => t.id !== thread.id);
        return [...existing, thread];
      });
      setActiveDmThread(thread.id);
      setDmCallState({
        state: 'outgoing_ringing',
        targetUserId: userId,
        targetDisplayName: profile.displayName || profile.username,
        targetAvatarUrl: profile.avatarUrl ?? null,
        dmThreadId: thread.id,
        minimized: false,
        startedAt: null,
      });
      sendDmCallSignal({
        type: 'call_ring',
        targetId: userId,
        callerId: user?.id,
        callerName: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'Someone',
        callerAvatar: user?.profileImageUrl ?? null,
        dmThreadId: thread.id,
      });
      closeProfileCard();
    } catch (err) {
      console.error('[ProfileCard] Call failed:', err);
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

  const handleGrandfather = async () => {
    if (!profile || grandfatherLoading) return;
    setGrandfatherLoading(true);
    const base = import.meta.env.BASE_URL;
    const isCurrentlyGrandfathered = profile.isGrandfathered;
    try {
      const res = await fetch(`${base}api/admin/users/${userId}/grandfather`, {
        method: isCurrentlyGrandfathered ? 'DELETE' : 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast({ title: data.message });
      await refetchProfile();
      qc.invalidateQueries({ queryKey: ['user-profile', userId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setGrandfatherLoading(false);
    }
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
      className="w-72 bg-surface-0 rounded-2xl shadow-2xl border border-border/20 overflow-hidden z-[101]"
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
                <h3 className="font-bold text-foreground text-base leading-tight flex items-center gap-1.5">
                  {profile.displayName}
                  {profile.isGrandfathered
                    ? <GrandfatheredBadge size="lg" />
                    : profile.isSupporter
                      ? <KhurkDiamondBadge size="lg" />
                      : null}
                </h3>
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
                  onClick={handleCall}
                  disabled={dmLoading || dmCall.state !== 'idle'}
                  title={dmCall.state !== 'idle' ? 'Already in a call' : `Call ${profile?.displayName || profile?.username}`}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-emerald-500/20 hover:text-emerald-400 rounded-lg text-xs font-medium text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Phone size={13} />
                  Call
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

              {isAdmin && userId !== user?.id && (
                <button
                  onClick={handleGrandfather}
                  disabled={grandfatherLoading}
                  className={cn(
                    'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60',
                    profile.isGrandfathered
                      ? 'bg-slate-600/40 hover:bg-slate-600/60 text-slate-300'
                      : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400'
                  )}
                >
                  {grandfatherLoading
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Star size={13} className={profile.isGrandfathered ? '' : 'fill-amber-400'} />}
                  {profile.isGrandfathered ? 'Revoke General Badge' : 'Grant General Badge'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Profile not found.</p>
          )}
        </div>
    </div>
  );
}
