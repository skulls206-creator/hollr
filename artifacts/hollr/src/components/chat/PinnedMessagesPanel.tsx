import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { X, Pin } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import type { Message } from '@workspace/api-client-react';

async function fetchPinnedMessages(channelId: string): Promise<Message[]> {
  const res = await fetch(`/api/channels/${channelId}/pinned-messages`);
  if (!res.ok) throw new Error('Failed to fetch pinned messages');
  return res.json();
}

async function unpinMessage(channelId: string, messageId: string) {
  const res = await fetch(`/api/channels/${channelId}/messages/${messageId}/pin`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to unpin message');
  return res.json();
}

export function PinnedMessagesPanel({ channelId }: { channelId: string }) {
  const { togglePinnedPanel } = useAppStore();
  const qc = useQueryClient();

  const { data: pinned = [], isLoading } = useQuery<Message[]>({
    queryKey: ['pinned-messages', channelId],
    queryFn: () => fetchPinnedMessages(channelId),
  });

  const { mutate: doUnpin } = useMutation({
    mutationFn: ({ msgId }: { msgId: string }) => unpinMessage(channelId, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pinned-messages', channelId] }),
  });

  return (
    <div className="w-[340px] shrink-0 bg-surface-1 border-l border-border/10 flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border/10 shrink-0">
        <div className="flex items-center gap-2">
          <Pin size={16} className="text-muted-foreground" />
          <span className="font-bold text-foreground text-sm">Pinned Messages</span>
        </div>
        <button
          onClick={togglePinnedPanel}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
        {isLoading && (
          <p className="text-center text-sm text-muted-foreground py-8">Loading pinned messages…</p>
        )}
        {!isLoading && pinned.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-14 h-14 bg-secondary rounded-full flex items-center justify-center mb-3">
              <Pin size={24} className="text-muted-foreground opacity-50" />
            </div>
            <p className="font-semibold text-foreground text-sm">No pinned messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Hover a message and click the pin icon to pin it here.
            </p>
          </div>
        )}

        {pinned.map((msg) => (
          <div
            key={msg.id}
            className="bg-surface-3 rounded-lg p-3 border border-border/10 hover:border-border/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={msg.author.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-white text-[10px]">
                    {getInitials(msg.author.displayName || msg.author.username)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-semibold text-indigo-400 truncate">
                  {msg.author.displayName || msg.author.username}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(msg.createdAt), 'MM/dd/yyyy')}
                </span>
              </div>
              <button
                onClick={() => doUnpin({ msgId: msg.id })}
                title="Unpin message"
                className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-sm text-foreground leading-relaxed line-clamp-4 break-words">
              {msg.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
