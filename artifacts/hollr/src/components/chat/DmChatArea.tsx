import { useEffect, useRef, useState } from 'react';
import { useListDmMessages, useSendDmMessage, useRequestUploadUrl, getListDmMessagesQueryKey } from '@workspace/api-client-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatBytes } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  PlusCircle, Smile, ChevronLeft, FileText, Download,
  SendHorizonal, Pencil, Trash2, Check, X, Copy, ExternalLink, Menu, Pin, PinOff,
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { DmReactionPills } from './DmReactionPills';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { useContextMenu } from '@/contexts/ContextMenuContext';

async function editDmMessage(threadId: string, messageId: string, content: string) {
  const res = await fetch(`/api/dms/${threadId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to edit message');
  return res.json();
}

async function deleteDmMessage(threadId: string, messageId: string) {
  const res = await fetch(`/api/dms/${threadId}/messages/${messageId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete message');
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

export function DmChatArea({ threadId, recipientName, recipientAvatar }: {
  threadId: string;
  recipientName: string;
  recipientAvatar?: string | null;
}) {
  const { data: messages = [], isLoading } = useListDmMessages(threadId);
  const { mutate: sendMessage } = useSendDmMessage();
  const { mutateAsync: requestUpload } = useRequestUploadUrl();
  const { setActiveDmThread, voicePanelHeight, layoutMode, toggleMobileSidebar, toggleClassicChannel, sidebarLocked, setSidebarLocked } = useAppStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { show: showMenu } = useContextMenu();

  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [emojiHoverMsg, setEmojiHoverMsg] = useState<string | null>(null);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const composerEmojiRef = useRef<HTMLButtonElement>(null);

  const resizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editingId]);

  const { mutate: doEdit } = useMutation({
    mutationFn: ({ messageId, content: c }: { messageId: string; content: string }) =>
      editDmMessage(threadId, messageId, c),
    onSuccess: (updated) => {
      qc.setQueryData(getListDmMessagesQueryKey(threadId), (old: any[]) =>
        old ? old.map(m => m.id === updated.id ? updated : m) : old
      );
      setEditingId(null);
      setEditDraft('');
    },
    onError: () => toast({ title: 'Failed to edit message', variant: 'destructive' }),
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (messageId: string) => deleteDmMessage(threadId, messageId),
    onSuccess: (updated) => {
      qc.setQueryData(getListDmMessagesQueryKey(threadId), (old: any[]) =>
        old ? old.map(m => m.id === updated.id ? updated : m) : old
      );
    },
    onError: () => toast({ title: 'Failed to delete message', variant: 'destructive' }),
  });

  const startEdit = (id: string, text: string) => { setEditingId(id); setEditDraft(text); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(''); };

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
      quickReactions: (emoji) => {
        fetch(`/api/dms/${threadId}/messages/${msg.id}/reactions/${encodeURIComponent(emoji)}`, { method: 'PUT' })
          .then(r => r.json())
          .then(updated => {
            qc.setQueryData(getListDmMessagesQueryKey(threadId), (old: any[]) =>
              old ? old.map(m => m.id === updated.id ? updated : m) : old
            );
          });
      },
      actions: [
        {
          id: 'add-reaction',
          label: 'Add Reaction',
          icon: <Smile size={14} />,
          onClick: () => setEmojiHoverMsg(msg.id),
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
          id: 'delete',
          label: 'Delete Message',
          icon: <Trash2 size={14} />,
          onClick: () => doDelete(msg.id),
          danger: true,
          disabled: !isOwner,
          dividerBefore: true,
        },
      ],
    });
  };

  const saveEdit = (messageId: string) => {
    if (!editDraft.trim()) return;
    doEdit({ messageId, content: editDraft.trim() });
  };

  const handleSend = () => {
    if (!content.trim()) return;
    sendMessage({ threadId, data: { content: content.trim() } }, {
      onSuccess: () => {
        setContent('');
        if (textareaRef.current) textareaRef.current.style.height = '44px';
      },
      onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 100MB', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const { uploadURL, objectPath } = await requestUpload({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      setUploadProgress(40);

      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      setUploadProgress(100);

      sendMessage({
        threadId,
        data: {
          content: content.trim() || `Uploaded ${file.name}`,
          attachments: [{ objectPath, name: file.name, contentType: file.type, size: file.size }],
        },
      }, {
        onSuccess: () => {
          setContent('');
          if (textareaRef.current) textareaRef.current.style.height = '44px';
          toast({ title: 'File uploaded' });
        },
        onError: () => toast({ title: 'Failed to send file', variant: 'destructive' }),
      });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex-1 bg-surface-0 flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="h-12 border-b border-border/20 flex items-center px-4 shrink-0 shadow-sm z-10 bg-surface-1">
        {/* Hamburger — toggles sidebar panel, visible at all sizes */}
        <button
          onClick={() => { if (!sidebarLocked) (layoutMode === 'classic' ? toggleClassicChannel : toggleMobileSidebar)(); }}
          className={cn('mr-1 -ml-1 p-1 transition-colors shrink-0 rounded-md', sidebarLocked ? 'text-muted-foreground/30 cursor-default' : 'text-muted-foreground hover:text-foreground')}
          title={sidebarLocked ? 'Sidebar is pinned' : 'Toggle sidebar'}
        >
          <Menu size={22} />
        </button>
        {/* Sidebar lock / pin toggle */}
        <button
          onClick={() => setSidebarLocked(!sidebarLocked)}
          className={cn('mr-2 p-1 rounded transition-colors shrink-0', sidebarLocked ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
          title={sidebarLocked ? 'Unpin sidebar' : 'Pin sidebar open'}
        >
          {sidebarLocked ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        {/* Back arrow — mobile only, returns to DM list */}
        <button
          onClick={() => setActiveDmThread(null)}
          className="md:hidden mr-2 p-1 text-muted-foreground hover:text-foreground active:text-foreground transition-colors shrink-0 rounded-md"
          title="Back to Direct Messages"
        >
          <ChevronLeft size={24} />
        </button>
        <Avatar className="h-7 w-7 mr-2.5">
          <AvatarImage src={recipientAvatar || undefined} />
          <AvatarFallback className="bg-primary text-white text-xs">{getInitials(recipientName)}</AvatarFallback>
        </Avatar>
        <h2 className="font-bold text-foreground text-[15px]">{recipientName}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col p-4 gap-0 no-scrollbar">
        <div className="mt-auto" />

        {messages.length === 0 && !isLoading && (
          <div className="text-center py-10">
            <Avatar className="h-20 w-20 mx-auto mb-4">
              <AvatarImage src={recipientAvatar || undefined} />
              <AvatarFallback className="bg-primary text-white text-2xl">{getInitials(recipientName)}</AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-bold text-foreground">This is the beginning of your DM with {recipientName}</h2>
            <p className="text-muted-foreground mt-1 text-sm">Say hi!</p>
          </div>
        )}

        {messages.map((msg: any, index: number) => {
          const prev = messages[index - 1] as any;
          const showHeader = index === 0
            || prev.authorId !== msg.authorId
            || (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60000);

          const isOwner = user?.id === msg.authorId;
          const isEditing = editingId === msg.id;
          const isDeleted = !!(msg as any).deleted;
          const reactions = (msg as any).reactions || [];

          return (
            <div
              key={msg.id}
              className={cn(
                'group relative flex py-0.5 px-4 -mx-4 rounded-sm transition-colors',
                showHeader ? 'mt-4' : 'mt-0',
                'hover:bg-black/5',
              )}
              onMouseLeave={() => setEmojiHoverMsg(null)}
              onContextMenu={e => handleMessageContextMenu(e, msg)}
            >
              {showHeader ? (
                <Avatar className="h-10 w-10 mr-4 shrink-0">
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

              <div className="flex flex-col min-w-0 flex-1 py-0.5">
                {showHeader && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="font-medium text-base text-indigo-400">
                      {msg.author.displayName || msg.author.username}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(msg.createdAt), 'MM/dd/yyyy h:mm a')}
                    </span>
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
                    {msg.attachments.map((att: any) => {
                      const isImage = att.contentType.startsWith('image/');
                      const url = `/api/storage${att.objectPath}`;
                      if (isImage) {
                        return (
                          <a key={att.id} href={url} target="_blank" rel="noopener noreferrer"
                            className="inline-block max-w-[400px] rounded-xl overflow-hidden border border-border/50 bg-black/20 cursor-zoom-in hover:opacity-90 transition-opacity"
                            onContextMenu={e => handleImageContextMenu(e, url, att.name)}>
                            <img src={url} alt={att.name} className="block max-w-full max-h-[350px] object-contain" loading="lazy" />
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
                  <DmReactionPills
                    reactions={reactions}
                    threadId={threadId}
                    messageId={msg.id}
                    showAddButton={emojiHoverMsg === msg.id}
                  />
                )}
              </div>

              {/* Hover action bar */}
              {!isEditing && !isDeleted && (
                <div className="absolute right-4 top-0 -translate-y-1/2 bg-surface-1 border border-border/30 rounded-lg shadow-lg flex items-center gap-0.5 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={() => setEmojiHoverMsg(v => v === msg.id ? null : msg.id)}
                    title="Add reaction"
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                  >
                    <Smile size={14} />
                  </button>
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
                        onClick={() => doDelete(msg.id)}
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

      {/* Composer */}
      <div className="px-4 pb-2 pt-2 bg-surface-0">
        <div className="bg-[#383A40] rounded-lg flex items-center px-4 py-2 shadow-sm focus-within:ring-1 focus-within:ring-primary/50 relative overflow-visible">
          {isUploading && (
            <div
              className="absolute top-0 left-0 h-1 bg-primary transition-all duration-300 ease-out rounded-t-lg"
              style={{ width: `${uploadProgress}%` }}
            />
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-1 mr-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors shrink-0 disabled:opacity-50"
            title="Attach file"
          >
            <PlusCircle size={22} className="fill-muted-foreground/20" />
          </button>
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              resizeTextarea(e.target);
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${recipientName}`}
            className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-foreground placeholder:text-muted-foreground py-2 min-h-[44px] max-h-[200px] overflow-y-auto leading-normal"
            rows={1}
            style={{ height: '44px' }}
          />
          <div className="flex items-center gap-1 ml-2 shrink-0 relative">
            <button
              ref={composerEmojiRef}
              onClick={() => setComposerEmojiOpen(v => !v)}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
              title="Add emoji"
            >
              <Smile size={22} />
            </button>
            {composerEmojiOpen && (
              <EmojiPickerPopover
                onEmojiClick={(emoji) => {
                  setContent(c => c + emoji);
                  setComposerEmojiOpen(false);
                  textareaRef.current?.focus();
                }}
                onClose={() => setComposerEmojiOpen(false)}
                anchorRef={composerEmojiRef as any}
                align="right"
              />
            )}
            <button
              onClick={handleSend}
              disabled={!content.trim() || isUploading}
              className={`p-1.5 rounded-md transition-colors ${content.trim() && !isUploading ? 'text-primary hover:bg-primary/20' : 'text-muted-foreground/40 cursor-not-allowed'}`}
              title="Send message"
            >
              <SendHorizonal size={20} />
            </button>
          </div>
        </div>
      </div>

      {voicePanelHeight > 0 && (
        <div style={{ height: voicePanelHeight }} className="shrink-0" />
      )}
    </div>
  );
}
