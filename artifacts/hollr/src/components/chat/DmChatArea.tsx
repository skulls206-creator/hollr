import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useListDmMessages, useSendDmMessage, useRequestUploadUrl, getListDmMessagesQueryKey } from '@workspace/api-client-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatBytes } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  PlusCircle, Smile, ChevronLeft, FileText, Download,
  ArrowUp, Pencil, Trash2, Check, X, Copy, ExternalLink, Menu, Pin, PinOff, Phone, Video, User, EyeOff, Eye,
} from 'lucide-react';
import { sendDmCallSignal } from '@/hooks/use-realtime';
import { initiateVideoCall } from '@/hooks/use-video-call';
import { useAppStore } from '@/store/use-app-store';
import { DmReactionPills } from './DmReactionPills';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { KhurkDiamondBadge } from '@/components/ui/KhurkDiamondBadge';
import { hideMessage, unhideMessage } from '@/lib/hidden-messages';
import { markDmThreadRead } from '@/lib/dm-seen-tracker';
import { NotificationBell } from '@/components/notifications/NotificationBell';

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

function formatContent(content: string, onDark = false) {
  const parts = content.split(/(@\S+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className={cn('font-semibold px-1 rounded text-[13px]', onDark ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary')}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatDateLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  const currentYear = new Date().getFullYear();
  return date.getFullYear() === currentYear
    ? format(date, 'MMMM d')
    : format(date, 'MMMM d, yyyy');
}

function DateSeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center justify-center my-4 select-none pointer-events-none">
      <div className="bg-muted text-muted-foreground text-xs font-semibold px-3 py-1 rounded-full">
        {formatDateLabel(date)}
      </div>
    </div>
  );
}

export function DmChatArea({ threadId, recipientId, recipientName, recipientAvatar }: {
  threadId: string;
  recipientId?: string | null;
  recipientName: string;
  recipientAvatar?: string | null;
}) {
  const { data: messages = [], isLoading } = useListDmMessages(threadId, undefined, {
    query: { queryKey: getListDmMessagesQueryKey(threadId), refetchInterval: 2000, refetchIntervalInBackground: false },
  });
  const { mutate: sendMessage } = useSendDmMessage();
  const { mutateAsync: requestUpload } = useRequestUploadUrl();
  const { setActiveDmThread, voicePanelHeight, layoutMode, toggleMobileSidebar, toggleClassicChannel, setClassicChannelOpen, setMobileSidebarOpen, sidebarLocked, setSidebarLocked, dmCall, setDmCallState, videoCall, openProfileCard, clearDmUnreadCount, theme } = useAppStore();
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
  const [hiddenMsgIds, setHiddenMsgIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hollr:hidden-messages') ?? '[]') as string[]); }
    catch { return new Set(); }
  });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleHide = useCallback((msgId: string) => {
    setHiddenMsgIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) { next.delete(msgId); unhideMessage(msgId); }
      else { next.add(msgId); hideMessage(msgId); }
      return next;
    });
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasInitiallyScrolled = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const composerEmojiRef = useRef<HTMLButtonElement>(null);

  const resizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // Clear unread badge and persist read position when thread is opened
  useEffect(() => {
    clearDmUnreadCount(threadId);
  }, [threadId, clearDmUnreadCount]);

  // Whenever visible messages change, mark the latest as seen
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.id) markDmThreadRead(threadId, lastMsg.id);
  }, [messages, threadId]);

  useEffect(() => {
    hasInitiallyScrolled.current = false;
  }, [threadId]);

  useEffect(() => {
    if (messages.length === 0) return;
    if (!hasInitiallyScrolled.current) {
      hasInitiallyScrolled.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 150) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
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

  const openContextMenu = useCallback((x: number, y: number, msg: any) => {
    const isOwner = user?.id === msg.authorId;
    const isDeleted = !!(msg as any).deleted;
    if (isDeleted) return;
    const isHidden = hiddenMsgIds.has(msg.id);

    showMenu({
      x,
      y,
      title: msg.author?.displayName || msg.author?.username,
      subtitle: recipientName ? `DM with ${recipientName}` : undefined,
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
          id: 'hide',
          label: isHidden ? 'Show Message' : 'Hide for Me',
          icon: isHidden ? <Eye size={14} /> : <EyeOff size={14} />,
          onClick: () => toggleHide(msg.id),
          dividerBefore: true,
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
  }, [user, hiddenMsgIds, showMenu, threadId, recipientName, qc, setEmojiHoverMsg, startEdit, toggleHide, doDelete]);

  const handleMessageContextMenu = useCallback((e: React.MouseEvent, msg: any) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, msg);
  }, [openContextMenu]);

  const handleLongPress = useCallback((msg: any) => {
    return {
      onTouchStart: (e: React.TouchEvent) => {
        const touch = e.touches[0];
        longPressTimer.current = setTimeout(() => {
          openContextMenu(touch.clientX, touch.clientY, msg);
        }, 500);
      },
      onTouchEnd: () => {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      },
      onTouchMove: () => {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      },
    };
  }, [openContextMenu]);

  const handleAuthorContextMenu = (e: React.MouseEvent, msg: any) => {
    e.preventDefault();
    e.stopPropagation();
    const isSelf = user?.id === msg.authorId;
    const authorName = msg.author.displayName || msg.author.username;
    const cx = e.clientX;
    const cy = e.clientY;

    showMenu({
      x: cx,
      y: cy,
      actions: [
        ...(!isSelf ? [
          {
            id: 'voice-call',
            label: 'Voice Call',
            icon: <Phone size={14} />,
            onClick: () => {
              setDmCallState({
                state: 'outgoing_ringing',
                targetUserId: msg.authorId,
                targetDisplayName: authorName,
                targetAvatarUrl: msg.author.avatarUrl ?? null,
                dmThreadId: threadId,
                minimized: false,
                startedAt: null,
              });
              sendDmCallSignal({
                type: 'call_ring',
                targetId: msg.authorId,
                callerId: user?.id,
                callerName: (user as any)?.displayName || (user as any)?.username || 'Someone',
                callerAvatar: (user as any)?.avatarUrl ?? null,
                dmThreadId: threadId,
              });
            },
          },
          {
            id: 'video-call',
            label: 'Video Call',
            icon: <Video size={14} />,
            onClick: () => {
              initiateVideoCall(
                msg.authorId,
                authorName,
                msg.author.avatarUrl ?? null,
                threadId,
                {
                  id: user?.id ?? '',
                  displayName: (user as any)?.displayName || (user as any)?.username || 'Someone',
                  avatarUrl: (user as any)?.avatarUrl ?? null,
                },
              );
            },
          },
        ] : []),
        {
          id: 'view-profile',
          label: 'View Profile',
          icon: <User size={14} />,
          onClick: () => openProfileCard({ userId: msg.authorId, position: { x: cx, y: cy } }),
          dividerBefore: !isSelf,
        },
        {
          id: 'copy-username',
          label: 'Copy Username',
          icon: <Copy size={14} />,
          onClick: () => navigator.clipboard.writeText(msg.author.username || authorName),
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
      onSuccess: (newMsg) => {
        setContent('');
        if (textareaRef.current) textareaRef.current.style.height = '46px';
        qc.setQueryData<any[]>(getListDmMessagesQueryKey(threadId), (old = []) => {
          if (old.some((m: any) => m.id === newMsg.id)) return old;
          return [...old, newMsg];
        });
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
        onSuccess: (newMsg) => {
          setContent('');
          if (textareaRef.current) textareaRef.current.style.height = '46px';
          toast({ title: 'File uploaded' });
          qc.setQueryData<any[]>(getListDmMessagesQueryKey(threadId), (old = []) => {
            if (old.some((m: any) => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          });
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
      <div className="relative z-50 h-12 border-b border-border/20 flex items-center px-4 shrink-0 shadow-sm bg-surface-1">
        {/* Hamburger — toggles sidebar panel, visible at all sizes */}
        <button
          onClick={() => { if (!sidebarLocked) (layoutMode === 'classic' ? toggleClassicChannel : toggleMobileSidebar)(); }}
          className={cn('mr-1 -ml-1 p-1 transition-colors shrink-0 rounded-md', sidebarLocked ? 'text-muted-foreground/30 cursor-default' : 'text-muted-foreground hover:text-foreground')}
          title={sidebarLocked ? 'Sidebar is pinned' : 'Toggle sidebar'}
        >
          <Menu size={22} />
        </button>
        {/* Sidebar lock / pin toggle — desktop only */}
        <button
          onClick={() => { const next = !sidebarLocked; setSidebarLocked(next); if (next && layoutMode === 'classic') setClassicChannelOpen(true); }}
          className={cn('hidden sm:inline-flex mr-2 p-1 rounded transition-colors shrink-0', sidebarLocked ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground')}
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

        {/* Call buttons — right side */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {/* Active voice call chip */}
          {dmCall.state === 'connected' && dmCall.targetUserId === recipientId && (
            <button
              onClick={() => setDmCallState({ minimized: false })}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-xs font-semibold transition-colors"
              title="Return to call"
            >
              <Phone size={13} />
              <span className="hidden sm:inline">In Call</span>
            </button>
          )}

          {/* Active video call chip */}
          {videoCall.state === 'connected' && videoCall.targetUserId === recipientId && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-600/20 text-blue-400 text-xs font-semibold">
              <Video size={13} />
              <span className="hidden sm:inline">Video</span>
            </span>
          )}

          {/* Video call button */}
          {videoCall.state === 'idle' && recipientId && (
            <button
              onClick={() => {
                const callerDisplayName = (user as any)?.displayName || (user as any)?.username || 'Someone';
                const callerAvatar = (user as any)?.avatarUrl ?? null;
                initiateVideoCall(
                  recipientId,
                  recipientName,
                  recipientAvatar ?? null,
                  threadId,
                  { id: user?.id ?? '', displayName: callerDisplayName, avatarUrl: callerAvatar },
                );
              }}
              className="p-2 rounded-full text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-all active:scale-95"
              title={`Video call ${recipientName}`}
            >
              <Video size={18} />
            </button>
          )}

          {/* Voice call button */}
          {(dmCall.state === 'idle' || dmCall.targetUserId !== recipientId) && recipientId && (
            <button
              onClick={() => {
                setDmCallState({
                  state: 'outgoing_ringing',
                  targetUserId: recipientId,
                  targetDisplayName: recipientName,
                  targetAvatarUrl: recipientAvatar ?? null,
                  dmThreadId: threadId,
                  minimized: false,
                  startedAt: null,
                });
                sendDmCallSignal({
                  type: 'call_ring',
                  targetId: recipientId,
                  callerId: user?.id,
                  callerName: (user as any)?.displayName || (user as any)?.username || 'Someone',
                  callerAvatar: (user as any)?.avatarUrl ?? null,
                  dmThreadId: threadId,
                });
              }}
              className="p-2 rounded-full text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 transition-all active:scale-95"
              title={`Call ${recipientName}`}
            >
              <Phone size={18} />
            </button>
          )}

          {/* Notification bell */}
          <NotificationBell />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto flex flex-col px-3 pt-2 pb-6 gap-0 no-scrollbar">
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
          const next = messages[index + 1] as any;
          const msgDate = new Date(msg.createdAt);
          const prevDate = prev ? new Date(prev.createdAt) : null;
          const showDateSeparator = !prevDate || !isSameDay(msgDate, prevDate);

          const isFirst = index === 0
            || showDateSeparator
            || prev.authorId !== msg.authorId
            || (msgDate.getTime() - new Date(prev.createdAt).getTime() > 5 * 60000);

          const isLast = !next
            || !isSameDay(new Date(next.createdAt), msgDate)
            || next.authorId !== msg.authorId
            || (new Date(next.createdAt).getTime() - msgDate.getTime() > 5 * 60000);

          const isOwner = user?.id === msg.authorId;
          const isSupporter = !isOwner && !!(msg.author as any).isSupporter;
          const isEditing = editingId === msg.id;
          const isDeleted = !!(msg as any).deleted;
          const isHidden = hiddenMsgIds.has(msg.id);
          const reactions = (msg as any).reactions || [];
          const lp = handleLongPress(msg);
          const isBlueApple = theme === 'blueapple';
          const onDark = isOwner || isSupporter || isBlueApple;

          const bubbleBg = isOwner
            ? 'bg-primary text-primary-foreground'
            : isSupporter
              ? 'bg-[#007AFF] text-white'
              : isBlueApple
                ? 'bg-[#007AFF] text-white'
                : 'bg-muted text-foreground';

          let radius: string;
          if (isFirst && isLast) radius = 'rounded-[20px]';
          else if (isOwner) {
            if (isFirst) radius = 'rounded-[20px] rounded-br-[5px]';
            else if (isLast) radius = 'rounded-[20px] rounded-tr-[5px]';
            else radius = 'rounded-2xl rounded-r-[5px]';
          } else {
            if (isFirst) radius = 'rounded-[20px] rounded-bl-[5px]';
            else if (isLast) radius = 'rounded-[20px] rounded-tl-[5px]';
            else radius = 'rounded-2xl rounded-l-[5px]';
          }

          return (
            <Fragment key={msg.id}>
              {showDateSeparator && <DateSeparator date={msgDate} />}
              <div
                className={cn(
                  'group relative flex items-end gap-2',
                  isOwner ? 'flex-row-reverse' : 'flex-row',
                  isFirst ? 'mt-3' : 'mt-0.5',
                )}
                onMouseLeave={() => setEmojiHoverMsg(null)}
                onContextMenu={e => handleMessageContextMenu(e, msg)}
                onTouchStart={lp.onTouchStart}
                onTouchEnd={lp.onTouchEnd}
                onTouchMove={lp.onTouchMove}
              >
                {/* Avatar — others only, on last bubble in group */}
                {!isOwner && (
                  isLast ? (
                    <button
                      className="shrink-0 self-end mb-0.5"
                      onClick={e => handleAuthorContextMenu(e, msg)}
                      onContextMenu={e => handleAuthorContextMenu(e, msg)}
                    >
                      <Avatar className="h-7 w-7 hover:opacity-80 transition-opacity">
                        <AvatarImage src={msg.author.avatarUrl || undefined} />
                        <AvatarFallback className={cn('text-[11px] text-white', isSupporter ? 'bg-[#007AFF]' : 'bg-primary')}>
                          {getInitials(msg.author.displayName || msg.author.username)}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  ) : (
                    <div className="w-7 shrink-0" />
                  )
                )}

                {/* Bubble column */}
                <div className={cn('flex flex-col max-w-[72%]', isOwner ? 'items-end' : 'items-start')}>

                  {/* Author name + timestamp — others, first in group */}
                  {!isOwner && isFirst && !isDeleted && !isHidden && (
                    <div className="flex items-center gap-1.5 mb-1 ml-1">
                      <button
                        className="text-[12px] font-semibold text-foreground hover:underline"
                        onClick={e => handleAuthorContextMenu(e, msg)}
                        onContextMenu={e => handleAuthorContextMenu(e, msg)}
                      >
                        {msg.author.displayName || msg.author.username}
                      </button>
                      {(msg.author as any).isSupporter && <KhurkDiamondBadge size="sm" />}
                      <span className="text-[10px] text-muted-foreground">{format(msgDate, 'h:mm a')}</span>
                    </div>
                  )}

                  {/* Own timestamp — hover above first bubble */}
                  {isOwner && isFirst && !isDeleted && !isHidden && (
                    <div className="text-[10px] text-muted-foreground mb-0.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {format(msgDate, 'h:mm a')}
                    </div>
                  )}

                  {/* Message content */}
                  {isDeleted ? (
                    <div className="text-[13px] italic text-muted-foreground/50 px-4 py-2 bg-muted/40 rounded-[20px]">
                      Message deleted
                    </div>
                  ) : isHidden ? (
                    <button
                      onClick={() => toggleHide(msg.id)}
                      className="flex items-center gap-1.5 text-[13px] italic text-muted-foreground/50 hover:text-muted-foreground transition-colors select-none px-3 py-1.5 bg-muted/30 rounded-[20px]"
                    >
                      <EyeOff size={12} />
                      Hidden — tap to show
                    </button>
                  ) : isEditing ? (
                    <div className="flex flex-col gap-1 w-full min-w-[220px]">
                      <textarea
                        ref={editRef}
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="bg-[#383A40] rounded-xl px-3 py-2 text-foreground text-[14px] leading-relaxed resize-none w-full outline-none focus:ring-1 focus:ring-primary"
                        rows={1}
                      />
                      <div className="flex gap-2 text-xs text-muted-foreground px-1">
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
                    <>
                      {msg.content && (
                        <div className={cn('px-4 py-2 leading-relaxed break-words whitespace-pre-wrap text-[15px]', bubbleBg, radius)}>
                          {formatContent(msg.content, onDark)}
                          {msg.edited && <span className="text-[11px] opacity-60 ml-1.5 italic">(edited)</span>}
                        </div>
                      )}

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={cn('flex flex-col gap-2 mt-1', isOwner ? 'items-end' : 'items-start')}>
                          {msg.attachments.map((att: any) => {
                            const isImage = att.contentType.startsWith('image/');
                            const url = `/api/storage${att.objectPath}`;
                            if (isImage) {
                              return (
                                <a key={att.id} href={url} target="_blank" rel="noopener noreferrer"
                                  className="inline-block max-w-[280px] rounded-2xl overflow-hidden border border-border/30 bg-black/20 cursor-zoom-in hover:opacity-90 transition-opacity"
                                  onContextMenu={e => handleImageContextMenu(e, url, att.name)}>
                                  <img src={url} alt={att.name} className="block max-w-full max-h-[300px] object-contain" loading="lazy" />
                                </a>
                              );
                            }
                            return (
                              <a key={att.id} href={url} download target="_blank" rel="noreferrer"
                                className="flex items-center gap-3 p-3 bg-secondary border border-border/50 rounded-2xl hover:bg-secondary/80 transition-colors w-64">
                                <div className="bg-primary/20 p-2 rounded-lg"><FileText className="text-primary" size={20} /></div>
                                <div className="flex flex-col overflow-hidden">
                                  <span className="text-sm font-medium text-primary hover:underline truncate">{att.name}</span>
                                  <span className="text-xs text-muted-foreground">{formatBytes(att.size)}</span>
                                </div>
                                <Download className="ml-auto text-muted-foreground hover:text-foreground shrink-0" size={16} />
                              </a>
                            );
                          })}
                        </div>
                      )}

                      {/* Reactions */}
                      <DmReactionPills
                        reactions={reactions}
                        threadId={threadId}
                        messageId={msg.id}
                        showAddButton={emojiHoverMsg === msg.id}
                      />
                    </>
                  )}
                </div>

                {/* Hover action bar */}
                {!isEditing && !isDeleted && !isHidden && (
                  <div className={cn(
                    'absolute top-0 -translate-y-1/2 bg-surface-1 border border-border/30 rounded-lg shadow-lg flex items-center gap-0.5 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10',
                    isOwner ? 'left-2' : 'right-2'
                  )}>
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
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-1 relative">
        <div className="relative flex items-center gap-2">
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Attach file"
          >
            <PlusCircle size={20} className="fill-muted-foreground/10" />
          </button>
          <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

          {/* Input pill */}
          <div
            className="relative flex-1 flex items-center bg-secondary border border-border/30 rounded-[22px] px-4 py-0 shadow-sm focus-within:ring-1 focus-within:ring-primary/40 cursor-text"
            onClick={() => textareaRef.current?.focus()}
          >
            {isUploading && (
              <div
                className="absolute top-0 left-0 h-0.5 bg-primary transition-all duration-300 rounded-t-full"
                style={{ width: `${uploadProgress}%` }}
              />
            )}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => { setContent(e.target.value); resizeTextarea(e.target); }}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${recipientName}`}
              className="flex-1 bg-transparent border-0 focus:ring-0 resize-none text-foreground placeholder:text-muted-foreground/60 py-2.5 min-h-[46px] max-h-[160px] overflow-y-auto leading-normal text-[15px]"
              rows={1}
              style={{ height: '46px' }}
            />
            <div className="relative flex items-center shrink-0">
              <button
                ref={composerEmojiRef}
                onClick={() => setComposerEmojiOpen(v => !v)}
                className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                title="Add emoji"
              >
                <Smile size={19} />
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
            </div>
          </div>

          {/* Send button — filled circle */}
          <button
            onClick={handleSend}
            disabled={!content.trim() || isUploading}
            title="Send message"
            className={cn(
              'shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150',
              content.trim() && !isUploading
                ? 'bg-primary text-primary-foreground shadow-md hover:bg-primary/90 active:scale-95'
                : 'bg-muted/50 text-muted-foreground/40 cursor-not-allowed'
            )}
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {voicePanelHeight > 0 && (
        <div style={{ height: voicePanelHeight }} className="shrink-0" />
      )}
    </div>
  );
}
