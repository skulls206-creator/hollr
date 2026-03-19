import { useState } from 'react';
import { Check, Copy, Link, RefreshCw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { useAppStore } from '@/store/use-app-store';
import { useGetServer, getGetServerQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export function InviteModal() {
  const { inviteModalOpen, setInviteModalOpen, activeServerId } = useAppStore();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { data: server } = useGetServer(activeServerId || '', {
    query: {
      queryKey: getGetServerQueryKey(activeServerId || ''),
      enabled: !!activeServerId && inviteModalOpen,
    },
  });

  const inviteLink = server?.inviteCode
    ? `${window.location.origin}/join/${server.inviteCode}`
    : '';

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

  return (
    <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Invite people to {server?.name}</DialogTitle>
          <DialogDescription>
            Share this link with anyone you want to join your server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Server Invite Link
            </label>
            <div className="flex items-center gap-2 bg-[#1E1F22] border border-border/30 rounded-lg p-3 min-w-0 overflow-hidden">
              <Link size={16} className="text-muted-foreground shrink-0" />
              <span className="flex-1 min-w-0 text-sm text-foreground truncate font-mono">
                {inviteLink || 'Loading…'}
              </span>
              <button
                onClick={handleCopy}
                disabled={!inviteLink}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Anyone with this link can join your server.{' '}
            <span className="text-destructive/80">Links expire when regenerated.</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
