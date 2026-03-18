import { useEffect, useRef, useState } from 'react';
import { useListMessages, useEditMessage, useDeleteMessage, getListMessagesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatBytes } from '@/lib/utils';
import { FileText, Download, Pencil, Trash2, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function MessageList({ channelId }: { channelId: string }) {
  const { data: messages = [], isLoading } = useListMessages(channelId);
  const { mutate: editMessage } = useEditMessage();
  const { mutate: deleteMessage } = useDeleteMessage();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Track which message is being edited and its draft content
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editingId]);

  const startEdit = (id: string, content: string) => {
    setEditingId(id);
    setEditDraft(content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = (channelId: string, messageId: string) => {
    if (!editDraft.trim()) return;
    editMessage({ channelId, messageId, data: { content: editDraft.trim() } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(channelId) });
        cancelEdit();
      },
      onError: () => toast({ title: 'Failed to edit message', variant: 'destructive' }),
    });
  };

  const handleDelete = (channelId: string, messageId: string) => {
    deleteMessage({ channelId, messageId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(channelId) });
      },
      onError: () => toast({ title: 'Failed to delete message', variant: 'destructive' }),
    });
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading messages…</div>;
  }

  const sortedMessages = [...messages].reverse();

  return (
    <div className="flex-1 overflow-y-auto flex flex-col p-4 gap-4 no-scrollbar">
      <div className="mt-auto" />

      {sortedMessages.length === 0 && (
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold text-foreground">Welcome to the channel!</h2>
          <p className="text-muted-foreground mt-2">This is the start of a beautiful conversation.</p>
        </div>
      )}

      {sortedMessages.map((msg, index) => {
        const showHeader = index === 0 || sortedMessages[index - 1].authorId !== msg.authorId ||
          (new Date(msg.createdAt).getTime() - new Date(sortedMessages[index - 1].createdAt).getTime() > 5 * 60000);

        const isOwner = user?.id === msg.authorId;
        const isEditing = editingId === msg.id;

        return (
          <div
            key={msg.id}
            className={`group relative flex ${showHeader ? 'mt-4' : 'mt-0.5'} hover:bg-black/5 p-1 -mx-4 px-4 rounded-sm transition-colors`}
          >
            {showHeader ? (
              <Avatar className="h-10 w-10 mr-4 cursor-pointer hover:opacity-80 transition-opacity shrink-0">
                <AvatarImage src={msg.author.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-white">
                  {getInitials(msg.author.displayName || msg.author.username)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="w-14 shrink-0 text-right pr-4 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-end">
                {format(new Date(msg.createdAt), 'h:mm a')}
              </div>
            )}

            <div className="flex flex-col min-w-0 flex-1">
              {showHeader && (
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-medium text-base text-indigo-400 hover:underline cursor-pointer tracking-wide">
                    {msg.author.displayName || msg.author.username}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(msg.createdAt), 'MM/dd/yyyy h:mm a')}
                  </span>
                </div>
              )}

              {isEditing ? (
                <div className="flex flex-col gap-1">
                  <textarea
                    ref={editRef}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(channelId, msg.id); }
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="bg-[#383A40] rounded-md px-3 py-2 text-foreground text-[15px] leading-relaxed resize-none w-full outline-none focus:ring-1 focus:ring-primary"
                    rows={1}
                  />
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <button onClick={() => saveEdit(channelId, msg.id)} className="flex items-center gap-1 text-primary hover:text-primary/80">
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
                  {msg.content}
                  {msg.edited && (
                    <span className="text-[11px] text-muted-foreground ml-1.5 italic">(edited)</span>
                  )}
                </div>
              )}

              {/* Attachments */}
              {!isEditing && msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.attachments.map(att => {
                    const isImage = att.contentType.startsWith('image/');
                    const url = `/api/storage/objects${att.objectPath}`;

                    if (isImage) {
                      return (
                        <div key={att.id} className="max-w-[400px] max-h-[400px] rounded-lg overflow-hidden border border-border/50 bg-black/20">
                          <img src={url} alt={att.name} className="object-contain w-full h-full" loading="lazy" />
                        </div>
                      );
                    }
                    return (
                      <a key={att.id} href={url} download target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-secondary border border-border/50 rounded-lg hover:bg-secondary/80 transition-colors w-72">
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
            </div>

            {/* Hover action buttons — only for owner, not while editing */}
            {isOwner && !isEditing && (
              <div className="absolute right-4 top-0 -translate-y-1/2 bg-[#2B2D31] border border-border/30 rounded-lg shadow-lg flex items-center gap-0.5 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={() => startEdit(msg.id, msg.content)}
                  title="Edit"
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(channelId, msg.id)}
                  title="Delete"
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
