import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useListMessages, useEditMessage, useDeleteMessage, useGetServer, useListServerMembers, getListMessagesQueryKey, getListDmThreadsQueryKey, type GhostMetadata } from '@workspace/api-client-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatBytes } from '@/lib/utils';
import { FileText, Download, Pencil, Trash2, Check, X, Pin, Smile, MessageSquare, Copy, ExternalLink, EyeOff, Eye, User, AtSign, Ghost, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { ReactionPills } from './ReactionPills';
import { useContextMenu } from '@/contexts/ContextMenuContext';
import { KhurkDiamondBadge } from '@/components/ui/KhurkDiamondBadge';
import { hideMessage, unhideMessage } from '@/lib/hidden-messages';
import { ghostDecrypt } from '@/lib/ghost-crypto';
import { GhostRevealModal } from '@/components/chat/GhostRevealModal';

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

function isGhostMsg(metadata: unknown): metadata is GhostMetadata {
  const m = metadata as Record<string, unknown> | null | undefined;
  return !!(m?.ghost === true && typeof m?.secretId === 'string' && typeof m?.keyBase64 === 'string');
}

function formatContent(content: string, onDark = false) {
  const parts = content.split(/(@\S+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span
        key={i}
        className={cn(
          'font-semibold px-1 rounded text-[13px]',
          onDark ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary'
        )}
      >
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

function getBubbleRadius(isOwner: boolean, isFirst: boolean, isLast: boolean): string {
  if (isFirst && isLast) return 'rounded-[20px]';
  if (isOwner) {
    if (isFirst) return 'rounded-[20px] rounded-br-[5px]';
    if (isLast)  return 'rounded-[20px] rounded-tr-[5px]';
    return 'rounded-2xl rounded-r-[5px]';
  } else {
    if (isFirst) return 'rounded-[20px] rounded-bl-[5px]';
    if (isLast)  return 'rounded-[20px] rounded-tl-[5px]';
    return 'rounded-2xl rounded-l-[5px]';
  }
}

export function MessageList({
  channelId,
  highlightedMessageId,
}: {
  channelId: string;
  highlightedMessageId?: string | null;
}) {
  const { data: messages = [], isLoading } = useListMessages(channelId, undefined, {
    query: { queryKey: getListMessagesQueryKey(channelId), refetchInterval: 2000, refetchIntervalInBackground: false },
  });
  const { mutate: editMessage } = useEditMessage();
  const { mutate: deleteMessage } = useDeleteMessage();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const { openThread, openProfileCard, chatFontSize, setActiveDmThread, triggerMention, activeServerId, theme } = useAppStore();
  const { data: server } = useGetServer(activeServerId || '', { query: { enabled: !!activeServerId } });
  const { data: serverMembers = [] } = useListServerMembers(activeServerId || '', { query: { enabled: !!activeServerId } });
  const myMemberRole = (serverMembers as any[]).find(m => m.userId === user?.id)?.role ?? null;
  const isServerMod = !!(server as any)?.ownerId && ((server as any).ownerId === user?.id || myMemberRole === 'admin');
  const { show: showMenu } = useContextMenu();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasInitiallyScrolled = useRef(false);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [emojiHoverMsg, setEmojiHoverMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [hiddenMsgIds, setHiddenMsgIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hollr:hidden-messages') ?? '[]') as string[]); }
    catch { return new Set(); }
  });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ghostRevealedContent, setGhostRevealedContent] = useState<Record<string, 'pending' | 'gone'>>({});
  const [ghostModal, setGhostModal] = useState<{ content: string } | null>(null);

  const toggleHide = useCallback((msgId: string) => {
    setHiddenMsgIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) { next.delete(msgId); unhideMessage(msgId); }
      else { next.add(msgId); hideMessage(msgId); }
      return next;
    });
  }, []);

  useEffect(() => {
    hasInitiallyScrolled.current = false;
  }, [channelId]);

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

  const handleRevealGhost = useCallback(async (messageId: string, secretId: string, keyBase64: string) => {
    if (ghostRevealedContent[messageId]) return;
    setGhostRevealedContent(prev => ({ ...prev, [messageId]: 'pending' }));
    try {
      const res = await fetch(`/api/secrets/${secretId}`, { credentials: 'include' });
      if (res.status === 410) {
        setGhostRevealedContent(prev => ({ ...prev, [messageId]: 'gone' }));
        return;
      }
      if (!res.ok) throw new Error('Failed to reveal');
      const { ciphertext, iv } = await res.json() as { ciphertext: string; iv: string };
      const plaintext = await ghostDecrypt(ciphertext, iv, keyBase64);
      setGhostRevealedContent(prev => ({ ...prev, [messageId]: 'gone' }));
      setGhostModal({ content: plaintext });
    } catch {
      setGhostRevealedContent(prev => { const n = { ...prev }; delete n[messageId]; return n; });
      toast({ title: 'Could not reveal ghost message', variant: 'destructive' });
    }
  }, [ghostRevealedContent, toast]);

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

  const openContextMenu = useCallback((x: number, y: number, msg: any) => {
    const isOwner = user?.id === msg.authorId;
    const isDeleted = !!(msg as any).deleted;
    if (isDeleted) return;
    const isHidden = hiddenMsgIds.has(msg.id);

    showMenu({
      x,
      y,
      quickReactions: (emoji) => doReact({ msgId: msg.id, emojiId: emoji }),
      title: msg.author?.displayName || msg.author?.username,
      subtitle: `#${channelId.slice(0, 6)}`,
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
          disabled: !isOwner || isGhostMsg(msg.metadata),
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
          onClick: () => handleDelete(msg.id),
          danger: true,
          disabled: !(isOwner || isServerMod),
          dividerBefore: true,
        },
      ],
    });
  }, [user, hiddenMsgIds, showMenu, doReact, channelId, openThread, startEdit, doPin, toggleHide, handleDelete, isServerMod]);

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

  const handleAuthorContextMenu = useCallback((e: React.MouseEvent, author: any, authorId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const isSelf = user?.id === authorId;
    const actions: any[] = [
      {
        id: 'view-profile',
        label: 'View Profile',
        icon: <User size={14} />,
        onClick: () => openProfileCard({ userId: authorId, position: { x: e.clientX, y: e.clientY } }),
      },
    ];
    if (!isSelf) {
      actions.push(
        {
          id: 'message',
          label: 'Message',
          icon: <MessageSquare size={14} />,
          onClick: async () => {
            try {
              const res = await fetch(`${import.meta.env.BASE_URL}api/dms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: authorId }),
              });
              if (!res.ok) throw new Error();
              const thread = await res.json();
              qc.setQueryData(getListDmThreadsQueryKey(), (old: any[]) => {
                const existing = (old || []).filter((t: any) => t.id !== thread.id);
                return [...existing, thread];
              });
              setActiveDmThread(thread.id);
            } catch { toast({ title: 'Could not open DM', variant: 'destructive' }); }
          },
        },
        {
          id: 'mention',
          label: 'Mention in Chat',
          icon: <AtSign size={14} />,
          onClick: () => triggerMention(author?.displayName || author?.username || ''),
        },
      );
    }
    actions.push(
      {
        id: 'copy-username',
        label: 'Copy Username',
        icon: <Copy size={14} />,
        onClick: () => navigator.clipboard.writeText(author?.username || ''),
        dividerBefore: true,
      },
      {
        id: 'copy-id',
        label: 'Copy User ID',
        icon: <Copy size={14} />,
        onClick: () => navigator.clipboard.writeText(authorId),
      },
    );
    showMenu({ x: e.clientX, y: e.clientY, actions });
  }, [user, openProfileCard, qc, setActiveDmThread, triggerMention, showMenu, toast]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading messages…</div>;
  }

  return (
    <div ref={scrollContainerRef} data-messages-scroll className="flex-1 overflow-y-auto flex flex-col px-3 pt-2 pb-6 gap-0 no-scrollbar">
      <div className="mt-auto" />

      {messages.length === 0 && (
        <div className="text-center py-10">
          <h2 className="text-2xl font-bold text-foreground">Welcome to the channel!</h2>
          <p className="text-muted-foreground mt-2">This is the start of a beautiful conversation.</p>
        </div>
      )}

      {messages.map((msg, index) => {
        const prev = messages[index - 1];
        const next = messages[index + 1];
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
        const isHighlighted = highlightedMessageId === msg.id;
        const isDeleted = !!(msg as any).deleted;
        const isHidden = hiddenMsgIds.has(msg.id);
        const reactions = (msg as any).reactions || [];
        const replyCount = (msg as any).replyCount || 0;
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

        const radius = getBubbleRadius(isOwner, isFirst, isLast);
        const isSelfSupporter = isOwner && !!(msg.author as any).isSupporter;
        const supporterGlow = (isSupporter || isSelfSupporter)
          ? { boxShadow: '0 0 18px 4px hsl(var(--primary) / 0.38), 0 0 6px 2px hsl(var(--primary) / 0.22)' }
          : undefined;

        return (
          <Fragment key={msg.id}>
            {showDateSeparator && <DateSeparator date={msgDate} />}

            <div
              ref={el => { messageRefs.current[msg.id] = el; }}
              className={cn(
                'group relative flex items-end gap-2',
                isOwner ? 'flex-row-reverse' : 'flex-row',
                isFirst ? 'mt-3' : 'mt-0.5',
                isHighlighted && 'bg-primary/5 rounded-2xl px-1',
              )}
              onMouseLeave={() => setEmojiHoverMsg(null)}
              onContextMenu={e => handleMessageContextMenu(e, msg)}
              onTouchStart={lp.onTouchStart}
              onTouchEnd={lp.onTouchEnd}
              onTouchMove={lp.onTouchMove}
            >
              {/* Avatar (others only) */}
              {!isOwner && (
                isLast ? (
                  <button
                    onClick={e => openProfileCard({ userId: msg.authorId, position: { x: e.clientX, y: e.clientY } })}
                    onContextMenu={e => handleAuthorContextMenu(e, msg.author, msg.authorId)}
                    className="shrink-0 self-end mb-0.5"
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
                      onClick={e => openProfileCard({ userId: msg.authorId, position: { x: e.clientX, y: e.clientY } })}
                      onContextMenu={e => handleAuthorContextMenu(e, msg.author, msg.authorId)}
                      className="text-[12px] font-semibold text-foreground hover:underline"
                    >
                      {msg.author.displayName || msg.author.username}
                    </button>
                    {(msg.author as any).isSupporter && <KhurkDiamondBadge size="sm" />}
                    <span className="text-[10px] text-muted-foreground">{format(msgDate, 'h:mm a')}</span>
                    {msg.pinned && (
                      <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-0.5">
                        <Pin size={9} className="inline" /> Pinned
                      </span>
                    )}
                  </div>
                )}

                {/* Own: timestamp shown on hover above first bubble */}
                {isOwner && isFirst && !isDeleted && !isHidden && (
                  <div className="text-[10px] text-muted-foreground mb-0.5 mr-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                    {msg.pinned && (
                      <span className="text-amber-400 flex items-center gap-0.5">
                        <Pin size={9} className="inline" /> Pinned
                      </span>
                    )}
                    {format(msgDate, 'h:mm a')}
                  </div>
                )}

                {/* Message content */}
                {isDeleted ? (
                  <div className="text-[13px] italic text-muted-foreground/50 px-4 py-2 bg-muted/40 rounded-[20px]">
                    Message deleted
                  </div>
                ) : isGhostMsg(msg.metadata) ? (
                  (() => {
                    const { secretId, keyBase64, targetUserId } = msg.metadata as GhostMetadata;
                    const revealed = ghostRevealedContent[msg.id];
                    const isSender = isOwner;
                    const isTarget = !!targetUserId && user?.id === targetUserId;
                    const targetMember = targetUserId
                      ? (serverMembers as any[]).find(m => m.userId === targetUserId)
                      : null;
                    const targetName = targetMember
                      ? (targetMember.user?.displayName || targetMember.user?.username || 'someone')
                      : 'someone';

                    if (revealed === 'gone') {
                      return (
                        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 rounded-[20px] text-[13px] text-muted-foreground/60 italic select-none">
                          <Ghost size={14} />
                          Ghost message — self-destructed
                        </div>
                      );
                    }

                    if (isSender && targetUserId) {
                      return (
                        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-[20px] text-[13px] text-primary/70 select-none">
                          <Ghost size={13} />
                          👻 You sent a ghost to @{targetName}
                        </div>
                      );
                    }

                    if (targetUserId && !isTarget) {
                      return (
                        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 rounded-[20px] text-[13px] text-muted-foreground/60 italic select-none">
                          <Ghost size={13} />
                          👻 Ghost for @{targetName}
                        </div>
                      );
                    }

                    return (
                      <button
                        onClick={() => void handleRevealGhost(msg.id, secretId, keyBase64)}
                        disabled={revealed === 'pending'}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5 rounded-[20px] text-[13px] font-medium transition-all select-none',
                          revealed === 'pending'
                            ? 'bg-primary/20 text-primary/60 cursor-wait'
                            : 'bg-primary/15 text-primary hover:bg-primary/25 active:scale-[0.97] cursor-pointer'
                        )}
                      >
                        <Lock size={13} />
                        {revealed === 'pending' ? 'Revealing…' : '👻 Ghost Message — tap to reveal'}
                      </button>
                    );
                  })()
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
                    {/* Text bubble */}
                    {msg.content && (
                      <div
                        className={cn(
                          'px-4 py-2 leading-relaxed break-words whitespace-pre-wrap',
                          chatFontSize === 'sm' ? 'text-[13px]' : chatFontSize === 'lg' ? 'text-lg' : 'text-[15px]',
                          bubbleBg,
                          radius,
                          msg.pinned && 'ring-1 ring-amber-400/60',
                        )}
                        style={supporterGlow}
                      >
                        {formatContent(msg.content, onDark)}
                        {msg.edited && (
                          <span className="text-[11px] opacity-60 ml-1.5 italic">(edited)</span>
                        )}
                      </div>
                    )}

                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={cn('flex flex-col gap-2 mt-1', isOwner ? 'items-end' : 'items-start')}>
                        {msg.attachments.map(att => {
                          const isImage = att.contentType.startsWith('image/');
                          const url = `/api/storage${att.objectPath}`;
                          if (isImage) {
                            return (
                              <a
                                key={att.id}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block max-w-[280px] rounded-2xl overflow-hidden border border-border/30 bg-black/20 cursor-zoom-in hover:opacity-90 transition-opacity"
                                style={supporterGlow}
                                onContextMenu={e => handleImageContextMenu(e, url, att.name)}
                              >
                                <img
                                  src={url}
                                  alt={att.name}
                                  className="block max-w-full max-h-[300px] object-contain"
                                  loading="lazy"
                                />
                              </a>
                            );
                          }
                          return (
                            <a
                              key={att.id}
                              href={url}
                              download
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 p-3 bg-secondary border border-border/50 rounded-2xl hover:bg-secondary/80 transition-colors w-64"
                              style={supporterGlow}
                            >
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
                    <ReactionPills
                      reactions={reactions}
                      channelId={channelId}
                      messageId={msg.id}
                      showAddButton={emojiHoverMsg === msg.id}
                    />

                    {/* Thread reply count */}
                    {replyCount > 0 && (
                      <button
                        onClick={() => openThread(channelId, msg.id)}
                        className="mt-1 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 hover:underline w-fit"
                      >
                        <MessageSquare size={12} />
                        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Hover action bar — floats above the message row */}
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
                  <button
                    onClick={() => openThread(channelId, msg.id)}
                    title="Reply in thread"
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                  >
                    <MessageSquare size={14} />
                  </button>
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
                  {isOwner && (
                    <button
                      onClick={() => startEdit(msg.id, msg.content)}
                      title="Edit"
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {(isOwner || isServerMod) && (
                    <button
                      onClick={() => handleDelete(msg.id)}
                      title="Delete"
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </Fragment>
        );
      })}

      <div ref={bottomRef} />

      {ghostModal && (
        <GhostRevealModal
          content={ghostModal.content}
          onClose={() => setGhostModal(null)}
        />
      )}
    </div>
  );
}
