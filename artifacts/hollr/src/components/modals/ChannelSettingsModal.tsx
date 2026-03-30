import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/use-app-store';
import {
  useListChannels, useUpdateChannel, useGetServer, useListServerMembers,
  getListChannelsQueryKey, getGetServerQueryKey, getListServerMembersQueryKey,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@workspace/replit-auth-web';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ChannelSettingsModal() {
  const {
    channelSettingsModalOpen,
    channelSettingsModalChannelId,
    closeChannelSettings,
    activeServerId,
  } = useAppStore();

  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: server } = useGetServer(activeServerId || '', {
    query: { queryKey: getGetServerQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });

  const { data: serverMembers = [] } = useListServerMembers(activeServerId || '', {
    query: { queryKey: getListServerMembersQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });

  const myMemberRole = serverMembers.find((m) => m.userId === user?.id)?.role ?? null;
  const isOwnerOrAdmin = server?.ownerId === user?.id || myMemberRole === 'admin';

  const { data: channels = [] } = useListChannels(activeServerId || '', {
    query: { queryKey: getListChannelsQueryKey(activeServerId || ''), enabled: !!activeServerId },
  });

  const channel = channels.find(c => c.id === channelSettingsModalChannelId) ?? null;

  const [name, setName] = useState('');
  const [nsfw, setNsfw] = useState(false);
  const [topic, setTopic] = useState('');

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setNsfw(channel.nsfw ?? false);
      setTopic(channel.topic ?? '');
    }
  }, [channel]);

  const { mutate: updateChannel, isPending } = useUpdateChannel();

  const handleClose = () => closeChannelSettings();

  const handleSave = () => {
    if (!activeServerId || !channel) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: 'Channel name cannot be empty', variant: 'destructive' });
      return;
    }
    updateChannel(
      {
        serverId: activeServerId,
        channelId: channel.id,
        data: {
          name: trimmedName,
          topic: topic.trim() || null,
          ...(isOwnerOrAdmin ? { nsfw } : {}),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListChannelsQueryKey(activeServerId) });
          toast({ title: `#${trimmedName} settings saved` });
          handleClose();
        },
        onError: () => toast({ title: 'Failed to save settings', variant: 'destructive' }),
      },
    );
  };

  if (!channel) return null;

  return (
    <Dialog open={channelSettingsModalOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Channel Settings — #{channel.name}</DialogTitle>
          <DialogDescription>
            Manage name{isOwnerOrAdmin ? ', topic, and age-restriction' : ' and topic'} for this channel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Channel Name */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Channel Name
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              placeholder="channel-name"
              className="w-full bg-secondary border-0 px-3 py-2.5 rounded-lg text-foreground focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/50 text-sm"
            />
          </div>

          {/* Topic */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Channel Topic
            </label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              maxLength={1024}
              placeholder="Set a topic for this channel…"
              className="w-full bg-secondary border-0 px-3 py-2.5 rounded-lg text-foreground focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/50 text-sm"
            />
          </div>

          {/* NSFW toggle — only visible to server owners and admins */}
          {isOwnerOrAdmin && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Age Restriction
              </label>
              <button
                type="button"
                onClick={() => setNsfw(v => !v)}
                className={cn(
                  'w-full flex items-center gap-4 p-3 rounded-lg border transition-all text-left',
                  nsfw
                    ? 'border-orange-500/50 bg-orange-500/10 text-foreground'
                    : 'border-border/30 bg-secondary/40 text-muted-foreground hover:bg-secondary',
                )}
              >
                <Flame
                  size={22}
                  className={cn('shrink-0 transition-colors', nsfw ? 'text-orange-400' : 'text-muted-foreground')}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Age-Restricted (NSFW)</p>
                  <p className="text-xs opacity-70 mt-0.5">
                    Users must confirm their age before viewing this channel.
                  </p>
                </div>
                {/* Toggle pill */}
                <span
                  className={cn(
                    'relative flex shrink-0 w-9 h-5 rounded-full transition-colors duration-200',
                    nsfw ? 'bg-orange-500' : 'bg-muted-foreground/30',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white transition-all duration-200',
                      nsfw ? 'left-[calc(100%-17px)]' : 'left-[3px]',
                    )}
                  />
                </span>
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
