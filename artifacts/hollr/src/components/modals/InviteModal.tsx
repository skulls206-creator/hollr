import { useState } from 'react';
import { Check, Copy, Link, RefreshCw, Clock, Users, ChevronDown, Loader2, Share2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { useAppStore } from '@/store/use-app-store';
import { useGetServer, getGetServerQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BASE = import.meta.env.BASE_URL;

const EXPIRY_OPTIONS = [
  { label: 'Never', value: null },
  { label: '1 hour', value: 1 },
  { label: '6 hours', value: 6 },
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
  { label: '7 days', value: 168 },
];

const MAX_USES_OPTIONS = [
  { label: 'No limit', value: null },
  { label: '1 use', value: 1 },
  { label: '5 uses', value: 5 },
  { label: '10 uses', value: 10 },
  { label: '25 uses', value: 25 },
  { label: '100 uses', value: 100 },
];

export function InviteModal() {
  const { inviteModalOpen, setInviteModalOpen, activeServerId } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState<number | null>(null);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: server } = useGetServer(activeServerId || '', {
    query: {
      queryKey: getGetServerQueryKey(activeServerId || ''),
      enabled: !!activeServerId && inviteModalOpen,
    },
  });

  const inviteLink = server?.inviteCode
    ? `${window.location.origin}/join/${server.inviteCode}`
    : '';

  const expiryLabel = EXPIRY_OPTIONS.find(o => o.value === expiresInHours)?.label ?? 'Never';
  const maxUsesLabel = MAX_USES_OPTIONS.find(o => o.value === maxUses)?.label ?? 'No limit';

  const hasExpiry = !!(server as any)?.inviteExpiresAt;
  const isExpired = hasExpiry && new Date((server as any).inviteExpiresAt) < new Date();
  const inviteUseCount = (server as any)?.inviteUseCount ?? 0;
  const inviteMaxUses = (server as any)?.inviteMaxUses ?? null;
  const inviteExpiresAt = (server as any)?.inviteExpiresAt ?? null;

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    if (!inviteLink || !canShare) return;
    try {
      await navigator.share({
        title: `Join ${server?.name} on hollr`,
        text: `You're invited to join ${server?.name} on hollr.chat!`,
        url: inviteLink,
      });
    } catch (err: any) {
      // AbortError = user cancelled — that's fine; don't show an error
      if (err?.name !== 'AbortError') {
        toast({ title: 'Share failed', variant: 'destructive' });
      }
    }
  };

  const handleRegenerate = async () => {
    if (!activeServerId) return;
    setRegenerating(true);
    try {
      const res = await fetch(`${BASE}api/servers/${activeServerId}/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiresInHours: expiresInHours ?? undefined,
          maxUses: maxUses ?? undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to regenerate invite');
      qc.invalidateQueries({ queryKey: getGetServerQueryKey(activeServerId) });
      toast({ title: 'New invite link generated' });
    } catch {
      toast({ title: 'Failed to regenerate', variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>Invite people to {server?.name}</DialogTitle>
          <DialogDescription>
            Share this link with anyone you want to join your server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Active link */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Server Invite Link
            </label>

            <div className={`flex items-center gap-2 bg-[#1E1F22] border rounded-lg px-3 py-2.5 min-w-0 overflow-hidden ${isExpired ? 'border-destructive/50' : 'border-border/30'}`}>
              <Link size={15} className={`shrink-0 ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`} />
              <input
                readOnly
                value={isExpired ? 'Link expired' : (inviteLink || 'Loading…')}
                onFocus={e => e.target.select()}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-foreground font-mono truncate cursor-default"
              />
            </div>

            {inviteExpiresAt && !isExpired && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Clock size={10} />
                Expires {new Date(inviteExpiresAt).toLocaleString()}
                {inviteMaxUses && <span>· {inviteUseCount}/{inviteMaxUses} uses</span>}
              </p>
            )}
            {inviteMaxUses && !inviteExpiresAt && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Users size={10} />
                {inviteUseCount}/{inviteMaxUses} uses
              </p>
            )}

            <div className="mt-2 flex gap-2">
              <button
                onClick={handleCopy}
                disabled={!inviteLink || isExpired}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 ${canShare ? 'flex-1' : 'w-full'}`}
              >
                {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Link</>}
              </button>
              {canShare && (
                <button
                  onClick={handleShare}
                  disabled={!inviteLink || isExpired}
                  title="Share via system share sheet"
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-border/30 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <Share2 size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Regenerate section */}
          <div className="border-t border-border/20 pt-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Generate new link
            </p>

            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex-1 flex items-center justify-between gap-1 px-3 py-2 rounded-md bg-[#1E1F22] border border-border/30 text-sm hover:bg-white/5 transition-colors">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock size={13} />
                      {expiryLabel}
                    </span>
                    <ChevronDown size={13} className="text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40 bg-[#111214] border-border/50">
                  {EXPIRY_OPTIONS.map(o => (
                    <DropdownMenuItem
                      key={String(o.value)}
                      onClick={() => setExpiresInHours(o.value)}
                      className={`text-sm cursor-pointer ${expiresInHours === o.value ? 'font-semibold' : ''}`}
                    >
                      {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex-1 flex items-center justify-between gap-1 px-3 py-2 rounded-md bg-[#1E1F22] border border-border/30 text-sm hover:bg-white/5 transition-colors">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users size={13} />
                      {maxUsesLabel}
                    </span>
                    <ChevronDown size={13} className="text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40 bg-[#111214] border-border/50">
                  {MAX_USES_OPTIONS.map(o => (
                    <DropdownMenuItem
                      key={String(o.value)}
                      onClick={() => setMaxUses(o.value)}
                      className={`text-sm cursor-pointer ${maxUses === o.value ? 'font-semibold' : ''}`}
                    >
                      {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <button
              onClick={handleRegenerate}
              disabled={regenerating || !activeServerId}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-border/30 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {regenerating
                ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                : <><RefreshCw size={14} /> Generate new link</>
              }
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
