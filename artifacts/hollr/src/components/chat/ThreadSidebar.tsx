import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, FileText, Download } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatBytes } from '@/lib/utils';
import { format } from 'date-fns';
import { ReactionPills } from './ReactionPills';
import { getListMessagesQueryKey } from '@workspace/api-client-react';

async function fetchThread(channelId: string, messageId: string) {
  const res = await fetch(`/api/channels/${channelId}/messages/${messageId}/thread`);
  if (!res.ok) throw new Error('Failed to fetch thread');
  return res.json();
}

async function postReply(channelId: string, messageId: string, content: string) {
  const res = await fetch(`/api/channels/${channelId}/messages/${messageId}/thread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to post reply');
  return res.json();
}

function MessageBubble({ msg, channelId, dimmed = false }: { msg: any; channelId: string; dimmed?: boolean }) {
  return (
    <div className={dimmed ? 'opacity-60' : ''}>
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={msg.author.avatarUrl || undefined} />
          <AvatarFallback className="bg-primary text-white text-xs">
            {getInitials(msg.author.displayName || msg.author.username)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-semibold text-indigo-400">
              {msg.author.displayName || msg.author.username}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(msg.createdAt), 'MM/dd h:mm a')}
            </span>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              {msg.attachments.map((att: any) => {
                const isImage = att.contentType.startsWith('image/');
                const url = `/api/storage${att.objectPath}`;
                if (isImage) {
                  return (
                    <a key={att.id} href={url} target="_blank" rel="noopener noreferrer"
                      className="inline-block max-w-[320px] rounded-xl overflow-hidden border border-border/50 bg-black/20 cursor-zoom-in hover:opacity-90 transition-opacity">
                      <img src={url} alt={att.name} className="block max-w-full max-h-[280px] object-contain" loading="lazy" />
                    </a>
                  );
                }
                return (
                  <a key={att.id} href={url} download target="_blank" rel="noreferrer"
                    className="flex items-center gap-3 p-3 bg-secondary border border-border/50 rounded-lg hover:bg-secondary/80 transition-colors w-64">
                    <div className="bg-primary/20 p-2 rounded-md"><FileText className="text-primary" size={20} /></div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-xs font-medium text-primary hover:underline truncate">{att.name}</span>
                      <span className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</span>
                    </div>
                    <Download className="ml-auto text-muted-foreground hover:text-foreground shrink-0" size={16} />
                  </a>
                );
              })}
            </div>
          )}
          {msg.reactions?.length > 0 && (
            <ReactionPills
              reactions={msg.reactions}
              channelId={channelId}
              messageId={msg.id}
              showAddButton={!dimmed}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function ThreadSidebar({
  channelId,
  messageId,
  onClose,
}: {
  channelId: string;
  messageId: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['thread', channelId, messageId],
    queryFn: () => fetchThread(channelId, messageId),
    refetchInterval: false,
  });

  const { mutate: sendReply, isPending } = useMutation({
    mutationFn: (content: string) => postReply(channelId, messageId, content),
    onSuccess: () => {
      setDraft('');
      refetch();
      qc.invalidateQueries({ queryKey: getListMessagesQueryKey(channelId) });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.replies?.length]);

  const handleSend = () => {
    if (!draft.trim()) return;
    sendReply(draft.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="w-[340px] shrink-0 bg-surface-1 border-l border-border/10 flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border/10 shrink-0">
        <span className="font-bold text-foreground text-sm">Thread</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-muted-foreground" size={24} />
          </div>
        ) : (
          <>
            {/* Root message */}
            {data?.root && (
              <div className="pb-4 border-b border-border/10">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Original Message</p>
                <MessageBubble msg={data.root} channelId={channelId} dimmed />
              </div>
            )}

            {/* Replies */}
            {data?.replies?.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No replies yet. Be the first!</p>
            )}
            {data?.replies?.map((msg: any) => (
              <MessageBubble key={msg.id} msg={msg} channelId={channelId} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Composer */}
      <div className="p-3 shrink-0 border-t border-border/10">
        <div className="bg-[#383A40] rounded-lg flex items-end px-3 py-2 gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply in thread…"
            rows={1}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm resize-none outline-none leading-normal min-h-[24px] max-h-[120px] overflow-y-auto"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || isPending}
            className="text-primary hover:text-primary/80 disabled:opacity-40 transition-colors shrink-0 pb-0.5"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
