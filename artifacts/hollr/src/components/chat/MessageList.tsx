import { useEffect, useRef, useState } from 'react';
import { useListMessages, useEditMessage, useDeleteMessage, getListMessagesQueryKey } from '@workspace/api-client-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatBytes } from '@/lib/utils';
import { FileText, Download, Pencil, Trash2, Check, X, Pin, Smile, MessageSquare, Copy, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { ReactionPills } from './ReactionPills';
import { useContextMenu } from '@/contexts/ContextMenuContext';

async function pinMessage(channelId: string, messageId: string) {
  const res = await fetch(`/api/channels/${channelId}/messages/${messageId}/pin`, { method: 'PUT' });
  if (!res.ok) throw new Error('Failed to pin');
  return res.json();
}

async function unpinMessage(channelId: string, messageId: string) {
  const res = await fetch(`/api/channels/${channelId}/messages/${messageId}/pin`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to unpin');
  return res.json();
}

async function toggleReaction(channelId: string, messageId: string, emojiId: string) {
  const res = await fetch(
    `/api/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emojiId)}`,
    { method: 'PUT' }
  );
  return res.json();
}

function formatContent(content: string) {
  const parts = content.split(/(@\S+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="bg-primary/20 text-primary font-semibold px-1 rounded text-[13px]">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function MessageList({
  channelId,
  highlightedMessageId,
}: {
  channelId: string;
  highlightedMessageId?: string | null;
}) {
  const { data: messages = [], isLoading } = useListMessages(channelId);
  const { mutate: editMessage } = useEditMessage();
  const { mutate: deleteMessage } = useDeleteMessage();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const { openThread, openProfileCard } = useAppStore();
  const { show: showMenu } = useContextMenu();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [emojiHoverMsg, setEmojiHoverMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!highlightedMessageId) return;
    const el = messageRefs.current[highlightedMessageId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedMessageId]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editingId]);

  const startEdit = (id: string, content: string) => { setEditingId(id); setEditDraft(content); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(''); };

  const saveEdit = (messageId: string) => {
    if (!editDraft.trim()) return;
    editMessage({ channelId, messageId, data: { content: editDraft.trim() } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMessagesQueryKey(channelId) });
        cancelEdit();
      },
      onError: () => toast({ title: 'Failed to edit message', variant: 'destructive' }),
    });
  };

  const handleDelete = (messageId: string) => {
    deleteMessage({ channelId, messageId }, {
      onSuccess: (updated: any) => {
        qc.setQueryData<any[]>(getListMessagesQueryKey(channelId), old =>
          old ? old.map(m => m.id === messageId ? { ...m, ...updated, deleted: true } : m) : old
        );
      },
      onError: () => toast({ title: 'Failed to delete message', variant: 'destructive' }),
    });
  };

  const { mutate: doPin } = useMutation({
    mutationFn: ({ msgId, pinned }: { msgId: string; pinned: boolean }) =>
      pinned ? unpinMessage(channelId, msgId) : pinMessage(channelId, msgId),
    onSuccess: (updated) => {
      qc.setQueryData<any[]>(getListMessagesQueryKey(channelId), old =>
        old ? old.map(m => m.id === updated.id ? updated : m) : old
      );
      qc.invalidateQueries({ queryKey: ['pinned-messages', channelId] });
    },
    onError: () => toast({ title: 'Failed to pin/unpin', variant: 'destructive' }),
  });

  const { mutate: doReact } = useMutation({
    mutationFn: ({ msgId, emojiId }: { msgId: string; emojiId: string }) =>
      toggleReaction(channelId, msgId, emojiId),
    onSuccess: (updated) => {
      qc.setQueryData<any[]>(getListMessagesQueryKey(channelId), old =>
        old ? old.map(m => m.id === updated.id ? updated : m) : old
      );
    },
  });

  const handleImageContextMenu = (e: React.MouseEvent, url: string, filename: string) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu({
      x: e.clientX,
      y: e.clientY,
      actions: [
        {
          id: 'open-image',
          label: 'Open Image',
          icon: <ExternalLink size={14} />,
          onClick: () => window.open(url, '_blank'),
        },
        {
          id: 'copy-url',
          label: 'Copy Image URL',
          icon: <Copy size={14} />,
          onClick: () => navigator.clipboard.writeText(window.location.origin + url),
        },
        {
          id: 'save-image',
          label: 'Save Image',
          icon: <Download size={14} />,
          onClick: () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
          },
        },
      ],
    });
  };

  const handleMessageContextMenu = (e: React.MouseEvent, msg: any) => {
    e.preventDefault();
    const isOwner = user?.id === msg.authorId;
    const isDeleted = !!(msg as any).deleted;
    if (isDeleted) return;

    showMenu({
      x: e.clientX,
      y: e.clientY,
      quickReactions: (emoji) => doReact({ msgId: msg.id, emojiId: emoji }),
      actions: [
        {
          id: 'add-reaction',
          label: 'Add Reaction',
          icon: <Smile size={14} />,
          onClick: () => setEmojiHoverMsg(msg.id),
        },
        {
          id: 'thread',
          label: 'Reply in Thread',
          icon: <MessageSquare size={14} />,
          onClick: () => openThread(channelId, msg.id),
        },
        {
          id: 'edit',
          label: 'Edit Message',
          icon: <Pencil size={14} />,
          onClick: () => startEdit(msg.id, msg.content),
          disabled: !isOwner,
          dividerBefore: true,
        },
        {
          id: 'copy',
          label: 'Copy Text',
          icon: <Copy size={14} />,
          onClick: () => navigator.clipboard.writeText(msg.content),
          shortcut: 'Ctrl+C',
        },
        {
          id: 'pin',
          label: msg.pinned ? 'Unpin Message' : 'Pin Message',
          icon: <Pin size={14} />,
          onClick: () => doPin({ msgId: msg.id, pinned: !!msg.pinned }),
        },
        {
          id: 'delete',
          label: 'Delete Message',
          icon: <Trash2 size={14} />,
          onClick: () => handleDelete(msg.id),
          danger: true,
          disabled: !isOwner,
          dividerBefore: true,
        },
      ],
    });
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading messages…</div>;
  }

  return (
    <div data-messages-scroll className="flex-1 overflow-y-auto flex flex-col p-4 gap-0 no-scrollbar">
      <div className="mt-auto" />

      {messages.length === 0 && (
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold text-foreground">Welcome to the channel!</h2>
          <p className="text-muted-foreground mt-2">This is the start of a beautiful conversation.</p>
        </div>
      )}

      {messages.map((msg, index) => {
        const prev = messages[index - 1];
        const showHeader = index === 0
          || prev.authorId !== msg.authorId
          || (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60000);

        const isOwner = user?.id === msg.authorId;
        const isEditing = editingId === msg.id;
        const isHighlighted = highlightedMessageId === msg.id;
        const isDeleted = !!(msg as any).deleted;
        const reactions = (msg as any).reactions || [];
        const replyCount = (msg as any).replyCount || 0;

        return (
          <div
            key={msg.id}
            ref={el => { messageRefs.current[msg.id] = el; }}
            className={cn(
              'group relative flex py-0.5 px-4 -mx-4 rounded-sm transition-colors',
              showHeader ? 'mt-4' : 'mt-0',
              isHighlighted && 'bg-primary/10 hover:bg-primary/15 ring-1 ring-primary/30 rounded-md',
              !isHighlighted && 'hover:bg-black/5',
              msg.pinned && 'border-l-2 border-amber-500/60 pl-3'
            )}
            onMouseLeave={() => setEmojiHoverMsg(null)}
            onContextMenu={e => handleMessageContextMenu(e, msg)}
          >
            {/* Avatar or timestamp stub */}
            {showHeader ? (
              <button
                onClick={e => openProfileCard({
                  userId: msg.authorId,
                  position: { x: e.clientX, y: e.clientY },
                })}
                className="shrink-0 mr-4"
              >
                <Avatar className="h-10 w-10 hover:opacity-80 transition-opacity">
                  <AvatarImage src={msg.author.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-white">
                    {getInitials(msg.author.displayName || msg.author.username)}
                  </AvatarFallback>
                </Avatar>
              </button>
            ) : (
              <div className="w-14 shrink-0 text-right pr-4 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-end">
                {format(new Date(msg.createdAt), 'h:mm a')}
              </div>
            )}

            <div className="flex flex-col min-w-0 flex-1 py-0.5">
              {showHeader && (
                <div className="flex items-baseline gap-2 mb-0.5">
                  <button
                    onClick={e => openProfileCard({ userId: msg.authorId, position: { x: e.clientX, y: e.clientY } })}
                    className="font-medium text-base text-indigo-400 hover:underline"
                  >
                    {msg.author.displayName || msg.author.username}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(msg.createdAt), 'MM/dd/yyyy h:mm a')}
                  </span>
                  {msg.pinned && (
                    <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-0.5">
                      <Pin size={10} className="inline" /> Pinned
                    </span>
                  )}
                </div>
              )}

              {isDeleted ? (
                <div className="text-[14px] italic text-red-400/80 select-none">
                  Message deleted
                </div>
              ) : isEditing ? (
                <div className="flex flex-col gap-1">
                  <textarea
                    ref={editRef}
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id); }
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="bg-[#383A40] rounded-md px-3 py-2 text-foreground text-[15px] leading-relaxed resize-none w-full outline-none focus:ring-1 focus:ring-primary"
                    rows={1}
                  />
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <button onClick={() => saveEdit(msg.id)} className="flex items-center gap-1 text-primary hover:text-primary/80">
                      <Check size={12} /> Save
                    </button>
                    <span>•</span>
                    <button onClick={cancelEdit} className="flex items-center gap-1 hover:text-foreground">
                      <X size={12} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  {formatContent(msg.content)}
                  {msg.edited && (
                    <span className="text-[11px] text-muted-foreground ml-1.5 italic">(edited)</span>
                  )}
                </div>
              )}

              {/* Attachments */}
              {!isEditing && !isDeleted && msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {msg.attachments.map(att => {
                    const isImage = att.contentType.startsWith('image/');
                    const url = `/api/storage${att.objectPath}`;
                    if (isImage) {
                      return (
                        <a key={att.id} href={url} target="_blank" rel="noopener noreferrer"
                          className="inline-block max-w-[400px] rounded-xl overflow-hidden border border-border/50 bg-black/20 cursor-zoom-in hover:opacity-90 transition-opacity"
                          onContextMenu={e => handleImageContextMenu(e, url, att.name)}>
                          <img
                            src={url}
                            alt={att.name}
                            className="block max-w-full max-h-[350px] object-contain"
                            loading="lazy"
                          />
                        </a>
                      );
                    }
                    return (
                      <a key={att.id} href={url} download target="_blank" rel="noreferrer"
                        className="flex items-center gap-3 p-3 bg-secondary border border-border/50 rounded-lg hover:bg-secondary/80 transition-colors w-72">
                        <div className="bg-primary/20 p-2 rounded-md"><FileText className="text-primary" size={24} /></div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-medium text-primary hover:underline truncate">{att.name}</span>
                          <span className="text-xs text-muted-foreground">{formatBytes(att.size)}</span>
                        </div>
                        <Download className="ml-auto text-muted-foreground hover:text-foreground" size={18} />
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Reactions */}
              {!isEditing && !isDeleted && (
                <ReactionPills
                  reactions={reactions}
                  channelId={channelId}
                  messageId={msg.id}
                  showAddButton={emojiHoverMsg === msg.id}
                />
              )}

              {/* Thread reply count */}
              {!isEditing && !isDeleted && replyCount > 0 && (
                <button
                  onClick={() => openThread(channelId, msg.id)}
                  className="mt-1 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 hover:underline w-fit"
                >
                  <MessageSquare size={12} />
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>

            {/* Hover action buttons — hidden entirely for deleted messages */}
            {!isEditing && !isDeleted && (
              <div className="absolute right-4 top-0 -translate-y-1/2 bg-surface-1 border border-border/30 rounded-lg shadow-lg flex items-center gap-0.5 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {/* Add reaction */}
                <button
                  onClick={() => setEmojiHoverMsg(v => v === msg.id ? null : msg.id)}
                  title="Add reaction"
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                >
                  <Smile size={14} />
                </button>
                {/* Thread */}
                <button
                  onClick={() => openThread(channelId, msg.id)}
                  title="Reply in thread"
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                >
                  <MessageSquare size={14} />
                </button>
                {/* Pin/Unpin */}
                <button
                  onClick={() => doPin({ msgId: msg.id, pinned: !!msg.pinned })}
                  title={msg.pinned ? 'Unpin message' : 'Pin message'}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    msg.pinned
                      ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <Pin size={14} />
                </button>
                {/* Edit + Delete — owner only */}
                {isOwner && (
                  <>
                    <button
                      onClick={() => startEdit(msg.id, msg.content)}
                      title="Edit"
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(msg.id)}
                      title="Delete"
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
