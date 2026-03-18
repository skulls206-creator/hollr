import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/use-app-store';
import { useCreateChannel, getListChannelsQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { Hash, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ChannelType = 'text' | 'voice';

export function CreateChannelModal() {
  const { createChannelModalOpen, setCreateChannelModalOpen, activeServerId, setActiveChannel } = useAppStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('text');
  const { mutate: createChannel, isPending } = useCreateChannel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleClose = () => {
    setCreateChannelModalOpen(false);
    setName('');
    setType('text');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !activeServerId) return;

    createChannel(
      { serverId: activeServerId, data: { name: name.trim().toLowerCase().replace(/\s+/g, '-'), type } },
      {
        onSuccess: (channel) => {
          queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey(activeServerId) });
          if (channel.type === 'text') setActiveChannel(channel.id);
          handleClose();
          toast({ title: `#${channel.name} created!` });
        },
        onError: (err) => {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        },
      }
    );
  };

  return (
    <Dialog open={createChannelModalOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
          <DialogDescription>
            Choose a channel type and give it a name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-4">
            {/* Channel type picker */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channel Type</p>
              <div className="space-y-2">
                {(['text', 'voice'] as ChannelType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'w-full flex items-center gap-4 p-3 rounded-lg border transition-all text-left',
                      type === t
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/30 bg-secondary/40 text-muted-foreground hover:bg-secondary'
                    )}
                  >
                    {t === 'text' ? <Hash size={20} className="shrink-0" /> : <Volume2 size={20} className="shrink-0" />}
                    <div>
                      <p className="font-semibold capitalize">{t}</p>
                      <p className="text-xs opacity-70">
                        {t === 'text' ? 'Send messages, images, GIFs, and files' : 'Hang out with voice, video, and screen share'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Channel name */}
            <div className="space-y-2">
              <label htmlFor="channel-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Channel Name
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                  {type === 'text' ? <Hash size={16} /> : <Volume2 size={16} />}
                </div>
                <input
                  id="channel-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-secondary border-0 pl-9 pr-3 py-3 rounded-lg text-foreground focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/50"
                  placeholder={type === 'text' ? 'new-channel' : 'New Voice Channel'}
                  autoFocus
                  maxLength={100}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isPending || !name.trim()}>
              {isPending ? 'Creating…' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
