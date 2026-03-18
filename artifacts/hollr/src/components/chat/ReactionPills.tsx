import { cn } from '@/lib/utils';
import { Smile } from 'lucide-react';
import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getListMessagesQueryKey } from '@workspace/api-client-react';
import { EmojiPickerPopover } from './EmojiPickerPopover';

interface Reaction {
  emojiId: string;
  count: number;
  reactedByCurrentUser: boolean;
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

async function toggleReaction(channelId: string, messageId: string, emojiId: string) {
  const res = await fetch(
    `/api/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emojiId)}`,
    { method: 'PUT' }
  );
  if (!res.ok) throw new Error('Failed to toggle reaction');
  return res.json();
}

export function ReactionPills({
  reactions,
  channelId,
  messageId,
  showAddButton = false,
}: {
  reactions: Reaction[];
  channelId: string;
  messageId: string;
  showAddButton?: boolean;
}) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const { mutate: toggle } = useMutation({
    mutationFn: (emojiId: string) => toggleReaction(channelId, messageId, emojiId),
    onSuccess: (updated) => {
      qc.setQueryData(getListMessagesQueryKey(channelId), (old: any[]) =>
        old ? old.map(m => m.id === messageId ? updated : m) : old
      );
    },
  });

  const PILL_LIMIT = 8;
  const visible = reactions.slice(0, PILL_LIMIT);
  const overflow = reactions.length - PILL_LIMIT;

  if (reactions.length === 0 && !showAddButton) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1 items-center relative">
      {visible.map(r => (
        <button
          key={r.emojiId}
          onClick={() => toggle(r.emojiId)}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all select-none border',
            r.reactedByCurrentUser
              ? 'bg-primary/20 border-primary/50 text-primary hover:bg-primary/30'
              : 'bg-secondary border-border/30 text-foreground hover:bg-secondary/80 hover:border-border/60'
          )}
          title={`${r.emojiId} — ${r.count} ${r.count === 1 ? 'reaction' : 'reactions'}`}
        >
          <span className="text-base leading-none">{r.emojiId}</span>
          <span className={cn(r.reactedByCurrentUser ? 'text-primary' : 'text-muted-foreground')}>
            {formatCount(r.count)}
          </span>
        </button>
      ))}

      {overflow > 0 && (
        <span className="flex items-center px-2 py-0.5 rounded-full text-xs bg-secondary border border-border/30 text-muted-foreground">
          +{overflow}
        </span>
      )}

      {showAddButton && (
        <div className="relative">
          <button
            ref={addBtnRef}
            onClick={() => setPickerOpen(v => !v)}
            className="flex items-center p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent hover:border-border/30 transition-all"
            title="Add reaction"
          >
            <Smile size={14} />
          </button>
          {pickerOpen && (
            <EmojiPickerPopover
              onEmojiClick={(emoji) => toggle(emoji)}
              onClose={() => setPickerOpen(false)}
              anchorRef={addBtnRef as any}
            />
          )}
        </div>
      )}
    </div>
  );
}
